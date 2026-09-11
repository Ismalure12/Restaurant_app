'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import InvoiceDetailView from '@/components/admin/InvoiceDetailView';

// Invoices live inside their customer's account. `?from=invoicing` only
// changes the breadcrumb root so "back" returns to the worklist the user came from.
function CustomerInvoice() {
  const { id, invoiceId } = useParams();
  const from = useSearchParams().get('from');
  return <InvoiceDetailView invoiceId={invoiceId} customerId={id} from={from} />;
}

export default function CustomerInvoicePage() {
  return (
    <Suspense fallback={null}>
      <CustomerInvoice />
    </Suspense>
  );
}
