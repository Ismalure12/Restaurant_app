import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
const blob = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));
vi.mock('@vercel/blob', () => blob);

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  blob.put.mockReset();
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
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('a real image is re-encoded to webp and stored', async () => {
    blob.put.mockResolvedValue({ url: 'https://x.public.blob.vercel-storage.com/menu/a.webp' });
    const res = await request(app).post('/api/upload').set('Cookie', await tokenFor('cashier'))
      .attach('file', await png(), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\.webp$/);
    const [name, body, opts] = blob.put.mock.calls[0];
    expect(name).toMatch(/^menu\/\d+-[0-9a-f]{8}\.webp$/);
    expect((await sharp(body).metadata()).format).toBe('webp');
    expect(opts).toEqual({ access: 'public', contentType: 'image/webp' });
  });
});
