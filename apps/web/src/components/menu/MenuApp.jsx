'use client';

import { useSearchParams } from 'next/navigation';
import Loading from '@/app/loading';
import useMenuData from '@/hooks/menu/useMenuData';
import MenuProvider from './MenuProvider';
import MenuShell from './MenuShell';

// Root of the customer menu. Loads the menu from the API in the browser, then
// provides shared state and renders the phone shell. MenuProvider mounts only
// once the data is ready — its state is seeded from it on first render.
export default function MenuApp() {
  const ref = useSearchParams()?.get('ref') || null;
  const { status, menu, order, retry } = useMenuData(ref);

  if (status === 'loading') return <Loading />;
  if (status === 'error') return <MenuLoadError onRetry={retry} />;

  return (
    <MenuProvider
      categories={menu.categories}
      socialLinks={menu.socialLinks}
      initialOrder={order}
      openConfirmed={!!order}
    >
      <MenuShell />
    </MenuProvider>
  );
}

function MenuLoadError({ onRetry }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: '#e9e8e3', fontFamily: 'var(--font-inter), Inter, sans-serif', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 340 }}>
        <p style={{ fontSize: 17, fontWeight: 600, color: '#15172b', margin: '0 0 6px' }}>We couldn&apos;t load the menu.</p>
        <p style={{ fontSize: 14, color: '#8a8c9e', margin: '0 0 20px' }}>Check your connection and try again.</p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            minHeight: 44, padding: '0 22px', borderRadius: 999, border: 0, cursor: 'pointer',
            background: '#850D33', color: '#fff', fontSize: 15, fontWeight: 600,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
