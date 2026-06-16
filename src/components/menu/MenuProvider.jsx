'use client';

import { MenuContext } from './MenuContext';
import useMenuController from '@/hooks/menu/useMenuController';

// Builds the menu controller state and exposes it to all menu screens via context.
export default function MenuProvider({ categories, banners, socialLinks = [], initialOrder = null, openConfirmed = false, children }) {
  const value = useMenuController({ rawCategories: categories, banners, socialLinks, initialOrder, openConfirmed });
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}
