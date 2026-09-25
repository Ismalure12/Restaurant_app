import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createPrismaMock, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
const s3 = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = s3.send; },
  PutObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
}));

const { resizeImages } = await import('../src/cli/resizeImages.js');

const OLD = 'https://b.s3.ap-south-1.amazonaws.com/menu/1700000000-abcd1234.webp';
const NEW = 'https://b.s3.ap-south-1.amazonaws.com/menu/1800000000-ffff0000/1200.webp';

beforeEach(async () => {
  Object.assign(db, createPrismaMock());
  s3.send.mockReset().mockResolvedValue({});
  vi.stubEnv('S3_BUCKET_NAME', 'b');
  vi.stubEnv('AWS_REGION', 'ap-south-1');
  vi.stubEnv('S3_PUBLIC_URL', '');
  db.category.findMany.mockResolvedValue([{ id: 1, coverUrl: OLD }, { id: 2, coverUrl: NEW }]);
  db.menuItem.findMany.mockResolvedValue([{ id: 5, imageUrl: OLD }, { id: 6, imageUrl: null }]);
  db.category.updateMany.mockResolvedValue({ count: 1 });
  db.menuItem.updateMany.mockResolvedValue({ count: 1 });
  const jpg = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#850D33' } }).jpeg().toBuffer();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => jpg }));
});

describe('resizeImages CLI', () => {
  it('dry run lists the old images and changes nothing', async () => {
    const r = await resizeImages({ apply: false, log: () => {} });
    expect(r).toEqual({ total: 1, done: 0, failed: 0 });
    expect(s3.send).not.toHaveBeenCalled();
    expect(db.category.updateMany).not.toHaveBeenCalled();
    expect(db.menuItem.updateMany).not.toHaveBeenCalled();
  });

  it('--apply converts each distinct old image once and repoints every row; new-layout rows are skipped', async () => {
    const r = await resizeImages({ apply: true, log: () => {} });
    expect(r).toEqual({ total: 1, done: 1, failed: 0 });
    const keys = s3.send.mock.calls.map((c) => c[0].input.Key as string);
    expect(keys).toHaveLength(3);
    expect(keys.map((k) => k.split('/').pop())).toEqual(['320.webp', '640.webp', '1200.webp']);
    const newUrl = `https://b.s3.ap-south-1.amazonaws.com/${keys[2]}`;
    expect(db.category.updateMany).toHaveBeenCalledWith({ where: { coverUrl: OLD }, data: { coverUrl: newUrl } });
    expect(db.menuItem.updateMany).toHaveBeenCalledWith({ where: { imageUrl: OLD }, data: { imageUrl: newUrl } });
  });

  it('a download that fails is reported and leaves the rows alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const r = await resizeImages({ apply: true, log: () => {} });
    expect(r).toEqual({ total: 1, done: 0, failed: 1 });
    expect(db.menuItem.updateMany).not.toHaveBeenCalled();
  });
});
