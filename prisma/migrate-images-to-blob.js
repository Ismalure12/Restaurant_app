/* eslint-disable */
// One-time script: download all Pexels/Unsplash images and re-upload to Vercel Blob.
// Run: source <(grep -v '^#' .env | sed 's/^/export /') && node prisma/migrate-images-to-blob.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { put } = require('@vercel/blob');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

// oldUrl → blobUrl — avoids re-uploading the same photo referenced by multiple rows
const cache = new Map();

function isExternal(url) {
  if (!url) return false;
  return !url.includes('blob.vercel-storage.com');
}

async function toBlobUrl(url) {
  if (!isExternal(url)) return url;
  if (cache.has(url)) {
    console.log(`  ↩ cache hit`);
    return cache.get(url);
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const name = `seed-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await res.arrayBuffer());
  const blob = await put(`menu/${name}`, buffer, { access: 'public', contentType });
  cache.set(url, blob.url);
  console.log(`  ✓ ${blob.url}`);
  return blob.url;
}

async function main() {
  let uploads = 0;
  let updated = 0;

  // ── Categories ──────────────────────────────────────────────────────────
  console.log('\n── Categories ──');
  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    if (!isExternal(cat.coverUrl)) continue;
    console.log(`${cat.slug}: ${cat.coverUrl}`);
    const newUrl = await toBlobUrl(cat.coverUrl);
    if (newUrl !== cat.coverUrl) {
      await prisma.category.update({ where: { id: cat.id }, data: { coverUrl: newUrl } });
      updated++;
      if (!cache.size || [...cache.values()].filter(v => v === newUrl).length === 1) uploads++;
    }
  }

  // ── Menu items ───────────────────────────────────────────────────────────
  console.log('\n── Menu items ──');
  const items = await prisma.menuItem.findMany();
  for (const item of items) {
    if (!isExternal(item.imageUrl)) continue;
    console.log(`${item.name}: ${item.imageUrl}`);
    const newUrl = await toBlobUrl(item.imageUrl);
    if (newUrl !== item.imageUrl) {
      await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: newUrl } });
      updated++;
    }
  }

  // ── Banners ──────────────────────────────────────────────────────────────
  console.log('\n── Banners ──');
  const banners = await prisma.banner.findMany();
  for (const banner of banners) {
    if (!isExternal(banner.imageUrl)) continue;
    console.log(`${banner.service}: ${banner.imageUrl}`);
    const newUrl = await toBlobUrl(banner.imageUrl);
    if (newUrl !== banner.imageUrl) {
      await prisma.banner.update({ where: { id: banner.id }, data: { imageUrl: newUrl } });
      updated++;
    }
  }

  console.log(`\n✓ Done. ${cache.size} unique images uploaded to Blob. ${updated} DB rows updated.`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
