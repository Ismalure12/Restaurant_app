'use client';

import { useMenu } from '../MenuContext';

// First-visit hint overlay (shown briefly on the category screen).
export default function SwipeHint() {
  const { swipeHintRef } = useMenu();
  return (
    <div ref={swipeHintRef} className="swipe-hint">
      <div className="hand">👆</div>
      <div className="ht">
        <b>Swipe to explore</b>
        <span>Drag left/right to slide between categories.</span>
      </div>
    </div>
  );
}
