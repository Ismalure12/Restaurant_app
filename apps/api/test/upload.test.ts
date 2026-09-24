import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
// The S3 SDK is faked at the edge: `send` records each PutObjectCommand's input.
const s3 = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = s3.send; },
  PutObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
}));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  s3.send.mockReset();
  vi.stubEnv('S3_BUCKET_NAME', 'test-bucket');
  vi.stubEnv('AWS_REGION', 'ap-south-1');
  vi.stubEnv('S3_PUBLIC_URL', '');
});

const png = () => sharp({ create: { width: 4, height: 4, channels: 3, background: '#850D33' } }).png().toBuffer();

describe('POST /api/upload', () => {
  it('requires a catalog role', async () => {
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('waiter'))
      .attach('file', await png(), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('no file → 400', async () => {
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier')).field('x', '1');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No file provided' });
  });

  it('disallowed type → 400', async () => {
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', Buffer.from('gif'), { filename: 'a.gif', contentType: 'image/gif' });
    expect(res.body).toEqual({ error: 'Invalid file type. Allowed: JPG, PNG, WebP' });
  });

  it('over 5MB → 400 (type still checked first)', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 10);
    const tooBig = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', big, { filename: 'a.png', contentType: 'image/png' });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body).toEqual({ error: 'File too large. Max 5MB' });

    const bigWrongType = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', big, { filename: 'a.gif', contentType: 'image/gif' });
    expect(bigWrongType.body).toEqual({ error: 'Invalid file type. Allowed: JPG, PNG, WebP' });
  });

  it('bytes that are not an image → 400 and nothing stored', async () => {
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', Buffer.from('<?php echo 1; ?>'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.body).toEqual({ error: 'Invalid image file' });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it('a real image is re-encoded to webp and stored in S3', async () => {
    s3.send.mockResolvedValue({});
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', await png(), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    const { input } = s3.send.mock.calls[0][0];
    expect(input.Bucket).toBe('test-bucket');
    expect(input.Key).toMatch(/^menu\/\d+-[0-9a-f]{8}\.webp$/);
    expect(input.ContentType).toBe('image/webp');
    expect((await sharp(input.Body).metadata()).format).toBe('webp');
    expect(res.body.url).toBe(`https://test-bucket.s3.ap-south-1.amazonaws.com/${input.Key}`);
  });

  it('S3_PUBLIC_URL (a CDN) replaces the bucket URL', async () => {
    vi.stubEnv('S3_PUBLIC_URL', 'https://cdn.example.com/');
    s3.send.mockResolvedValue({});
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', await png(), { filename: 'a.png', contentType: 'image/png' });
    expect(res.body.url).toMatch(/^https:\/\/cdn\.example\.com\/menu\/\d+-[0-9a-f]{8}\.webp$/);
  });

  it('an S3 failure → 500 with no internals', async () => {
    s3.send.mockRejectedValue(new Error('AccessDenied: secret details'));
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', await png(), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
