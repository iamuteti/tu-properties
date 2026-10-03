import { Readable } from 'stream';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { FileStorage } from './file-storage.interface';

/**
 * Filesystem storage driver (default). Files live under `rootDir` with the
 * given key as a relative path, so a document's key is stable and portable.
 */
export class LocalFileStorage implements FileStorage {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    // Guard against path traversal: keys are server-generated, but never
    // trust a key that ends up escaping the storage root.
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(path.resolve(this.rootDir))) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return resolved;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, data);
  }

  async openStream(key: string): Promise<Readable> {
    return new Promise((resolveFn, rejectFn) => {
      const stream = fs.createReadStream(this.resolve(key));
      stream.once('open', () => resolveFn(stream));
      stream.once('error', rejectFn);
    });
  }

  async remove(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { force: true }).catch(() => undefined);
  }
}
