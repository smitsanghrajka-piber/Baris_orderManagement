import { createHmac, timingSafeEqual } from 'crypto';
import { createReadStream } from 'fs';
import { access, mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { Readable } from 'stream';
import { StorageDriver, SignedUrlOptions } from './driver';

/**
 * Development / test driver: objects under STORAGE_DIR/<bucket>/<key>.
 * "Signed URLs" are API routes carrying an HMAC over (bucket, key, expiry,
 * disposition) so the same short-lived, unguessable contract holds locally.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(rootDir: string, private readonly apiBase: string, private readonly secret: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(bucket: string, key: string): string {
    const p = resolve(join(this.root, bucket, key));
    if (!p.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return p;
  }

  async ensureBucket(bucket: string): Promise<void> {
    await mkdir(join(this.root, bucket), { recursive: true });
  }

  async put(bucket: string, key: string, body: Buffer): Promise<void> {
    const p = this.pathFor(bucket, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body, { flag: 'wx' }); // never overwrite
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try { await access(this.pathFor(bucket, key)); return true; } catch { return false; }
  }

  async delete(bucket: string, key: string): Promise<void> {
    await rm(this.pathFor(bucket, key), { force: true });
  }

  getStream(bucket: string, key: string): Readable {
    return createReadStream(this.pathFor(bucket, key));
  }

  sign(bucket: string, key: string, exp: number, disposition: string): string {
    return createHmac('sha256', this.secret).update(`${bucket}\n${key}\n${exp}\n${disposition}`).digest('base64url');
  }

  verify(bucket: string, key: string, exp: number, disposition: string, sig: string): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    const expected = Buffer.from(this.sign(bucket, key, exp, disposition));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async getSignedUrl(bucket: string, key: string, opts: SignedUrlOptions): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + opts.expiresInSeconds;
    const disposition = opts.download ? `attachment; filename="${opts.filename ?? 'file'}"` : `inline; filename="${opts.filename ?? 'file'}"`;
    const sig = this.sign(bucket, key, exp, disposition);
    const q = new URLSearchParams({ bucket, key, exp: String(exp), d: disposition, sig });
    return `${this.apiBase}/files/local?${q.toString()}`;
  }
}
