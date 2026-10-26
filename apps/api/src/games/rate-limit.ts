import { SOCKET_RATE_LIMIT_BUCKET, SOCKET_RATE_LIMIT_REFILL_PER_SECOND } from '@quizpulse/protocol';

interface Bucket {
    tokens: number;
    updatedAt: number;
}

/**
 * Token bucket per socket: up to `SOCKET_RATE_LIMIT_BUCKET` events in a burst, refilled continuously at
 * `SOCKET_RATE_LIMIT_REFILL_PER_SECOND`. A socket lives in one process, so the buckets stay in memory.
 */
export class SocketRateLimiter {
    private readonly buckets = new Map<string, Bucket>();

    constructor(private readonly now: () => number = () => performance.now()) {}

    /** Spends one token; false when the socket has none left. */
    take(socketId: string): boolean {
        const now = this.now();
        const bucket = this.buckets.get(socketId) ?? { tokens: SOCKET_RATE_LIMIT_BUCKET, updatedAt: now };
        const refilled = ((now - bucket.updatedAt) / 1000) * SOCKET_RATE_LIMIT_REFILL_PER_SECOND;
        bucket.tokens = Math.min(SOCKET_RATE_LIMIT_BUCKET, bucket.tokens + refilled);
        bucket.updatedAt = now;
        this.buckets.set(socketId, bucket);
        if (bucket.tokens < 1) return false;
        bucket.tokens -= 1;
        return true;
    }

    forget(socketId: string): void {
        this.buckets.delete(socketId);
    }
}
