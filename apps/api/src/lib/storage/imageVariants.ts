import sharp from 'sharp';
import { randomUUID } from 'node:crypto';

// Every menu/category image is stored in three widths so a phone downloads
// only what its card needs (the menu's <img srcset>):
//   menu/<base>/320.webp · menu/<base>/640.webp · menu/<base>/1200.webp
// The database keeps ONE URL — the 1200 one; the web app derives the other
// two from it (apps/web/src/lib/menu/imageSrc.js). Keep both in step.
export const IMAGE_WIDTHS = [320, 640, 1200] as const;
const QUALITY: Record<number, number> = { 320: 75, 640: 75, 1200: 82 };

/** A fresh, unique folder for one image's variants. */
export const newImageBase = () => `menu/${Date.now()}-${randomUUID().slice(0, 8)}`;
export const variantKey = (base: string, width: number) => `${base}/${width}.webp`;

/**
 * One WebP per width (never enlarged — a small original gives same-size
 * copies). Encoded one after another to stay gentle on a small server.
 * Throws when the bytes aren't a decodable image.
 */
export async function makeVariants(input: Buffer) {
  const img = sharp(input);
  await img.metadata(); // fails fast on a non-image
  const out: { width: number; body: Buffer }[] = [];
  for (const width of IMAGE_WIDTHS) {
    const body = await img.clone().resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY[width] }).toBuffer();
    out.push({ width, body });
  }
  return out;
}
