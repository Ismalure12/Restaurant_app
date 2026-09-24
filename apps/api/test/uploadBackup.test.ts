import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

// The S3 SDK is faked at the edge: `send` records each PutObjectCommand's input.
const s3 = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = s3.send; },
  PutObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
}));

const { uploadBackup, readAll } = await import('../src/cli/uploadBackup.js');
const { uploadPrivateObject } = await import('../src/lib/storage/s3.js');

beforeEach(() => {
  s3.send.mockReset().mockResolvedValue({});
  vi.stubEnv('S3_BUCKET_NAME', 'img-bucket');
  vi.stubEnv('AWS_REGION', 'ap-south-1');
  vi.stubEnv('BACKUP_S3_BUCKET', '');
});

describe('S3 backup upload', () => {
  it('stores the dump privately, encrypted, under backups/', async () => {
    const out = await uploadBackup('maqaaxi-2026-09-24-0315.dump', Readable.from([Buffer.from('PGDMP'), Buffer.from('rest')]));
    expect(out).toEqual({ bucket: 'img-bucket', key: 'backups/maqaaxi-2026-09-24-0315.dump' });
    const { input } = s3.send.mock.calls[0][0];
    expect(input.Key).toBe('backups/maqaaxi-2026-09-24-0315.dump');
    expect(input.ServerSideEncryption).toBe('AES256');
    expect(input.CacheControl).toBeUndefined();
    expect(String(input.Body)).toBe('PGDMPrest');
  });

  it('BACKUP_S3_BUCKET sends backups to their own bucket', async () => {
    vi.stubEnv('BACKUP_S3_BUCKET', 'backup-bucket');
    await uploadBackup('a.dump', Readable.from([Buffer.from('x')]));
    expect(s3.send.mock.calls[0][0].input.Bucket).toBe('backup-bucket');
  });

  it('rejects a bad name, an empty dump, an oversized one and the public prefix', async () => {
    await expect(uploadBackup('../etc/passwd', Readable.from([Buffer.from('x')]))).rejects.toThrow(/usage/);
    await expect(uploadBackup(undefined, Readable.from([Buffer.from('x')]))).rejects.toThrow(/usage/);
    await expect(uploadBackup('a.dump', Readable.from([]))).rejects.toThrow(/empty/);
    await expect(readAll(Readable.from([Buffer.alloc(10)]), 5)).rejects.toThrow(/larger/);
    await expect(uploadPrivateObject('menu/x.dump', Buffer.from('x'))).rejects.toThrow(/menu/);
    expect(s3.send).not.toHaveBeenCalled();
  });

  it('an S3 failure surfaces (the script exits 1)', async () => {
    s3.send.mockRejectedValue(new Error('AccessDenied'));
    await expect(uploadBackup('a.dump', Readable.from([Buffer.from('x')]))).rejects.toThrow(/AccessDenied/);
  });
});
