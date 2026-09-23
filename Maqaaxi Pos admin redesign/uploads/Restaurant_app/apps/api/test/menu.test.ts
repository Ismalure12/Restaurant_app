import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

const dec = (v: string) => ({ toString: () => v }); // Prisma Decimal stand-in

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.category.findMany.mockResolvedValue([
    {
      id: 1, slug: 'mains', name: 'Mains', kicker: 'k', headline: '<em>Hot</em>', sub: null, coverUrl: null,
      isActive: true, sortOrder: 0, createdAt: new Date(),
      items: [{
        id: 10, name: 'Burger', description: 'd', price: dec('5.50'), imageUrl: null, kcal: null, prepTime: null, pairing: null,
        isActive: true, categoryId: 1,
        optionGroups: [{ id: 3, title: 'Size', options: [{ id: 4, name: 'Large', priceAdd: dec('1.25') }] }],
        extras: [{ id: 5, name: 'Cheese', priceAdd: dec('0.75') }],
        tags: [{ tag: { id: 6, slug: 'spicy', label: 'Spicy', variant: 'spicy' } }],
      }],
    },
  ]);
  db.socialLink.findMany.mockResolvedValue([{ id: 7, platform: 'whatsapp', value: '+252', createdAt: new Date() }]);
});

describe('GET /api/menu', () => {
  it('is public and returns the menu page shape with numeric prices', async () => {
    const res = await request(app).get('/api/menu'); // no cookie
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const item = res.body.categories[0].items[0];
    expect(item.price).toBe(5.5);
    expect(item.optionGroups[0].options[0]).toEqual({ id: 4, name: 'Large', priceAdd: 1.25 });
    expect(item.extras[0]).toEqual({ id: 5, name: 'Cheese', priceAdd: 0.75 });
    expect(item.tags[0]).toEqual({ id: 6, slug: 'spicy', label: 'Spicy', variant: 'spicy' });
    expect(res.body.socialLinks).toEqual([{ platform: 'whatsapp', value: '+252' }]);
    // Internal columns never leak to the public.
    expect(res.body.categories[0]).not.toHaveProperty('isActive');
    expect(item).not.toHaveProperty('categoryId');
    expect(res.body).not.toHaveProperty('banners');
  });

  it('asks the database for ACTIVE categories and items only', async () => {
    await request(app).get('/api/menu');
    const catArgs = db.category.findMany.mock.calls[0][0];
    expect(catArgs.where).toEqual({ isActive: true });
    expect(catArgs.include.items.where).toEqual({ isActive: true });
  });

  it('database failure → 500 with the standard error, nothing leaked', async () => {
    db.category.findMany.mockRejectedValue(new Error('connection refused at 10.0.0.1'));
    const res = await request(app).get('/api/menu');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
