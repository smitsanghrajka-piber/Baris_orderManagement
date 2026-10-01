import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ActorType, File as FileRow } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { StorageDriver, SignedUrlOptions } from './drivers/driver';
import { LocalStorageDriver } from './drivers/local.driver';
import { SupabaseStorageDriver } from './drivers/supabase.driver';
import { EXTENSION_FAMILIES, EXTENSION_MIME, extensionOf, sanitiseFilename, sniff } from './mime-sniff';
import { ValidationError } from '../errors/domain-error';
import { AuthUser } from '../auth/auth-user';

export const BUCKETS = {
  ARTWORK: 'artwork-files',
  ATTACHMENTS: 'attachments',
  QC: 'qc-media',
  DOCUMENTS: 'generated-documents',
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

/** Extensions accepted per purpose. */
export const ALLOWED_EXTENSIONS = {
  artwork: ['pdf', 'ai', 'eps', 'psd', 'tif', 'tiff', 'jpg', 'jpeg', 'png', 'svg', 'zip'],
  attachment: ['pdf', 'ai', 'eps', 'psd', 'tif', 'tiff', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'zip', 'docx', 'xlsx', 'pptx', 'csv', 'txt', 'md', 'json'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
} as const;
export type UploadPurpose = keyof typeof ALLOWED_EXTENSIONS;

export interface StoreFileInput {
  bucket: Bucket;
  /** Key prefix, e.g. customers/<id>/artworks/<no>/v3 */
  keyPrefix: string;
  originalName: string;
  body: Buffer;
  purpose: UploadPurpose;
  actor: AuthUser | { kind: 'SYSTEM' };
  /** Tenant tag; null = internal-only. */
  customerId: string | null;
}

export interface StoredFile {
  file: FileRow;
  duplicateOf: FileRow | null;
}

/**
 * Single entry point for binary content (architecture §11): validates the
 * upload, computes sha256, writes the object under an immutable key, and
 * inserts the File row through the caller's transaction. If the DB write
 * fails the object is removed. Duplicate content within the same customer
 * is reported (never blocked).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name);
  readonly driver: StorageDriver;
  readonly maxBytes: number;

  constructor(private readonly prisma: PrismaService) {
    const driverName = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
    this.maxBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB ?? 50)) * 1024 * 1024;
    if (driverName === 'supabase') {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      this.driver = new SupabaseStorageDriver(url, key);
    } else {
      const apiBase = process.env.API_PUBLIC_BASE ?? `http://localhost:${process.env.PORT ?? 3000}/api/v1`;
      this.driver = new LocalStorageDriver(process.env.STORAGE_DIR ?? './storage', apiBase, process.env.JWT_SECRET ?? 'dev');
    }
  }

  async onModuleInit() {
    for (const b of Object.values(BUCKETS)) {
      try { await this.driver.ensureBucket(b); } catch (e) { this.log.warn(`bucket ${b}: ${(e as Error).message}`); }
    }
    this.log.log(`storage driver: ${this.driver.name}`);
  }

  /** Validate size, extension and sniffed content. Returns the canonical MIME type. */
  validate(originalName: string, body: Buffer, purpose: UploadPurpose): { ext: string; mimeType: string } {
    if (!body || body.length === 0) throw new ValidationError('The uploaded file is empty.');
    if (body.length > this.maxBytes) throw new ValidationError(`The file is larger than the ${Math.round(this.maxBytes / 1024 / 1024)} MB limit.`);
    const ext = extensionOf(originalName);
    const allowed = ALLOWED_EXTENSIONS[purpose] as readonly string[];
    if (!ext || !allowed.includes(ext)) throw new ValidationError(`File type .${ext || '?'} is not accepted here. Accepted: ${allowed.map((e) => '.' + e).join(', ')}.`);
    const family = sniff(body);
    const families = EXTENSION_FAMILIES[ext] ?? [];
    if (!family || !families.includes(family)) {
      throw new ValidationError(`The content of "${sanitiseFilename(originalName)}" does not look like a .${ext} file.`);
    }
    return { ext, mimeType: EXTENSION_MIME[ext] };
  }

  sha256(body: Buffer): string {
    return createHash('sha256').update(body).digest('hex');
  }

  /**
   * Store bytes + insert the File row. Pass the transaction the owning row is
   * created in so a failed business write also removes the object.
   */
  async store(tx: Tx | PrismaService, input: StoreFileInput): Promise<StoredFile> {
    const { ext, mimeType } = this.validate(input.originalName, input.body, input.purpose);
    const sha256 = this.sha256(input.body);
    const safeName = sanitiseFilename(input.originalName);
    const id = randomUUID();
    const key = `${input.keyPrefix.replace(/^\/+|\/+$/g, '')}/${id}.${ext}`;

    const duplicateOf = input.customerId
      ? await tx.file.findFirst({ where: { sha256, customerId: input.customerId }, orderBy: { createdAt: 'asc' } })
      : null;

    await this.driver.put(input.bucket, key, input.body, mimeType);
    try {
      const actorType: ActorType = input.actor.kind === 'SYSTEM' ? 'SYSTEM' : input.actor.kind === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
      const file = await tx.file.create({
        data: {
          id,
          bucket: input.bucket,
          storageKey: key,
          originalName: safeName,
          mimeType,
          sizeBytes: input.body.length,
          sha256,
          uploadedByActorType: actorType,
          uploadedByUserId: actorType === 'STAFF' ? (input.actor as AuthUser).id : null,
          uploadedByCustomerUserId: actorType === 'CUSTOMER' ? (input.actor as AuthUser).id : null,
          customerId: input.customerId,
        },
      });
      return { file, duplicateOf };
    } catch (err) {
      await this.driver.delete(input.bucket, key).catch(() => undefined);
      throw err;
    }
  }

  async signedUrl(file: Pick<FileRow, 'bucket' | 'storageKey' | 'originalName' | 'mimeType'>, opts?: Partial<SignedUrlOptions>): Promise<string> {
    // SVG is always forced to download so it can never execute in-origin.
    const forceDownload = file.mimeType === 'image/svg+xml' || opts?.download === true;
    return this.driver.getSignedUrl(file.bucket, file.storageKey, {
      expiresInSeconds: opts?.expiresInSeconds ?? 60,
      filename: opts?.filename ?? file.originalName,
      download: forceDownload,
    });
  }

  /** Remove stored objects with no File row, older than 24 h (crash between put and commit). */
  async deleteObject(bucket: string, key: string) {
    await this.driver.delete(bucket, key);
  }
}
