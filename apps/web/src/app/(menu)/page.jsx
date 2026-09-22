import Link from 'next/link';
import { redirect } from 'next/navigation';
import { safeGetMenu } from '@/lib/menuServer';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import { FMT } from '@/lib/menu/format';

export const metadata = {
  title: 'Maqaaxi — Menu',
  description: 'Browse the menu, customise your dish and order from your table.',
};

function MenuUnavailable() {
  return (
    <section className="mx-section mx-empty">
      <span className="mx-empty-ring mx-empty-ring-neg" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </span>
      <h1 className="mx-empty-title">The menu isn&rsquo;t available right now</h1>
      <p className="mx-empty-sub">
        Please ask a member of staff, or try again in a moment.
      </p>
    </section>
  );
}

export default async function HomePage({ searchParams }) {
  const sp = (await searchParams) || {};

  // Sifalo returns the customer to /?ref=… after a hosted checkout, and the
  // 409 path in checkout does the same. Those links must keep working, so the
  // confirmation lives at its own route and this forwards to it.
  const ref = typeof sp.ref === 'string' ? sp.ref : null;
  if (ref) {
    const qs = new URLSearchParams();
    if (typeof sp.pay === 'string') qs.set('pay', sp.pay);
    redirect(`/order/${encodeURIComponent(ref)}${qs.size ? `?${qs}` : ''}`);
  }

  const menu = await safeGetMenu();
  if (!menu) return <MenuUnavailable />;
  const { categories } = menu;
  const featured = categories.flatMap((c) => c.items.map((i) => ({ ...i, category: c })))[0] || null;

  return (
    <>
      {featured && (
        <section className="mx-hero">
          <div className="mx-hero-copy">
            <span className="mx-eyebrow">Chef&rsquo;s pick</span>
            <h1 className="mx-hero-title">{featured.name}</h1>
            {featured.description && <p className="mx-hero-sub">{featured.description}</p>}
            <Link href={`/menu/${featured.category.slug}/${featured.id}`} className="mx-btn mx-btn-primary">
              See the dish
              <span className="tnum">{FMT(featured.price)}</span>
            </Link>
          </div>
          <div className="mx-hero-media">
            <ImgWithFallback src={featured.imageUrl} alt="" />
          </div>
        </section>
      )}

      <section className="mx-section">
        <div className="mx-section-head">
          <h2 className="mx-h2">Browse the menu</h2>
          <span className="mx-meta">{categories.length} sections</span>
        </div>

        {categories.length === 0 ? (
          <p className="mx-empty-note">The menu isn&rsquo;t published yet. Please ask a member of staff.</p>
        ) : (
          <ul className="mx-cat-grid">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/menu/${c.slug}`} className="mx-cat-card">
                  <span className="mx-cat-media">
                    <ImgWithFallback src={c.coverUrl} alt="" />
                  </span>
                  <span className="mx-cat-body">
                    <span className="mx-cat-name">{c.name}</span>
                    <span className="mx-meta">{c.items.length} {c.items.length === 1 ? 'dish' : 'dishes'}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
