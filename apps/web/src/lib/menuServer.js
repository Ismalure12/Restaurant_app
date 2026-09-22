// Server-side reads of the public menu.
//
// The browser calls /api/... relatively and next.config rewrites it to the
// Express app. A server component has no such rewrite, so it needs the
// absolute origin — resolved here exactly the way next.config resolves it.
//
// This is what the old client-side fetch could not do: the menu is fetched on
// the server and cached by Next for `revalidate` seconds, so a QR scan gets
// HTML with the menu already in it instead of a spinner and a round trip.
// The web app still has no database access — everything goes through the API.

const DEV_API_ORIGIN = 'http://localhost:4100';

function apiOrigin() {
  const origin = (
    process.env.API_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : DEV_API_ORIGIN)
  ).replace(/\/+$/, '');
  if (!origin) throw new Error('API_ORIGIN is required (URL of the Express API)');
  return origin;
}

/** The whole public menu. Throws on failure so the segment's error.jsx shows. */
export async function getMenu() {
  const res = await fetch(`${apiOrigin()}/api/menu`, {
    // Matches the old `export const revalidate = 300` on the menu page.
    next: { revalidate: 300, tags: ['menu'] },
  });
  if (!res.ok) throw new Error(`GET /api/menu failed: ${res.status}`);
  return res.json();
}

/**
 * The menu, or null if the API can't be reached.
 *
 * Used where the menu is chrome rather than content (the nav) and where a
 * build must not depend on the API being awake — Neon suspends idle compute,
 * so a deploy that prerenders pages would otherwise fail for no real reason.
 * The fetch keeps its revalidate window, so a degraded render self-heals.
 */
export async function safeGetMenu() {
  try {
    return await getMenu();
  } catch (err) {
    console.error('Menu unavailable:', err?.message || err);
    return null;
  }
}

/** One category by slug, or null. */
export async function getCategory(slug) {
  const { categories } = await getMenu();
  return categories.find((c) => c.slug === slug) || null;
}

/**
 * One item by id, with its category. MenuItem has no slug column, so the id is
 * the stable public handle; the category slug in the URL is checked so a stale
 * link to a moved item 404s rather than rendering under the wrong section.
 */
export async function getItem(categorySlug, itemId) {
  const category = await getCategory(categorySlug);
  if (!category) return null;
  const item = category.items.find((i) => String(i.id) === String(itemId));
  return item ? { item, category } : null;
}

/**
 * An order by its public `?ref=` token, for the confirmation page. Never
 * cached — it is a live payment result. A bad or unknown ref returns null so
 * the page can say so instead of erroring.
 */
export async function getOrderByRef(ref) {
  if (!ref) return null;
  try {
    const res = await fetch(`${apiOrigin()}/api/order?ref=${encodeURIComponent(ref)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const order = await res.json();
    return order ? { ...order, total: order.total == null ? null : Number(order.total) } : null;
  } catch {
    return null;
  }
}
