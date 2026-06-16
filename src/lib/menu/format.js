// Pure, framework-agnostic helpers for the customer menu (presentation utilities).

export const FMT = (n) => '$' + Number(n || 0).toFixed(2);

export const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="14" height="14" fill="#f2f1ec"/><rect width="7" height="14" fill="#e8e6df"/></pattern></defs><rect width="400" height="400" fill="url(#p)"/></svg>'
)}`;

export function currentPeriod() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  return 'evening';
}

export function periodInfo() {
  const p = currentPeriod();
  if (p === 'morning') return { greet: 'Good morning', meal: 'breakfast', label: 'Breakfast service', period: 'morning' };
  if (p === 'midday') return { greet: 'Good afternoon', meal: 'lunch', label: 'Lunch service', period: 'midday' };
  return { greet: 'Good evening', meal: 'mains', label: 'Dinner service', period: 'evening' };
}

// Somali mobile carriers (phone prefixes) offered on the checkout payment number.
export const CARRIERS = [
  { prefix: '90', name: 'Golis', color: '#1e9862' },
  { prefix: '61', name: 'Hormuud', color: '#30378f' },
  { prefix: '66', name: 'Somtel', color: '#c98a2f' },
];

// Animate a small dot flying from a source element to the cart FAB.
export function flyTo(fromEl, fabEl) {
  if (!fromEl || !fabEl) return;
  const f = fromEl.getBoundingClientRect();
  const t = fabEl.getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'fly';
  dot.style.left = (f.left + f.width / 2 - 12) + 'px';
  dot.style.top = (f.top + f.height / 2 - 12) + 'px';
  document.body.appendChild(dot);
  requestAnimationFrame(() => {
    const dx = (t.left + t.width / 2) - (f.left + f.width / 2);
    const dy = (t.top + t.height / 2) - (f.top + f.height / 2);
    dot.style.transform = `translate(${dx}px, ${dy}px) scale(.35)`;
    dot.style.opacity = '0';
  });
  setTimeout(() => dot.remove(), 900);
}
