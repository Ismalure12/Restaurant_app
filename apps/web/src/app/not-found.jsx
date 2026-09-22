import Link from 'next/link';

export const metadata = { title: 'Page not found — Maqaaxi Pos' };

export default function NotFound() {
  return (
    <div className="state-page">
      <div className="state-card">
        <p className="state-code">404</p>
        <h1 className="state-title">We can&rsquo;t find that page</h1>
        <p className="state-body">
          The link may be old, or the item it pointed to was removed.
        </p>
        <Link href="/" className="state-cta">Back to the menu</Link>
      </div>
    </div>
  );
}
