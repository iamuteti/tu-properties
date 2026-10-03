import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { FILE_STORAGE } from './storage/file-storage.interface';
import { LocalFileStorage } from './storage/local-storage';
import { S3FileStorage } from './storage/s3-storage';

/**
 * Provides the configured FileStorage implementation (env-driven):
 * - default / STORAGE_DRIVER=local  → LocalFileStorage (STORAGE_DIR, default
 *   `<cwd>/uploads`, matching main.ts's uploads dir creation)
 * - STORAGE_DRIVER=s3              → S3FileStorage (AWS or MinIO via
 *   S3_ENDPOINT; S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY,
 *   S3_FORCE_PATH_STYLE)
 */
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = (
          config.get<string>('STORAGE_DRIVER') || 'local'
        ).toLowerCase();
        if (driver === 's3') {
          const bucket = config.get<string>('S3_BUCKET');
          if (!bucket) {
            throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
          }
          return new S3FileStorage({
            endpoint: config.get<string>('S3_ENDPOINT'),
            region: config.get<string>('S3_REGION') || 'us-east-1',
            bucket,
            accessKeyId: config.get<string>('S3_ACCESS_KEY'),
            secretAccessKey: config.get<string>('S3_SECRET_KEY'),
            forcePathStyle:
              config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
          });
        }
        const rootDir =
          config.get<string>('STORAGE_DIR') ||
          path.join(process.cwd(), 'uploads');
        return new LocalFileStorage(rootDir);
      },
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
