'use client';

import Bk from './Bk';
import Button from '@/components/admin/ui/Button';

// Top-N bars + a "view the rest" link, for widgets that only have room to
// show a handful of rows but still need to point somewhere exhaustive.
export default function TopNList({ rows, n = 3, toBar, color, viewAllHref, viewAllLabel = 'View all' }) {
  const top = rows.slice(0, n);
  const extra = rows.length - top.length;
  return (
    <>
      <Bk rows={top.map(toBar)} color={color} />
      {viewAllHref && rows.length > 0 && (
        <div className="pt-3">
          <Button href={viewAllHref} variant="ghost" size="xs" iconRight="arrowRight">
            {extra > 0 ? `+${extra} more · ${viewAllLabel}` : viewAllLabel}
          </Button>
        </div>
      )}
    </>
  );
}
