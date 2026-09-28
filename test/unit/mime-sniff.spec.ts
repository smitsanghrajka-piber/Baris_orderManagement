import { extensionOf, sanitiseFilename, sniff } from '../../src/common/storage/mime-sniff';

describe('sniff', () => {
  it('detects common families by magic bytes', () => {
    expect(sniff(Buffer.from('%PDF-1.7\n…'))).toBe('pdf');
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('png');
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpeg');
    expect(sniff(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0]))).toBe('tiff');
    expect(sniff(Buffer.from('8BPS\u0001'))).toBe('psd');
    expect(sniff(Buffer.from('%!PS-Adobe-3.0 EPSF-3.0'))).toBe('postscript');
    expect(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('zip');
    expect(sniff(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg">'))).toBe('svg');
    expect(sniff(Buffer.from('a,b,c\n1,2,3\n'))).toBe('text');
  });

  it('returns null for unknown binary and tiny buffers', () => {
    expect(sniff(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0x00]))).toBeNull();
    expect(sniff(Buffer.from([0x01]))).toBeNull();
  });
});

describe('filenames', () => {
  it('extracts extensions and sanitises names', () => {
    expect(extensionOf('Label Front.FINAL.PDF')).toBe('pdf');
    expect(extensionOf('noext')).toBe('');
    expect(sanitiseFilename('../..\\evil:name?.pdf')).toBe('evil_name_.pdf');
    expect(sanitiseFilename('Étiquette  café.ai')).toBe('Etiquette cafe.ai');
  });
});
