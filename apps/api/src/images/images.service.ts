import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { images } from '../db/schema.js';
import { sniffImageType } from './image-signature.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UploadedFile {
    buffer: Buffer;
}

@Injectable()
export class ImagesService implements OnModuleDestroy {
    private readonly s3: S3Client;

    constructor(
        @Inject(DB) private readonly db: Database,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
    ) {
        this.s3 = new S3Client({
            endpoint: config.s3.endpoint,
            region: config.s3.region,
            forcePathStyle: true, // MinIO addresses buckets by path, not by subdomain
            credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
        });
    }

    onModuleDestroy(): void {
        this.s3.destroy();
    }

    async upload(hostId: string, file: UploadedFile): Promise<{ id: string; url: string }> {
        const contentType = sniffImageType(file.buffer);
        if (!contentType) throw new AppError('IMAGE_TYPE_UNSUPPORTED', 415);
        const id = randomUUID();
        const objectKey = `images/${id}`;
        await this.s3.send(
            new PutObjectCommand({
                Bucket: this.config.s3.bucket,
                Key: objectKey,
                Body: file.buffer,
                ContentType: contentType,
            }),
        );
        await this.db
            .insert(images)
            .values({ id, ownerId: hostId, objectKey, contentType, sizeBytes: file.buffer.length });
        return { id, url: `/api/v1/images/${id}` };
    }

    async stream(id: string): Promise<{ body: Readable; contentType: string }> {
        const [row] = UUID.test(id) ? await this.db.select().from(images).where(eq(images.id, id)).limit(1) : [];
        if (!row) throw new AppError('NOT_FOUND', 404);
        try {
            const object = await this.s3.send(
                new GetObjectCommand({ Bucket: this.config.s3.bucket, Key: row.objectKey }),
            );
            return { body: object.Body as Readable, contentType: row.contentType };
        } catch (error) {
            if (error instanceof S3ServiceException && error.name === 'NoSuchKey') throw new AppError('NOT_FOUND', 404);
            throw error;
        }
    }
}
