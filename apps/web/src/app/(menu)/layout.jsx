import { Suspense } from 'react';
import { safeGetMenu } from '@/lib/menuServer';
import { CartProvider } from '@/components/menu/site/CartProvider';
import { OrderContextProvider } from '@/components/menu/site/OrderContext';
import SiteHeader from '@/components/menu/site/SiteHeader';
import SiteFooter from '@/components/menu/site/SiteFooter';

// Chrome shared by every customer-facing route. The category list is fetched
// once here (the same cached /api/menu read every page uses, so it costs
// nothing extra) and drives the top navigation.
export default async function MenuLayout({ children }) {
  // Chrome, not content: if the API is unreachable the page still renders and
  // the segment's own error/empty state explains what happened.
  const menu = await safeGetMenu();
  const navCategories = (menu?.categories || []).map((c) => ({ slug: c.slug, name: c.name }));
  const socialLinks = menu?.socialLinks || [];

  return (
    <CartProvider>
      {/* useSearchParams needs a Suspense boundary to keep the route static. */}
      <Suspense fallback={null}>
        <OrderContextProvider>
          <div className="mx-site">
            <SiteHeader categories={navCategories} />
            <div className="mx-main">{children}</div>
            <SiteFooter socialLinks={socialLinks} />
          </div>
        </OrderContextProvider>
      </Suspense>
    </CartProvider>
  );
}
