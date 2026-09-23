import { Suspense } from 'react';
import MenuApp from '@/components/menu/MenuApp';

// The customer menu. All data comes from the API in the browser (MenuApp →
// GET /api/menu); the web app never touches the database. Suspense is required
// because MenuApp reads the query string (?table=, ?ref=, ?pay=).
// Each page owns its <main> (the admin layout has its own), so the root layout
// doesn't add one.
export default function HomePage() {
  return (
    <main>
      <Suspense fallback={null}>
        <MenuApp />
      </Suspense>
    </main>
  );
}
