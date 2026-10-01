import { Readable } from 'stream';

export interface SignedUrlOptions {
  expiresInSeconds: number;
  filename?: string;
  /** true → Content-Disposition: attachment (forced download) */
  download?: boolean;
}

export interface StorageDriver {
  readonly name: string;
  ensureBucket(bucket: string): Promise<void>;
  /** Must fail if the key already exists — keys are immutable. */
  put(bucket: string, key: string, body: Buffer, mimeType?: string): Promise<void>;
  exists(bucket: string, key: string): Promise<boolean>;
  delete(bucket: string, key: string): Promise<void>;
  getStream(bucket: string, key: string): Readable | Promise<Readable>;
  getSignedUrl(bucket: string, key: string, opts: SignedUrlOptions): Promise<string>;
}
