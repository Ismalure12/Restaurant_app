'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { RowsSkeleton } from '@/components/admin/Skeletons';

// Old invoice URL. Invoices now live inside their customer's account, so this
// looks up the owner and replaces the URL (no extra history entry). Same query
// key as the invoice page, so the destination renders from cache instantly.
export default function LegacyInvoiceRedirect() {
  const { id } = useParams();
  const router = useRouter();
  const { data: invoice, isError } = useQuery({
    queryKey: ['invoice', String(id)],
    queryFn: () => fetchJson(`/api/admin/invoices/${id}`),
  });

  useEffect(() => {
    if (invoice?.customer?.id) router.replace(`/admin/dashboard/customers/${invoice.customer.id}/invoices/${id}?from=invoicing`);
  }, [invoice, id, router]);

  if (isError) {
    return (
      <div className="wrap-narrow">
        <nav className="adm-crumb">
          <Link href="/admin/dashboard/invoices">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Invoicing
          </Link>
          <span className="sep">/</span>
          <span>Not found</span>
        </nav>
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div>
            <p className="empty-title">Invoice not found</p>
            <p className="empty-sub">It may have been removed. Go back to Invoicing.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap-narrow" aria-busy="true">
      <div className="sk" style={{ height: 30, width: 260, marginBottom: 14 }} />
      <div className="sk" style={{ height: 58, marginBottom: 16 }} />
      <div className="card card-pad"><RowsSkeleton rows={5} /></div>
    </div>
  );
}
