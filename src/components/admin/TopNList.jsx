'use client';

import Link from 'next/link';
import Bk from './Bk';

// Top-N bars + a "view the rest" link, for widgets that only have room to
// show a handful of rows (e.g. Daily Report's waiter/cashier cards) but
// still need to point somewhere exhaustive when there are more.
export default function TopNList({ rows, n = 3, toBar, color, viewAllHref, viewAllLabel = 'View all →' }) {
  const top = rows.slice(0, n);
  const extra = rows.length - top.length;
  return (
    <>
      <Bk rows={top.map(toBar)} color={color} />
      {viewAllHref && (
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <Link href={viewAllHref} className="btn btn-ghost btn-sm">
            {extra > 0 ? `+${extra} more — View all →` : viewAllLabel}
          </Link>
        </div>
      )}
    </>
  );
}
