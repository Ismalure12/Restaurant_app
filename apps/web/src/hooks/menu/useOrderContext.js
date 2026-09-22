'use client';

import { useEffect, useState } from 'react';

// Resolves the table number from the QR code (?table=N), persisting it so the
// value survives navigation. Falls back to the legacy `rh_order_ctx` key once.
export default function useOrderContext(searchParams) {
  const [tableFromQr, setTableFromQr] = useState(null);

  useEffect(() => {
    const fromUrl = (searchParams?.get('table') || '').trim();
    if (fromUrl) {
      setTableFromQr(fromUrl);
      try { localStorage.setItem('menu_order_ctx', JSON.stringify({ tableNumber: fromUrl })); } catch {}
      return;
    }
    try {
      const raw = localStorage.getItem('menu_order_ctx') ?? localStorage.getItem('rh_order_ctx');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.tableNumber) setTableFromQr(parsed.tableNumber);
      }
    } catch {}
  }, [searchParams]);

  return tableFromQr;
}
