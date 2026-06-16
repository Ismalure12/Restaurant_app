'use client';

import { useMenu } from '../MenuContext';

// "Swipe next" affordance on the category screen — jumps to the next category.
export default function SwipeNext() {
  const { screen, currentCatSlug, orderedSlugs, categories, openCategory, swipeNextRef } = useMenu();
  if (screen !== 'category' || !currentCatSlug) return null;
  const i = orderedSlugs.indexOf(currentCatSlug);
  if (i < 0) return null;
  const nextSlug = orderedSlugs[(i + 1) % orderedSlugs.length];
  const next = categories.find((c) => c.slug === nextSlug);
  if (!next) return null;
  return (
    <button ref={swipeNextRef} className="swipe-next" aria-label="Next category" onClick={() => openCategory(next.slug, 'slide')}>
      <div className="sw-text">
        <span className="sw-k">Swipe next</span>
        <span className="sw-v">{next.name}</span>
      </div>
      <div className="sw-icn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </div>
    </button>
  );
}
