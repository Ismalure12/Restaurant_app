// One-time conversion of menu/category images uploaded before the three
// widths existed (lib/storage/imageVariants.ts). Runs inside the api image:
//   docker compose run --rm -T --no-deps api node dist/cli/resizeImages.js            (dry run)
//   docker compose run --rm -T --no-deps api node dist/cli/resizeImages.js --apply    (do it)
// Dry run (default) only lists what it would convert — nothing uploaded,
// nothing written. --apply downloads each old image once, stores its three
// widths under a new menu/<base>/ folder and points every row that used it at
// the new 1200 URL. Old files are never deleted (old links keep working).
// Safe to re-run: rows already on the new layout are skipped. Exit 1 if any
// image failed (the rest are still converted).
import prisma from '../lib/db/prisma.js';
import { makeVariants, newImageBase, variantKey } from '../lib/storage/imageVariants.js';
import { uploadPublicImage } from '../lib/storage/s3.js';

const MAX_BYTES = 10 * 1024 * 1024;
/** Same pattern the web app uses to find the other widths (lib/menu/imageSrc.js). */
export const VARIANT_RE = /\/menu\/[^/]+\/1200\.webp$/;

export async function download(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) throw new Error(`larger than ${MAX_BYTES / 1024 / 1024} MB`);
  return body;
}

export async function resizeImages({ apply, log = console.log }: { apply: boolean; log?: (s: string) => void }) {
  const [categories, items] = await Promise.all([
    prisma.category.findMany({ where: { coverUrl: { not: null } }, select: { id: true, coverUrl: true } }),
    prisma.menuItem.findMany({ where: { imageUrl: { not: null } }, select: { id: true, imageUrl: true } }),
  ]);
  // One conversion per distinct old URL, however many rows share it.
  const urls = new Set<string>();
  for (const c of categories) if (c.coverUrl && !VARIANT_RE.test(c.coverUrl)) urls.add(c.coverUrl);
  for (const i of items) if (i.imageUrl && !VARIANT_RE.test(i.imageUrl)) urls.add(i.imageUrl);

  log(`${categories.length} category covers, ${items.length} dish images; ${urls.size} distinct old image(s) to convert${apply ? '' : ' (dry run — add --apply to convert)'}`);
  let done = 0;
  let failed = 0;
  for (const oldUrl of urls) {
    if (!apply) { log(`  would convert ${oldUrl}`); continue; }
    try {
      const variants = await makeVariants(await download(oldUrl));
      const base = newImageBase();
      const stored = await Promise.all(variants.map((v) => uploadPublicImage(variantKey(base, v.width), v.body, 'image/webp')));
      const newUrl = stored[stored.length - 1];
      // One-off script: two updates per distinct image (dozens at most).
      const [cats, dishes] = await prisma.$transaction([
        prisma.category.updateMany({ where: { coverUrl: oldUrl }, data: { coverUrl: newUrl } }),
        prisma.menuItem.updateMany({ where: { imageUrl: oldUrl }, data: { imageUrl: newUrl } }),
      ]);
      done += 1;
      log(`  ok ${oldUrl} → ${newUrl} (${cats.count} categories, ${dishes.count} dishes)`);
    } catch (err) {
      failed += 1;
      log(`  FAILED ${oldUrl}: ${(err as Error)?.message ?? err}`);
    }
  }
  if (apply) log(`converted ${done}, failed ${failed}`);
  return { total: urls.size, done, failed };
}

// Run only as a script (tests import the functions).
if (process.argv[1] && /resizeImages\.(js|ts)$/.test(process.argv[1])) {
  resizeImages({ apply: process.argv.includes('--apply') })
    .then(({ failed }) => { if (failed) process.exitCode = 1; })
    .catch((err) => { console.error(`Image conversion FAILED: ${(err as Error)?.message ?? err}`); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
