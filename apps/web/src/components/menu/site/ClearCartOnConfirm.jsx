'use client';

import { useEffect } from 'react';
import { useCart } from './CartProvider';

// Empties the basket once the confirmation page has actually rendered a paid
// order. Kept out of the page so the page itself stays a server component.
export default function ClearCartOnConfirm() {
  const { clear, hydrated, lines } = useCart();

  useEffect(() => {
    if (hydrated && lines.length) clear();
  }, [hydrated, lines.length, clear]);

  return null;
}
