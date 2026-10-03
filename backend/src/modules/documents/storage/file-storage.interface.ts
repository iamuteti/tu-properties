import { Readable } from 'stream';

/**
 * Storage abstraction for the Document Center (Module 1: Core Platform).
 *
 * Two drivers are supported:
 * - `local` (default): files under a directory on disk (STORAGE_DIR).
 * - `s3`: any S3-compatible endpoint, including MinIO (STORAGE_DRIVER=s3).
 *
 * Every later module's attachment/document need resolves through this
 * interface, so swapping or scaling storage is a config change, not a code
 * change.
 */
export interface FileStorage {
  /** Persist a file under an opaque key. Keys must be unique. */
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Open a read stream for a stored key. */
  openStream(key: string): Promise<Readable>;
  /** Remove a stored key. Implementations should not throw when the key is
   *  already gone (idempotent delete). */
  remove(key: string): Promise<void>;
}

export const FILE_STORAGE = 'FILE_STORAGE';
