'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from './CartProvider';
import { useOrderContext } from './OrderContext';
import useMounted from '@/hooks/useMounted';
import { FMT } from '@/lib/menu/format';

// Persistent chrome for every public route. On a phone it is a compact bar and
// the cart rides in a bottom bar; from 900px up the categories become real
// top-level navigation.
export default function SiteHeader({ categories = [] }) {
  const pathname = usePathname();
  const { count, total } = useCart();
  const hydrated = useMounted();
  const { tableNumber } = useOrderContext();

  const activeSlug = pathname?.startsWith('/menu/') ? pathname.split('/')[2] : null;

  return (
    <header className="mx-header">
      <div className="mx-header-inner">
        <Link href="/" className="mx-brand" aria-label="Maqaaxi — menu home">
          <span className="mx-brand-mark" aria-hidden="true">M</span>
          <span className="mx-brand-name">Maqaaxi</span>
        </Link>

        <nav className="mx-nav" aria-label="Menu sections">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/menu/${c.slug}`}
              className={`mx-nav-link${activeSlug === c.slug ? ' is-active' : ''}`}
              aria-current={activeSlug === c.slug ? 'page' : undefined}
            >
              {c.name}
            </Link>
          ))}
        </nav>

        {tableNumber && (
          <span className="mx-table-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M3 9h18" />
            </svg>
            Table {tableNumber}
          </span>
        )}

        {/* The server cannot know the basket, so this node's CONTENT is
            client-only. Its DOM shape stays fixed and the varying text is
            marked, rather than mounting extra children after hydration —
            a conditional child here is a hydration mismatch on any reload
            where a saved cart already exists. */}
        <Link href="/cart" className="mx-cart-btn" aria-label="Your cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" />
            <path d="M2 3h3l2.4 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" />
          </svg>
          <span className="mx-cart-count" suppressHydrationWarning hidden={!hydrated || count === 0}>
            {hydrated && count > 0 ? count : ''}
          </span>
          <span className="mx-cart-total tnum" suppressHydrationWarning hidden={!hydrated || count === 0}>
            {hydrated && count > 0 ? FMT(total) : ''}
          </span>
        </Link>
      </div>
    </header>
  );
}
