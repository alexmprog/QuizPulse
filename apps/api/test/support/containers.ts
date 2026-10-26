import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { MinioContainer } from '@testcontainers/minio';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import type { AppConfig } from '../../src/config/config.js';

export interface Infra {
    databaseUrl: string;
    redisUrl: string;
    s3: AppConfig['s3'];
    stop(): Promise<void>;
}

// Keep in sync with compose.yaml.
const POSTGRES_IMAGE = 'postgres:17.11';
const REDIS_IMAGE = 'redis:7.4.11';
// minio/minio is no longer published on Docker Hub or Quay; Chainguard's build is pinned by digest instead.
const MINIO_IMAGE = 'chainguard/minio@sha256:d88920d6a50bd0b088223b688be3b76c63e6205dbe494437f67ba1240ea12880';
export const TEST_BUCKET = 'quizpulse-images';

/** Starts Postgres, Redis and MinIO in parallel. Call once per test file and `stop()` in `afterAll`. */
export async function startInfra(): Promise<Infra> {
    const [postgres, redis, minio] = await Promise.all([
        new PostgreSqlContainer(POSTGRES_IMAGE).start(),
        new RedisContainer(REDIS_IMAGE).start(),
        new MinioContainer(MINIO_IMAGE).start(),
    ]);
    const s3: AppConfig['s3'] = {
        endpoint: minio.getConnectionUrl(),
        region: 'us-east-1',
        accessKey: minio.getUsername(),
        secretKey: minio.getPassword(),
        bucket: TEST_BUCKET,
    };
    await createBucket(s3);
    return {
        databaseUrl: postgres.getConnectionUri(),
        redisUrl: `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`,
        s3,
        async stop() {
            await Promise.all([postgres.stop(), redis.stop(), minio.stop()]);
        },
    };
}

async function createBucket(s3: AppConfig['s3']): Promise<void> {
    const client = new S3Client({
        endpoint: s3.endpoint,
        region: s3.region,
        forcePathStyle: true,
        credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    });
    try {
        await client.send(new CreateBucketCommand({ Bucket: s3.bucket }));
    } finally {
        client.destroy();
    }
}
