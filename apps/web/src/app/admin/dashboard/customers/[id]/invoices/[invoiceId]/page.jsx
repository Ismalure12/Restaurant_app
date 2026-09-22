'use client';

import { useParams } from 'next/navigation';
import InvoiceDetailView from '@/components/admin/InvoiceDetailView';

// Invoices live inside their customer's account.
export default function CustomerInvoicePage() {
  const { id, invoiceId } = useParams();
  return <InvoiceDetailView invoiceId={invoiceId} customerId={id} />;
}
