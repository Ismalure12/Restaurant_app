'use client';

import MenuProvider from './MenuProvider';
import MenuShell from './MenuShell';

// Root of the customer menu: provides shared state, then renders the phone shell.
export default function MenuApp({ categories, banners, socialLinks = [], initialOrder = null, openConfirmed = false }) {
  return (
    <MenuProvider
      categories={categories}
      banners={banners}
      socialLinks={socialLinks}
      initialOrder={initialOrder}
      openConfirmed={openConfirmed}
    >
      <MenuShell />
    </MenuProvider>
  );
}
