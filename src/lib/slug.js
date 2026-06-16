/**
 * URL-safe slug from a display name: lowercase, non-alphanumerics → single
 * hyphen, no leading/trailing hyphen. Shared by the category create + update
 * routes so a rename keeps the slug in sync with the name.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
