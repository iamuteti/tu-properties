import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { FileStorage } from './file-storage.interface';

export interface S3StorageOptions {
  endpoint?: string; // required for MinIO; omit for AWS
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Path-style URLs — required for MinIO, optional elsewhere. */
  forcePathStyle?: boolean;
}

/**
 * S3-compatible storage driver (AWS S3, MinIO, any S3 API endpoint).
 * Configure via env: STORAGE_DRIVER=s3, S3_ENDPOINT, S3_REGION, S3_BUCKET,
 * S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE.
 */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? true,
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async save(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async openStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    // The S3 client's GetObject body is an async iterable of body chunks on
    // Node; wrap it in a Readable so the controller can stream it verbatim.
    if (!response.Body) {
      throw new Error(`Document object not found: ${key}`);
    }
    return Readable.from(response.Body as AsyncIterable<Uint8Array>);
  }

  async remove(key: string): Promise<void> {
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch(() => undefined);
  }
}
