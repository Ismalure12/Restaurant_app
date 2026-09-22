import Link from 'next/link';
import { notFound } from 'next/navigation';
import { safeGetCategory, safeGetMenu } from '@/lib/menuServer';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import TagPills from '@/components/ui/TagPills';
import { FMT } from '@/lib/menu/format';

// The menu changes rarely, so every category is prerendered at build time and
// revalidated with the menu fetch.
export async function generateStaticParams() {
  // API unreachable or malformed at build time — pages render on demand.
  const menu = await safeGetMenu();
  return (menu?.categories || []).map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }) {
  const { category: slug } = await params;
  const category = await safeGetCategory(slug);
  if (!category) return { title: 'Not found — Maqaaxi' };
  return {
    title: `${category.name} — Maqaaxi`,
    description: category.sub || `${category.name} at Maqaaxi.`,
  };
}

export default async function CategoryPage({ params }) {
  const { category: slug } = await params;
  const category = await safeGetCategory(slug);
  if (!category) notFound();
  const items = Array.isArray(category.items) ? category.items : [];

  return (
    <section className="mx-section">
      <div className="mx-section-head">
        <div className="mx-section-titles">
          {category.kicker && <span className="mx-eyebrow">{category.kicker}</span>}
          <h1 className="mx-h1">{category.headline || category.name}</h1>
          {category.sub && <p className="mx-section-sub">{category.sub}</p>}
        </div>
        <span className="mx-meta">
          {items.length} {items.length === 1 ? 'dish' : 'dishes'}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mx-empty-note">Nothing in this section right now.</p>
      ) : (
        <ul className="mx-dish-grid">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/menu/${category.slug}/${item.id}`} className="mx-dish-card">
                <span className="mx-dish-media">
                  <ImgWithFallback src={item.imageUrl} alt="" />
                </span>
                <span className="mx-dish-body">
                  <span className="mx-dish-name">{item.name}</span>
                  {item.description && <span className="mx-dish-desc">{item.description}</span>}
                  {item.tags?.length > 0 && <TagPills tags={item.tags} />}
                </span>
                <span className="mx-dish-foot">
                  <span className="mx-price tnum">{FMT(item.price)}</span>
                  <span className="mx-dish-add" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
