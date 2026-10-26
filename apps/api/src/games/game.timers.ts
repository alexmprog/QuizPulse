import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { TimerKind } from '@quizpulse/game-engine';
import { DelayedError, type Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export const TIMER_QUEUE = 'game-timers';
/** Timer jobs processed in parallel. */
export const WORKER_CONCURRENCY = 8;

interface TimerJob {
    gameId: string;
    timer: TimerKind;
    epoch: number;
    /** Due time on the app clock. */
    at: number;
}

type FireHandler = (gameId: string, timer: TimerKind, epoch: number) => Promise<void>;

/**
 * Game timers as BullMQ delayed jobs: they live in Redis, so they survive a restart, and the job id
 * `${gameId}:${timer}:${epoch}` makes scheduling the same timer twice a no-op.
 */
@Injectable()
export class GameTimers implements OnModuleDestroy {
    private readonly logger = new Logger(GameTimers.name);
    // BullMQ needs connections that retry forever instead of failing commands.
    private readonly queueConnection: Redis;
    private readonly queue: Queue<TimerJob>;
    private worker: { instance: Worker<TimerJob>; connection: Redis } | null = null;

    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        @Inject(CLOCK) private readonly clock: Clock,
    ) {
        this.queueConnection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
        this.queue = new Queue<TimerJob>(TIMER_QUEUE, { connection: this.queueConnection });
    }

    async schedule(gameId: string, timer: TimerKind, epoch: number, at: number): Promise<void> {
        await this.queue.add(
            timer,
            { gameId, timer, epoch, at },
            {
                jobId: `${gameId}:${timer}:${String(epoch)}`,
                delay: Math.max(0, at - this.clock.now()),
                attempts: 3,
                backoff: { type: 'exponential', delay: 500 },
                removeOnComplete: true,
                removeOnFail: 1000,
            },
        );
    }

    /** Starts the worker; `handler` runs once per due timer (a throw makes BullMQ retry it). */
    onFire(handler: FireHandler): void {
        if (this.worker) throw new Error('timer handler already registered');
        const connection = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });
        const instance = new Worker<TimerJob>(TIMER_QUEUE, (job, token) => this.process(job, token, handler), {
            connection,
            // Games do not wait for each other (e.g. behind a slow history save); commands for one game still
            // run one at a time behind the per-game lock.
            concurrency: WORKER_CONCURRENCY,
        });
        instance.on('failed', (job, error) => {
            this.logger.error(`timer ${job?.id ?? '?'} failed: ${error.message}`);
        });
        this.worker = { instance, connection };
    }

    async onModuleDestroy(): Promise<void> {
        // BullMQ leaves connections it was handed open, so they are closed here.
        if (this.worker) {
            await this.worker.instance.close();
            await this.worker.connection.quit();
        }
        await this.queue.close();
        await this.queueConnection.quit();
    }

    private async process(job: Job<TimerJob>, token: string | undefined, handler: FireHandler): Promise<void> {
        const { gameId, timer, epoch, at } = job.data;
        const early = at - this.clock.now();
        if (early > 0) {
            // The reducer ignores a deadline that has not passed yet, so a job that fires early waits for its time.
            await job.moveToDelayed(Date.now() + early, token);
            throw new DelayedError();
        }
        await handler(gameId, timer, epoch);
    }
}
