import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Readable } from 'stream';
import { StorageDriver, SignedUrlOptions } from './driver';

/**
 * Supabase Storage driver. Buckets are private; the service-role key never
 * leaves the server. Uploads use upsert:false so a key can never be
 * overwritten.
 */
export class SupabaseStorageDriver implements StorageDriver {
  readonly name = 'supabase';
  private readonly client: SupabaseClient;
  private readonly ensured = new Set<string>();

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async ensureBucket(bucket: string): Promise<void> {
    if (this.ensured.has(bucket)) return;
    const { data } = await this.client.storage.getBucket(bucket);
    if (!data) {
      const { error } = await this.client.storage.createBucket(bucket, { public: false });
      if (error && !/already exists/i.test(error.message)) throw new Error(`Supabase bucket ${bucket}: ${error.message}`);
    }
    this.ensured.add(bucket);
  }

  async put(bucket: string, key: string, body: Buffer, mimeType?: string): Promise<void> {
    await this.ensureBucket(bucket);
    const { error } = await this.client.storage.from(bucket).upload(key, body, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
    const name = key.slice(key.lastIndexOf('/') + 1);
    const { data } = await this.client.storage.from(bucket).list(dir, { search: name, limit: 1 });
    return !!data?.some((f) => f.name === name);
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.storage.from(bucket).remove([key]);
  }

  async getStream(bucket: string, key: string): Promise<Readable> {
    const { data, error } = await this.client.storage.from(bucket).download(key);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? 'no data'}`);
    return Readable.from(Buffer.from(await data.arrayBuffer()));
  }

  async getSignedUrl(bucket: string, key: string, opts: SignedUrlOptions): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(key, opts.expiresInSeconds, opts.download ? { download: opts.filename ?? true } : undefined);
    if (error || !data) throw new Error(`Supabase signed URL failed: ${error?.message ?? 'no data'}`);
    return data.signedUrl;
  }
}
