// Menu images uploaded since the three-width change live side by side:
//   …/menu/<base>/320.webp · 640.webp · 1200.webp
// and the database stores the 1200 URL (apps/api/src/lib/storage/imageVariants.ts).
// Older uploads (one flat file, or Vercel Blob) get no srcset and load as before.
const VARIANT_RE = /\/menu\/[^/]+\/1200\.webp$/;
const WIDTHS = [320, 640, 1200];

const isVariant = (url) => typeof url === 'string' && VARIANT_RE.test(url);

/** The `srcset` for a new-layout URL, else undefined. */
export function srcSetFor(url) {
  if (!isVariant(url)) return undefined;
  const base = url.slice(0, -'1200.webp'.length);
  return WIDTHS.map((w) => `${base}${w}.webp ${w}w`).join(', ');
}

/** One fixed width (for small admin thumbnails); any other URL is returned as is. */
export function variantUrl(url, width) {
  return isVariant(url) ? `${url.slice(0, -'1200.webp'.length)}${width}.webp` : url;
}

/** How wide each menu image is drawn (the phone shell is at most 440px). */
export const SIZES = {
  tile: '152px',
  featured: '(min-width: 440px) 400px, 92vw',
  mini: '(min-width: 440px) 200px, 46vw',
  wide: '96px',
  hero: '(min-width: 440px) 440px, 100vw',
  thumb: '70px',
};

/** The origin of the first image in a menu payload (for an early preconnect). */
export function imageOriginOf(menu) {
  const cats = Array.isArray(menu?.categories) ? menu.categories : [];
  for (const c of cats) {
    const url = c.coverUrl || (Array.isArray(c.items) ? c.items.find((i) => i.imageUrl)?.imageUrl : null);
    if (url) {
      try { return new URL(url).origin; } catch { /* not an absolute URL — nothing to preconnect */ }
    }
  }
  return null;
}
