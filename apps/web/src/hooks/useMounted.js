'use client';

import { useEffect, useState } from 'react';

/**
 * True only after THIS component has mounted on the client.
 *
 * Needed wherever markup depends on client-only state (the cart lives in
 * localStorage). A flag from a context provider is not equivalent: the App
 * Router hydrates the layout before the page segment, so a provider's effect
 * can set its flag before a child ever renders on the client — and the child
 * then hydrates against server HTML that assumed the flag was false.
 * A component's own effect cannot run before its own hydration.
 */
export default function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // The hydration gate itself — one write, on mount, by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  return mounted;
}
