/**
 * Server-side content sniffing by magic bytes. The client's declared MIME
 * type is never trusted. Returns the detected family or null when unknown.
 * Extension → MIME allow-lists live in StorageService.
 */
export type SniffedType =
  | 'pdf' | 'png' | 'jpeg' | 'gif' | 'tiff' | 'psd' | 'postscript' | 'svg' | 'zip' | 'text' | 'webp';

export function sniff(buffer: Buffer): SniffedType | null {
  if (buffer.length < 4) return null;
  const b = buffer;
  const startsWith = (sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
  const head = b.subarray(0, Math.min(b.length, 512)).toString('latin1');

  if (startsWith([0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith([0x49, 0x49, 0x2a, 0x00]) || startsWith([0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (startsWith([0x38, 0x42, 0x50, 0x53])) return 'psd'; // 8BPS
  if (startsWith([0x25, 0x21, 0x50, 0x53])) return 'postscript'; // %!PS (EPS, legacy AI)
  if (startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06])) return 'zip';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const trimmed = head.replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[\s\S]{0,300}?)?<svg[\s>]/i.test(trimmed)) return 'svg';
  // Plain text heuristic: no NUL bytes in the first 512 bytes.
  if (!head.includes('\u0000')) return 'text';
  return null;
}

/** Which sniffed families are acceptable for a given (lower-case) extension. */
export const EXTENSION_FAMILIES: Record<string, SniffedType[]> = {
  pdf: ['pdf'],
  ai: ['pdf', 'postscript'], // modern AI files are PDF-compatible; legacy are PostScript
  eps: ['postscript', 'pdf'],
  ps: ['postscript'],
  psd: ['psd'],
  tif: ['tiff'],
  tiff: ['tiff'],
  jpg: ['jpeg'],
  jpeg: ['jpeg'],
  png: ['png'],
  gif: ['gif'],
  webp: ['webp'],
  svg: ['svg'],
  zip: ['zip'],
  docx: ['zip'],
  xlsx: ['zip'],
  pptx: ['zip'],
  csv: ['text'],
  txt: ['text'],
  md: ['text'],
  json: ['text'],
};

export const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  ai: 'application/postscript',
  eps: 'application/postscript',
  ps: 'application/postscript',
  psd: 'image/vnd.adobe.photoshop',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
};

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** Filename safe for storage keys and Content-Disposition: ASCII, no path separators. */
export function sanitiseFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
  const cleaned = base.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 180) || 'file';
}
