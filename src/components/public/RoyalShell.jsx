'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { SOCIAL_ICONS, SOCIAL_LABELS, socialHref, pickContact } from './socialIcons';

const FMT = (n) => '$' + Number(n || 0).toFixed(2);
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="14" height="14" fill="#f2f1ec"/><rect width="7" height="14" fill="#e8e6df"/></pattern></defs><rect width="400" height="400" fill="url(#p)"/></svg>'
)}`;

function currentPeriod() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  return 'evening';
}
function periodInfo() {
  const p = currentPeriod();
  if (p === 'morning') return { greet: 'Good morning', meal: 'breakfast', label: 'Breakfast service', period: 'morning' };
  if (p === 'midday') return { greet: 'Good afternoon', meal: 'lunch', label: 'Lunch service', period: 'midday' };
  return { greet: 'Good evening', meal: 'mains', label: 'Dinner service', period: 'evening' };
}

function ImgWithFallback({ src, alt, className, style, loading }) {
  const [err, setErr] = useState(false);
  // Reset on src change so a reused instance doesn't keep showing the placeholder
  // for a subsequent, valid image.
  useEffect(() => setErr(false), [src]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={err || !src ? PLACEHOLDER : src}
      alt={alt}
      className={className}
      style={style}
      loading={loading || 'lazy'}
      onError={() => setErr(true)}
    />
  );
}

function tagPills(tags) {
  if (!tags || !tags.length) return null;
  return (
    <div className="tags" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {tags.map((t, i) => (
        <span key={i} className={`tag ${t.variant && t.variant !== 'default' ? t.variant : ''}`}>{t.label}</span>
      ))}
    </div>
  );
}

function FeaturedCard({ item, onClick, onAdd }) {
  const firstTag = item.tags && item.tags[0];
  return (
    <article className="item featured" onClick={onClick}>
      <div className="thumb">
        {firstTag && <div className="stamp">{firstTag.label}</div>}
        <ImgWithFallback src={item.imageUrl} alt={item.name} />
      </div>
      <div className="body">
        <h3 className="name">{item.name}</h3>
        <p className="desc">{item.description}</p>
        <div className="foot">
          <span className="price"><small>$</small>{Number(item.price).toFixed(0)}</span>
          <button className="add" aria-label="Quick add" onClick={(e) => { e.stopPropagation(); onAdd(item, e.currentTarget); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
          </button>
        </div>
      </div>
    </article>
  );
}

function MiniCard({ item, onClick, onAdd }) {
  return (
    <article className="mini-card" onClick={onClick}>
      <div className="thumb">
        <ImgWithFallback src={item.imageUrl} alt={item.name} />
        <button className="add-mini" aria-label="Add" onClick={(e) => { e.stopPropagation(); onAdd(item, e.currentTarget); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </button>
      </div>
      <div className="body">
        <h3 className="name">{item.name}</h3>
        <div className="meta-row">
          <span className="price"><small>$</small>{Number(item.price).toFixed(0)}</span>
          <span className="quick">{item.prepTime || ''}</span>
        </div>
      </div>
    </article>
  );
}

function WideCard({ item, onClick, onAdd }) {
  return (
    <article className="item wide" onClick={onClick}>
      <div className="body">
        <div>
          <h3 className="name">{item.name}</h3>
          <p className="desc">{item.description}</p>
          {tagPills(item.tags)}
        </div>
        <div className="foot">
          <span className="price"><small>$</small>{Number(item.price).toFixed(0)}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 600 }}>{item.prepTime || ''}</span>
        </div>
      </div>
      <div className="thumb-wrap">
        <ImgWithFallback src={item.imageUrl} alt={item.name} />
        <button className="add-mini" aria-label="Add" onClick={(e) => { e.stopPropagation(); onAdd(item, e.currentTarget); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </button>
      </div>
    </article>
  );
}

function flyTo(fromEl, fabEl) {
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

// --- Hero stagger using react keys via greeting + search wrapper ---

const CARRIERS = [
  { prefix: '90', name: 'Golis', color: '#1e9862' },
  { prefix: '61', name: 'Hormuud', color: '#30378f' },
  { prefix: '66', name: 'Somtel', color: '#c98a2f' },
];

export default function MenuApp({ categories: rawCategories, banners, socialLinks = [], initialOrder = null, openConfirmed = false }) {
  const searchParams = useSearchParams();

  // ?table=N from the QR code (persisted to localStorage so checkout can use it
  // even if the customer navigates away and comes back).
  const [tableFromQr, setTableFromQr] = useState(null);
  useEffect(() => {
    const fromUrl = (searchParams?.get('table') || '').trim();
    if (fromUrl) {
      setTableFromQr(fromUrl);
      try { localStorage.setItem('menu_order_ctx', JSON.stringify({ tableNumber: fromUrl })); } catch {}
      return;
    }
    try {
      const raw = localStorage.getItem('menu_order_ctx');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.tableNumber) setTableFromQr(parsed.tableNumber);
      }
    } catch {}
  }, [searchParams]);

  // Normalize categories (server passes Prisma data; flatten tags)
  const categories = useMemo(() => rawCategories.map((c) => ({
    ...c,
    items: (c.items || []).map((it) => ({
      ...it,
      price: Number(it.price),
      tags: (it.tags || []).map((t) => t.tag || t),
      extras: (it.extras || []).map((e) => ({ ...e, priceAdd: Number(e.priceAdd) })),
      optionGroups: (it.optionGroups || []).map((g) => ({
        ...g,
        options: (g.options || []).map((o) => ({ ...o, priceAdd: Number(o.priceAdd) })),
      })),
    })),
  })), [rawCategories]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items.map((it) => ({ ...it, _cat: c }))), [categories]);

  const [pInfo] = useState(periodInfo());
  const banner = useMemo(() => banners.find((b) => b.service === pInfo.period) || banners[0], [banners, pInfo.period]);

  // Order: time-of-day meal first, then others in natural order
  const ordered = useMemo(() => {
    const matchSlug = pInfo.meal; // 'breakfast' | 'lunch' | 'mains'
    const featured = categories.find((c) => c.slug === matchSlug);
    if (!featured) return categories;
    return [featured, ...categories.filter((c) => c.slug !== matchSlug)];
  }, [categories, pInfo.meal]);

  // Category navigation (swipe / arrows / swipe-next) follows the *visible* tab
  // order — All, then `ordered` (meal-first) — so it never drifts from the tabs.
  const orderedSlugs = useMemo(() => ordered.map((c) => c.slug), [ordered]);

  // ===== Screen state =====
  const [screen, setScreen] = useState('home'); // 'home' | 'category'
  const [currentCatSlug, setCurrentCatSlug] = useState(null);
  const [screenBack, setScreenBack] = useState(false);

  // ===== Back-gesture history (single re-arming sentinel) =====
  // One synthetic history entry whenever any layer is open. iOS edge-swipe and
  // Android back fire `popstate`, which closes exactly one layer (see effect below).
  // "Armed" is tracked via the live history state so it can't drift from the browser.
  const navRef = useRef({}); // fresh snapshot for the mount-only popstate listener
  const arm = useCallback(() => {
    if (!window.history.state?.menuLayer) {
      window.history.pushState({ menuLayer: true }, '');
    }
  }, []);
  const goBack = useCallback(() => { window.history.back(); }, []);

  // Smoothly center a tab within its horizontal scroll row
  const centerTab = useCallback((container, btn) => {
    if (!container || !btn) return;
    const c = container.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const delta = (b.left + b.width / 2) - (c.left + c.width / 2);
    container.scrollTo({ left: container.scrollLeft + delta, behavior: 'smooth' });
  }, []);

  // ===== Cart =====
  const [cart, setCart] = useState([]);
  // restore from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('menu_cart');
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, []);
  // persist
  useEffect(() => {
    try { localStorage.setItem('menu_cart', JSON.stringify(cart)); } catch {}
  }, [cart]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);

  // ===== Refs =====
  const fabRef = useRef(null);
  const topbarRef = useRef(null);
  const catwrapHomeRef = useRef(null);
  const catTabsCatRef = useRef(null);
  const catnavHomeRef = useRef(null);
  const catnavCatRef = useRef(null);
  const homeSectionsRef = useRef(null);
  const screenCatRef = useRef(null);
  const swipeNextRef = useRef(null);
  const swipeHintRef = useRef(null);

  // ===== Toast =====
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2200);
  }, []);

  // ===== Quick-add (no options chosen) =====
  const quickAdd = useCallback((item, srcEl) => {
    const line = {
      uid: Math.random().toString(36).slice(2),
      itemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      optionName: null,
      optionAdd: 0,
      extras: [],
      notes: '',
      unitPrice: Number(item.price),
      quantity: 1,
    };
    setCart((c) => [...c, line]);
    flyTo(srcEl, fabRef.current);
    showToast(`${item.name} added`);
    bumpBadge();
  }, [showToast]);

  // ===== Badge bump =====
  const badgeRef = useRef(null);
  const bumpBadge = () => {
    const el = badgeRef.current;
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  };

  // ===== Open category =====
  const openCategory = useCallback((slug, mode) => {
    arm();
    setCurrentCatSlug(slug);
    setScreen('category');
    setScreenBack(mode === 'back');
    window.scrollTo({ top: 0, behavior: 'instant' });
    // show first-visit swipe hint
    try {
      if (!localStorage.getItem('menu_swipe_hint_seen')) {
        const el = swipeHintRef.current;
        if (el) {
          el.classList.add('show');
          setTimeout(() => {
            el.classList.remove('show');
            localStorage.setItem('menu_swipe_hint_seen', '1');
          }, 3400);
        }
      }
    } catch {}
  }, [arm]);
  const goHome = () => {
    setScreen('home');
    setScreenBack(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // ===== Detail overlay =====
  const [detailItem, setDetailItem] = useState(null);
  const [detailSel, setDetailSel] = useState({}); // { groupId: optionId } + extras Set + qty + notes
  const openDetail = (item) => {
    arm();
    setDetailItem(item);
    const initial = { opts: {}, extras: new Set(), qty: 1, notes: '' };
    (item.optionGroups || []).forEach((g) => {
      if (g.options && g.options[0]) initial.opts[g.id] = g.options[0].id;
    });
    setDetailSel(initial);
    // Only lock body scroll on phone/tablet (≤1023px). On desktop the overlay
    // is a right-side drawer, so the menu behind it should stay scrollable.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      document.body.style.overflow = 'hidden';
    }
  };
  const closeDetail = () => {
    setDetailItem(null);
    document.body.style.overflow = '';
  };

  // ===== Cart overlay =====
  const [cartOpen, setCartOpen] = useState(false);
  const openCart = () => {
    arm();
    setCartOpen(true);
    document.body.style.overflow = 'hidden';
  };
  const closeCart = () => { setCartOpen(false); document.body.style.overflow = ''; };

  // ===== Checkout / Confirmed / Payment overlay state =====
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmedOpen, setConfirmedOpen] = useState(!!openConfirmed && !!initialOrder);
  const [payOpen, setPayOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(initialOrder);
  const [coOrderType, setCoOrderType] = useState(initialOrder?.orderType || (initialOrder ? 'dine_in' : (searchParams?.get('table') ? 'dine_in' : 'dine_in')));
  const [coCarrier, setCoCarrier] = useState('90');
  const [coCarrierOpen, setCoCarrierOpen] = useState(false);
  const [coPhoneFocus, setCoPhoneFocus] = useState(false);
  const [coName, setCoName] = useState('');
  const [coPhone, setCoPhone] = useState('');
  const [coTable, setCoTable] = useState('');
  const [coAddress, setCoAddress] = useState('');
  const [coError, setCoError] = useState('');
  const [coSubmitting, setCoSubmitting] = useState(false);
  const prefillLoadedRef = useRef(false);

  // Lock body scroll when confirmed is shown via deep link
  useEffect(() => {
    if (confirmedOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill from /api/customer/me on first checkout open
  useEffect(() => {
    if (!checkoutOpen || prefillLoadedRef.current) return;
    prefillLoadedRef.current = true;
    fetch('/api/customer/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.name && !coName) setCoName(data.name);
        if (data.phone && !coPhone) {
          const digits = data.phone.replace(/^252/, '');
          const c = CARRIERS.find((x) => digits.startsWith(x.prefix));
          if (c) {
            setCoCarrier(c.prefix);
            setCoPhone(digits.slice(c.prefix.length));
          } else {
            setCoPhone(digits);
          }
        }
        if (data.address && !coAddress) setCoAddress(data.address);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOpen]);

  // ===== Search =====
  const [searchQ, setSearchQ] = useState('');
  const searchMatches = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return null;
    return allItems.filter((it) =>
      it.name.toLowerCase().includes(q) ||
      (it.description || '').toLowerCase().includes(q) ||
      (it._cat?.name || '').toLowerCase().includes(q) ||
      (it.tags || []).some((t) => t.label?.toLowerCase().includes(q))
    );
  }, [allItems, searchQ]);

  // ===== Social links (header contact + footer row) =====
  const headerContact = useMemo(() => {
    const c = pickContact(socialLinks);
    if (!c) return null;
    const href = socialHref(c.platform, c.value);
    return href ? { ...c, href } : null;
  }, [socialLinks]);
  const footerLinks = useMemo(
    () => socialLinks
      .map((l) => ({ ...l, href: socialHref(l.platform, l.value) }))
      .filter((l) => l.href && SOCIAL_ICONS[l.platform]),
    [socialLinks]
  );
  const whatsappHref = useMemo(() => {
    const wa = socialLinks.find((l) => l.platform === 'whatsapp');
    return wa ? socialHref('whatsapp', wa.value) : null;
  }, [socialLinks]);

  // ===== Scroll handling for sticky shadows + active section =====
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (topbarRef.current) topbarRef.current.classList.toggle('solid', y > 60);
      if (catwrapHomeRef.current) {
        const r = catwrapHomeRef.current.getBoundingClientRect();
        catwrapHomeRef.current.classList.toggle('stuck', r.top <= 1);
      }
      if (catTabsCatRef.current) {
        const r = catTabsCatRef.current.getBoundingClientRect();
        catTabsCatRef.current.classList.toggle('stuck', r.top <= 1);
      }

      // Home tab stays "All" (rendered active by default) the whole way down —
      // the home screen is a curated overview, so no per-section tab tracking.

      if (screen === 'category' && swipeNextRef.current) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const near = (max - y) < 80;
        swipeNextRef.current.classList.toggle('visible', !near);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [screen, ordered]);

  // ===== IntersectionObserver for reveal =====
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [screen, currentCatSlug, searchQ]);

  // ===== Swipe gestures on category screen =====
  useEffect(() => {
    if (screen !== 'category') return;
    const el = screenCatRef.current;
    if (!el) return;
    let sx = 0, sy = 0, active = false, moved = false;
    const onStart = (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; active = true; moved = false; };
    const onMove = (e) => { if (!active) return; const t = e.changedTouches[0]; if (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) moved = true; };
    const onEnd = (e) => {
      if (!active) return; active = false; if (!moved) return;
      const t = e.changedTouches[0]; const dx = t.clientX - sx; const dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const ids = orderedSlugs;
      const i = ids.indexOf(currentCatSlug);
      if (i < 0) return;
      const ni = dx < 0 ? (i + 1) % ids.length : (i - 1 + ids.length) % ids.length;
      openCategory(ids[ni], 'slide');
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [screen, currentCatSlug, orderedSlugs, openCategory]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const s = navRef.current;
        if (s.confirmedOpen || s.checkoutOpen || s.detail || s.cartOpen || s.screen === 'category') goBack();
        return;
      }
      if (screen === 'category' && currentCatSlug) {
        const ids = orderedSlugs;
        const i = ids.indexOf(currentCatSlug);
        if (i < 0) return;
        if (e.key === 'ArrowRight') openCategory(ids[(i + 1) % ids.length], 'slide');
        else if (e.key === 'ArrowLeft') openCategory(ids[(i - 1 + ids.length) % ids.length], 'slide');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, currentCatSlug, orderedSlugs, goBack, openCategory]);

  // ===== Detail computed total =====
  const detailTotal = useMemo(() => {
    if (!detailItem) return 0;
    let unit = Number(detailItem.price);
    (detailItem.optionGroups || []).forEach((g) => {
      const selId = detailSel.opts?.[g.id];
      const o = (g.options || []).find((x) => x.id === selId);
      if (o) unit += Number(o.priceAdd);
    });
    (detailItem.extras || []).forEach((x) => {
      if (detailSel.extras?.has(x.id)) unit += Number(x.priceAdd);
    });
    return unit * (detailSel.qty || 1);
  }, [detailItem, detailSel]);

  const addDetailToCart = (srcEl) => {
    if (!detailItem) return;
    let unit = Number(detailItem.price);
    const selectedOptions = [];
    (detailItem.optionGroups || []).forEach((g) => {
      const selId = detailSel.opts?.[g.id];
      const o = (g.options || []).find((x) => x.id === selId);
      if (o) { unit += Number(o.priceAdd); selectedOptions.push(o.name); }
    });
    const selectedExtras = [];
    (detailItem.extras || []).forEach((x) => {
      if (detailSel.extras?.has(x.id)) {
        unit += Number(x.priceAdd);
        selectedExtras.push({ name: x.name, priceAdd: Number(x.priceAdd) });
      }
    });
    const line = {
      uid: Math.random().toString(36).slice(2),
      itemId: detailItem.id,
      name: detailItem.name,
      imageUrl: detailItem.imageUrl,
      optionName: selectedOptions.length ? selectedOptions.join(' · ') : null,
      optionAdd: 0,
      extras: selectedExtras,
      notes: detailSel.notes || '',
      unitPrice: unit,
      quantity: detailSel.qty || 1,
    };
    setCart((c) => [...c, line]);
    flyTo(srcEl, fabRef.current);
    showToast(`${line.quantity}× ${detailItem.name} added`);
    closeDetail();
    bumpBadge();
  };

  // ===== Cart line ops =====
  const lineInc = (uid) => setCart((c) => c.map((x) => x.uid === uid ? { ...x, quantity: Math.min(x.quantity + 1, 20) } : x));
  const lineDec = (uid) => setCart((c) => {
    const x = c.find((l) => l.uid === uid);
    if (!x) return c;
    if (x.quantity <= 1) return c.filter((l) => l.uid !== uid);
    return c.map((l) => l.uid === uid ? { ...l, quantity: l.quantity - 1 } : l);
  });
  const lineRemove = (uid) => setCart((c) => c.filter((l) => l.uid !== uid));

  // ===== Proceed to checkout (in-shell overlay) =====
  const goCheckout = () => {
    if (!cart.length) return;
    arm();
    try { localStorage.setItem('menu_cart', JSON.stringify(cart)); } catch {}
    if (tableFromQr) {
      setCoTable(tableFromQr);
      setCoOrderType('dine_in');
    } else if (!coTable) {
      // default to dine_in unless user picks delivery
      setCoOrderType((t) => t || 'dine_in');
    }
    setCartOpen(false);
    setCheckoutOpen(true);
    setCoError('');
    document.body.style.overflow = 'hidden';
  };

  const closeCheckout = () => {
    setCheckoutOpen(false);
    document.body.style.overflow = '';
  };

  const goCheckoutBackToCart = () => {
    setCheckoutOpen(false);
    setCartOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeConfirmed = () => {
    setConfirmedOpen(false);
    setCompletedOrder(null);
    setCart([]);
    try { localStorage.removeItem('menu_cart'); localStorage.removeItem('kfg_cart'); } catch {}
    document.body.style.overflow = '';
    // Clear ?ref= from URL if present (deep link)
    if (typeof window !== 'undefined' && window.location.search.includes('ref=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState(null, '', url.pathname + (url.search ? url.search : ''));
    }
    setScreen('home');
    setScreenBack(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const submitCheckout = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setCoError('');
    if (!coName.trim()) return setCoError('Please enter your full name.');
    if (!coPhone.trim()) return setCoError('Please enter your phone number.');
    if (coOrderType === 'dine_in' && !coTable.trim()) return setCoError('Please enter your table number.');
    if (coOrderType === 'delivery' && !coAddress.trim()) return setCoError('Please enter your delivery address.');

    const fullPhone = '252' + coCarrier + coPhone.replace(/\D/g, '');
    const total = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);

    setCoSubmitting(true);
    setPayOpen(true);
    try {
      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: coName.trim(),
          phone: fullPhone,
          orderType: coOrderType,
          address: coOrderType === 'delivery' ? coAddress.trim() : undefined,
          tableNumber: coOrderType === 'dine_in' ? coTable.trim() : undefined,
          cart,
          total,
        }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutData.reference) {
        throw new Error(checkoutData.error || 'Could not start checkout.');
      }
      const payRes = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: checkoutData.reference }),
      });
      const payData = await payRes.json();
      if (!payData.success) {
        const msg = payData.error === 'cancelled' ? 'Payment was cancelled.'
                  : payData.error === 'timeout' ? 'Payment timed out — please try again.'
                  : 'Payment could not be completed.';
        throw new Error(msg);
      }
      // Persist the auth cookie for prefill on future visits
      if (payData.token) {
        try {
          await fetch('/api/auth/set-cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: payData.token }),
          });
        } catch {}
      }
      // Build the in-memory order for the confirmation screen — avoids /api/order roundtrip
      const order = {
        reference: payData.reference,
        items: cart,
        total,
        orderType: coOrderType,
        tableNumber: coOrderType === 'dine_in' ? coTable.trim() : null,
        address: coOrderType === 'delivery' ? coAddress.trim() : null,
        customer: { name: coName.trim(), phone: fullPhone },
      };
      setCompletedOrder(order);
      setPayOpen(false);
      setCheckoutOpen(false);
      setConfirmedOpen(true);
    } catch (err) {
      setPayOpen(false);
      setCoError(err.message || 'Something went wrong.');
    } finally {
      setCoSubmitting(false);
    }
  };

  // Keep a fresh snapshot for the mount-only popstate listener
  useEffect(() => {
    navRef.current = {
      screen,
      detail: !!detailItem,
      cartOpen,
      checkoutOpen,
      confirmedOpen,
      payOpen,
    };
  });

  // Back button / iOS edge-swipe / Android back → close exactly one layer.
  // The fired sentinel is already consumed; close one layer by priority and
  // re-arm if we're still nested. Plain home falls through → app exits.
  useEffect(() => {
    if (confirmedOpen) arm(); // deep-linked confirmation (?ref=)
    const onPop = () => {
      const s = navRef.current;
      if (s.payOpen) { arm(); return; } // block back mid-payment
      if (s.confirmedOpen) { closeConfirmed(); return; }
      if (s.checkoutOpen) { goCheckoutBackToCart(); arm(); return; }
      if (s.detail) { closeDetail(); if (s.screen === 'category') arm(); return; }
      if (s.cartOpen) { closeCart(); if (s.screen === 'category') arm(); return; }
      if (s.screen === 'category') { goHome(); return; }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the active category tab scrolled into view on the category screen
  useEffect(() => {
    if (screen !== 'category') return;
    const row = catnavCatRef.current;
    const btn = row?.querySelector('.cat.active');
    if (btn) centerTab(row, btn);
  }, [screen, currentCatSlug, centerTab]);

  // ============================================================
  //                              RENDER
  // ============================================================
  return (
    <div className="menu-root">
      <div className="shell">
        <div className="screens">

          {/* HOME */}
          <section className={`screen ${screen === 'home' ? 'active' : ''} ${screen === 'home' && screenBack ? 'back' : ''}`}>
            <div className="topbar" ref={topbarRef}>
              <div className="crest">
                <div className="mk"><span>HJ</span></div>
                <span className="crest-name"><span>Hotel</span><span>Jazeera</span></span>
              </div>
              {headerContact && (
                <a
                  className="wa-btn"
                  href={headerContact.href}
                  {...(headerContact.platform === 'phone' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                  aria-label={headerContact.platform === 'whatsapp' ? 'Chat with us on WhatsApp' : SOCIAL_LABELS[headerContact.platform]}
                >
                  {SOCIAL_ICONS[headerContact.platform]}
                </a>
              )}
            </div>

            <div className="search-row hero-stagger">
              <div className="search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search dishes, drinks, ingredients…" />
              </div>
              <button className="filter-chip" type="button" aria-label="Filters">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="9" y1="18" x2="15" y2="18" /></svg>
              </button>
            </div>

            {/* Search results override banner & sections */}
            {searchMatches !== null ? (
              <div className={`search-results ${searchMatches.length ? '' : 'empty'}`}>
                {searchMatches.length === 0 ? (
                  <div className="none">No dishes match &quot;<b>{searchQ}</b>&quot;</div>
                ) : (
                  searchMatches.map((it) => (
                    <WideCard key={it.id} item={it} onClick={() => openDetail(it)} onAdd={quickAdd} />
                  ))
                )}
              </div>
            ) : (
              <>
                {banner && (
                  <div className="banner-wrap">
                    <div className="banner">
                      <div className="banner-img"><ImgWithFallback src={banner.imageUrl} alt="" /></div>
                      <div className="grain" />
                      <div>
                        <span className="banner-tag">{banner.tagLabel}</span>
                        <h2 dangerouslySetInnerHTML={{ __html: banner.headline }} />
                        <p>{banner.body}</p>
                      </div>
                      <div>
                        <div className="meta-row">
                          {banner.meta1Value ? <div><b>{banner.meta1Value}</b>{banner.meta1Label}</div> : null}
                          {banner.meta2Value ? <div><b>{banner.meta2Value}</b>{banner.meta2Label}</div> : null}
                          {banner.meta3Value ? <div><b>{banner.meta3Value}</b>{banner.meta3Label}</div> : null}
                        </div>
                        <div className="cta-row">
                          <button className="cta" onClick={() => banner.ctaCategorySlug && openCategory(banner.ctaCategorySlug)}>
                            <span>{banner.ctaText}</span>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                          </button>
                          <button className="cta-ghost" onClick={() => { catwrapHomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>View full menu</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="catnav-wrap" ref={catwrapHomeRef}>
                  <div className="catnav-handle" />
                  <nav className="catnav" ref={catnavHomeRef}>
                    <button className="cat active" data-cat="all" onClick={() => {
                      const first = ordered[0];
                      if (first) document.getElementById('menu-sec-' + first.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}>
                      <span className="pill" />All<span className="count">{allItems.length}</span>
                      <span className="now" />
                    </button>
                    {ordered.map((c) => (
                      <button key={c.slug} className={`cat ${c.slug === pInfo.meal ? 'now-marker' : ''}`} data-cat={c.slug} onClick={() => openCategory(c.slug)}>
                        <span className="pill" />{c.name}<span className="count">{c.items.length}</span>
                        <span className="now" />
                      </button>
                    ))}
                  </nav>
                </div>

                <main id="homeSections" ref={homeSectionsRef}>
                  {ordered.filter((c) => c.items.length).map((c) => {
                    const isNow = c.slug === pInfo.meal;
                    const featured = c.items[0];
                    const minis = c.items.slice(1, 5);
                    return (
                      <section key={c.slug} className={`section ${isNow ? 'featured-now' : ''}`} id={'menu-sec-' + c.slug}>
                        <div className="section-head reveal">
                          <div className="titleblock">
                            {isNow && <div className="kicker now-tag">Now serving</div>}
                            <h2>{c.name}</h2>
                          </div>
                          <div className="count-badge">
                            <b>{c.items.length}</b>
                            <span>dishes</span>
                          </div>
                        </div>

                        <div className="home-grid">
                          <div className="reveal"><FeaturedCard item={featured} onClick={() => openDetail(featured)} onAdd={quickAdd} /></div>

                          {minis.length > 0 && (
                            <div className="mini-grid reveal">
                              {minis.map((m) => <MiniCard key={m.id} item={m} onClick={() => openDetail(m)} onAdd={quickAdd} />)}
                            </div>
                          )}
                        </div>

                        <button className="show-more reveal" onClick={() => openCategory(c.slug)}>
                          <div className="sm-left">
                            <span className="sm-k">See all · {c.name}</span>
                            <span className="sm-t">Open the full {c.name.toLowerCase()} menu</span>
                          </div>
                          <div className="sm-right">
                            <span className="sm-count">{c.items.length} dishes</span>
                            <span className="sm-arr">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                            </span>
                          </div>
                        </button>
                      </section>
                    );
                  })}
                </main>

                <footer className="foot-info">
                  <div className="crest-lg">— Hotel Jazeera —</div>
                  <p className="foot-tag">Service that matters!</p>
                  <p className="foot-loc">Galkaio, Puntland — Somalia</p>
                  {footerLinks.length > 0 && (
                    <div className="foot-social">
                      {footerLinks.map((l) => (
                        <a
                          key={l.platform}
                          className="foot-social-btn"
                          href={l.href}
                          {...(l.platform === 'phone' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                          aria-label={SOCIAL_LABELS[l.platform] || l.platform}
                        >
                          {SOCIAL_ICONS[l.platform]}
                        </a>
                      ))}
                    </div>
                  )}
                </footer>
              </>
            )}
          </section>

          {/* CATEGORY */}
          <section className={`screen ${screen === 'category' ? 'active' : ''} ${screen === 'category' && screenBack ? 'back' : ''}`} ref={screenCatRef}>
            {currentCatSlug && (() => {
              const c = categories.find((x) => x.slug === currentCatSlug);
              if (!c) return null;
              const items = c.items;
              return (
                <>
                  <div className="cat-hero">
                    <ImgWithFallback src={c.coverUrl} alt={c.name} />
                    <button className="icon-btn" style={{ position: 'absolute', top: 18, left: 18, zIndex: 3 }} onClick={goBack} aria-label="Back">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                    </button>
                    <button className="icon-btn" style={{ position: 'absolute', top: 18, right: 18, zIndex: 3 }} onClick={openCart} aria-label="Basket">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h2l2.5 11.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L21 9H6" /><circle cx="10" cy="22" r="1" /><circle cx="18" cy="22" r="1" /></svg>
                    </button>
                    <div className="info">
                      <div className="kicker">{c.kicker || 'From the kitchen'}</div>
                      <h1 dangerouslySetInnerHTML={{ __html: c.headline || c.name }} />
                      <div className="meta">
                        <span><b>{items.length}</b> dishes</span>
                        <span className="dot" />
                        <span>{c.sub || ''}</span>
                      </div>
                    </div>
                  </div>

                  <div className="cat-tabs" ref={catTabsCatRef}>
                    <div className="scroll-row" ref={catnavCatRef}>
                      <button className="cat" data-cat="all" onClick={goBack}>
                        <span className="pill" />All<span className="count">{allItems.length}</span><span className="now" />
                      </button>
                      {ordered.map((cc) => (
                        <button key={cc.slug} className={`cat ${cc.slug === currentCatSlug ? 'active' : ''} ${cc.slug === pInfo.meal ? 'now-marker' : ''}`} data-cat={cc.slug} onClick={() => openCategory(cc.slug, 'slide')}>
                          <span className="pill" />{cc.name}<span className="count">{cc.items.length}</span><span className="now" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="cat-list">
                    {items.length === 0 ? (
                      <div className="cat-empty">No dishes yet.</div>
                    ) : (
                      <>
                        <div className="reveal"><FeaturedCard item={items[0]} onClick={() => openDetail(items[0])} onAdd={quickAdd} /></div>
                        {items[1] && items[2] && (
                          <>
                            <div className="cat-divider reveal">Selected for you</div>
                            <div className="row-2up reveal">
                              <MiniCard item={items[1]} onClick={() => openDetail(items[1])} onAdd={quickAdd} />
                              <MiniCard item={items[2]} onClick={() => openDetail(items[2])} onAdd={quickAdd} />
                            </div>
                          </>
                        )}
                        {items[1] && !items[2] && (
                          <div className="row-2up reveal">
                            <MiniCard item={items[1]} onClick={() => openDetail(items[1])} onAdd={quickAdd} />
                          </div>
                        )}
                        {items.length > 3 && (
                          <>
                            <div className="cat-divider reveal">More from the {c.name.toLowerCase()}</div>
                            <div className="wide-grid">
                              {items.slice(3).map((it) => (
                                <div key={it.id} className="reveal"><WideCard item={it} onClick={() => openDetail(it)} onAdd={quickAdd} /></div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </section>

        </div>{/* /.screens */}

        {/* Cart FAB */}
        <button ref={fabRef} className={`cart-fab ${cartCount > 0 ? 'visible' : ''}`} aria-label="Open basket" onClick={openCart}>
          <div className="icn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h2l2.5 11.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L21 9H6" />
              <circle cx="10" cy="22" r="1" /><circle cx="18" cy="22" r="1" />
            </svg>
            <span ref={badgeRef} className="badge">{cartCount}</span>
          </div>
          <span>Your basket</span>
          <span className="total"><span>{FMT(cartTotal)}</span><span className="arr">→</span></span>
        </button>

        {/* Swipe next */}
        {screen === 'category' && currentCatSlug && (() => {
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
        })()}

        {/* Swipe hint */}
        <div ref={swipeHintRef} className="swipe-hint">
          <div className="hand">👆</div>
          <div className="ht">
            <b>Swipe to explore</b>
            <span>Drag left/right to slide between categories.</span>
          </div>
        </div>

        {/* DETAIL */}
        <div className={`page ${detailItem ? 'open' : ''}`}>
          {detailItem && (
            <>
              <div className="detail">
                <div className="detail-hero">
                  <ImgWithFallback src={detailItem.imageUrl} alt={detailItem.name} />
                  <div className="detail-top">
                    <button className="icon-btn" aria-label="Back" onClick={goBack}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                    </button>
                    {whatsappHref && (
                      <a className="icon-btn wa" href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" onClick={(e) => e.stopPropagation()}>
                        {SOCIAL_ICONS.whatsapp}
                      </a>
                    )}
                  </div>
                  <div className="pricebadge">
                    <span className="lbl">From</span>
                    <span className="val">{FMT(detailItem.price)}</span>
                  </div>
                </div>

                <div className="detail-body">
                  <div className="detail-cat">{detailItem._cat?.name || ''}</div>
                  <h2 className="detail-name">{detailItem.name}</h2>
                  <p className="detail-desc">{detailItem.description}</p>

                  <div className="detail-meta">
                    <div className="cell"><span className="k">Time</span><span className="v">{detailItem.prepTime || '—'}</span></div>
                    <div className="cell"><span className="k">Kcal</span><span className="v">{detailItem.kcal || '—'}</span></div>
                    <div className="cell"><span className="k">Pairing</span><span className="v">{detailItem.pairing || '—'}</span></div>
                  </div>

                  {(detailItem.optionGroups || []).map((g) => (
                    <div className="detail-section" key={g.id}>
                      <h4>Choose your option <small>· {g.title.toLowerCase()}</small></h4>
                      <div className="opt-list">
                        {(g.options || []).map((o) => (
                          <div key={o.id} className={`opt ${detailSel.opts?.[g.id] === o.id ? 'selected' : ''}`} onClick={() => setDetailSel((s) => ({ ...s, opts: { ...s.opts, [g.id]: o.id } }))}>
                            <div className="left"><div className="radio" /><span className="name">{o.name}</span></div>
                            <span className="price-add">{Number(o.priceAdd) === 0 ? 'Included' : '+ ' + FMT(o.priceAdd)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {detailItem.extras && detailItem.extras.length > 0 && (
                    <div className="detail-section">
                      <h4>Add extras <small>optional</small></h4>
                      <div className="extras">
                        {detailItem.extras.map((x) => (
                          <div key={x.id} className={`extra ${detailSel.extras?.has(x.id) ? 'checked' : ''}`} onClick={() => setDetailSel((s) => {
                            const next = new Set(s.extras || []);
                            if (next.has(x.id)) next.delete(x.id); else next.add(x.id);
                            return { ...s, extras: next };
                          })}>
                            <div className="left">
                              <div className="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div>
                              <span className="name">{x.name}</span>
                            </div>
                            <span className="price-add">+ {FMT(x.priceAdd)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="detail-section">
                    <h4>Notes for the kitchen <small>optional</small></h4>
                    <textarea className="notes" rows={2} placeholder="Allergies, no onion, well done…" value={detailSel.notes || ''} onChange={(e) => setDetailSel((s) => ({ ...s, notes: e.target.value }))} />
                  </div>

                  <div className="qty-row">
                    <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>Quantity</div>
                    <div className="qty">
                      <button aria-label="decrease" onClick={() => setDetailSel((s) => ({ ...s, qty: Math.max((s.qty || 1) - 1, 1) }))}>−</button>
                      <span className="val">{detailSel.qty || 1}</span>
                      <button aria-label="increase" onClick={() => setDetailSel((s) => ({ ...s, qty: Math.min((s.qty || 1) + 1, 20) }))}>+</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-cta">
                <div className="total-mini">
                  <span className="k">Total</span>
                  <span className="v">{FMT(detailTotal)}</span>
                </div>
                <button className="cta-btn" onClick={(e) => addDetailToCart(e.currentTarget)}>
                  <span>Add to basket →</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* CART */}
        <div className={`page ${cartOpen ? 'open' : ''}`}>
          <div className="cart-head">
            <h3>Your <span>basket</span></h3>
            <button className="icon-btn" aria-label="Close basket" onClick={goBack}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="cart-meta">
            {tableFromQr ? (
              <span className="table-tag">● Table {tableFromQr}</span>
            ) : (
              <span className="table-tag table-tag-muted">Pick service at checkout</span>
            )}
            <span>{cartCount} item{cartCount === 1 ? '' : 's'}</span>
          </div>
          <div className="cart-list">
            {cart.length === 0 ? (
              <div className="cart-empty">
                <div className="ring">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h2l2.5 11.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L21 9H6" /><circle cx="10" cy="22" r="1" /><circle cx="18" cy="22" r="1" /></svg>
                </div>
                <h4>Your basket is empty</h4>
                <p>Tap any dish to add it. Build your order, then proceed to checkout.</p>
                <button className="browse" onClick={goBack}>Browse menu</button>
              </div>
            ) : (
              cart.map((c) => {
                const summary = [c.optionName, ...(c.extras || []).map((e) => e.name), c.notes].filter(Boolean).join(' · ');
                return (
                  <div className="cart-item" key={c.uid}>
                    {c.imageUrl ? <ImgWithFallback src={c.imageUrl} alt="" /> : <div className="ci-img-fallback" />}
                    <div className="ci-body">
                      <h5 className="ci-name">{c.name}</h5>
                      <div className="ci-opts">{summary || ' '}</div>
                      <div className="ci-qty">
                        <button onClick={() => lineDec(c.uid)}>−</button>
                        <span className="val">{c.quantity}</span>
                        <button onClick={() => lineInc(c.uid)}>+</button>
                      </div>
                    </div>
                    <div className="ci-right">
                      <span className="ci-price">{FMT(c.unitPrice * c.quantity)}</span>
                      <button className="ci-rm" onClick={() => lineRemove(c.uid)}>Remove</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="cart-foot">
            <div className="cart-summary">
              <div className="summary-row"><span>Subtotal</span><span>{FMT(cartTotal)}</span></div>
              <div className="summary-row total"><span className="lbl">Total</span><span>{FMT(cartTotal)}</span></div>
            </div>
            <button className="show-waiter" onClick={goCheckout} disabled={!cart.length}>
              <span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                Proceed to checkout
              </span>
            </button>
          </div>
        </div>

        {/* CHECKOUT overlay */}
        <CheckoutScreen
          open={checkoutOpen}
          orderType={coOrderType}
          setOrderType={setCoOrderType}
          carrier={coCarrier}
          setCarrier={setCoCarrier}
          carrierOpen={coCarrierOpen}
          setCarrierOpen={setCoCarrierOpen}
          phoneFocus={coPhoneFocus}
          setPhoneFocus={setCoPhoneFocus}
          name={coName} setName={setCoName}
          phone={coPhone} setPhone={setCoPhone}
          table={coTable} setTable={setCoTable}
          address={coAddress} setAddress={setCoAddress}
          error={coError}
          submitting={coSubmitting}
          cart={cart}
          onSubmit={submitCheckout}
          onBack={goBack}
        />

        {/* PAYMENT MODAL */}
        <div className={`pay-modal ${payOpen ? 'show' : ''}`}>
          <div className="pay-card">
            <div className="pay-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="2" width="12" height="20" rx="2.5" />
                <line x1="11" y1="18" x2="13" y2="18" />
              </svg>
            </div>
            <h2>Check your <em>phone.</em></h2>
            <p>Approve the payment on your Waafi app to complete your order.</p>
          </div>
        </div>

        {/* CONFIRMED overlay */}
        <ConfirmedScreen
          open={confirmedOpen}
          order={completedOrder}
          onBack={goBack}
        />

        <div className={`toast ${toastMsg ? 'show' : ''}`}>{toastMsg || 'Added'}</div>
      </div>
    </div>
  );
}

function CheckoutScreen({
  open, orderType, setOrderType,
  carrier, setCarrier, carrierOpen, setCarrierOpen,
  phoneFocus, setPhoneFocus,
  name, setName, phone, setPhone, table, setTable, address, setAddress,
  error, submitting, cart, onSubmit, onBack,
}) {
  const total = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const selCarrier = CARRIERS.find((c) => c.prefix === carrier) || CARRIERS[0];
  const itemCount = cart.length;

  // Close carrier menu on outside click
  useEffect(() => {
    if (!carrierOpen) return;
    const onClick = (e) => {
      if (!e.target.closest?.('.carrier')) setCarrierOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [carrierOpen, setCarrierOpen]);

  return (
    <div className={`page checkout-page ${orderType === 'dine_in' ? 'dine' : 'delivery'} ${open ? 'open' : ''}`}>
      <div className="co-scroll">
        <div className="topbar solid co-topbar">
          <div className="crest">
            <div className="mk"><span>HJ</span></div>
            <span className="crest-name"><span>Hotel</span><span>Jazeera</span></span>
          </div>
          <button type="button" className="co-back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
            Back to basket
          </button>
        </div>

        <div className="co-content">
          <h1 className="co-title">Almost <em>there.</em></h1>
          <p className="co-sub">
            {orderType === 'dine_in'
              ? 'Review your basket and confirm your table.'
              : 'Review your basket and tell us where to send it.'}
          </p>

          <div className="co-cols">
            <div className="co-left">
              <div className="co-card">
                <div className="co-eyebrow">Your basket</div>
                <h2 className="co-h2">{itemCount} item{itemCount === 1 ? '' : 's'}</h2>
                <div>
                  {cart.map((c) => {
                    const sub = [c.optionName, ...(c.extras || []).map((e) => e.name), c.notes].filter(Boolean).join(' · ');
                    return (
                      <div className="co-item" key={c.uid}>
                        <ImgWithFallback src={c.imageUrl} alt="" />
                        <div className="ci-body">
                          <p className="ci-name">
                            {c.name}
                            {c.quantity > 1 && <span className="ci-qty-mark"> × {c.quantity}</span>}
                          </p>
                          {sub && <div className="ci-sub">{sub}</div>}
                        </div>
                        <span className="ci-price">{FMT(c.unitPrice * c.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="co-total-row">
                  <span className="lbl">Total</span>
                  <span className="amt">{FMT(total)}</span>
                </div>
              </div>
            </div>

            <div className="co-right">
              <div className="co-card">
                <div className="co-eyebrow">{orderType === 'dine_in' ? 'Dine-in' : 'Delivery'}</div>
                <h2 className="co-h2" dangerouslySetInnerHTML={{ __html:
                  orderType === 'dine_in'
                    ? 'Where are you <em style="color:var(--green)">sitting?</em>'
                    : 'Where should we <em style="color:var(--blue)">send it?</em>'
                }} />

                <div className="ordertype">
                  <button type="button" className={`ot ${orderType === 'dine_in' ? 'active' : ''}`} onClick={() => setOrderType('dine_in')}>
                    Dine-in<span>I&apos;m at a table</span>
                  </button>
                  <button type="button" className={`ot ${orderType === 'delivery' ? 'active' : ''}`} onClick={() => setOrderType('delivery')}>
                    Delivery<span>Bring it to me</span>
                  </button>
                </div>

                <form onSubmit={onSubmit} noValidate>
                  <div className="co-field">
                    <label className="co-label" htmlFor="co-name">Full name</label>
                    <input id="co-name" className="co-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" />
                  </div>

                  <div className="co-field">
                    <label className="co-label">Phone</label>
                    <div className={`phone-row ${phoneFocus ? 'focus' : ''}`}>
                      <div className={`carrier ${carrierOpen ? 'open' : ''}`}>
                        <button className="carrier-btn" type="button" onClick={(e) => { e.stopPropagation(); setCarrierOpen((v) => !v); }}>
                          <span className="carrier-dot" style={{ background: selCarrier.color }} />
                          <span className="carrier-name">{selCarrier.name}</span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                        {carrierOpen && (
                          <div className="carrier-menu">
                            {CARRIERS.map((c) => (
                              <button key={c.prefix} type="button" className={`carrier-opt ${c.prefix === carrier ? 'sel' : ''}`} onClick={() => { setCarrier(c.prefix); setCarrierOpen(false); }}>
                                <span className="carrier-dot" style={{ background: c.color }} />
                                <span className="carrier-name">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        onFocus={() => setPhoneFocus(true)}
                        onBlur={() => setPhoneFocus(false)}
                        placeholder="7454776"
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                    </div>
                    <p className="co-hint">Your Waafi / EVC number — we&apos;ll send a payment prompt here.</p>
                  </div>

                  {orderType === 'dine_in' ? (
                    <div className="co-field">
                      <label className="co-label" htmlFor="co-table">Table number</label>
                      <input id="co-table" className="co-input" type="text" value={table} onChange={(e) => setTable(e.target.value)} inputMode="numeric" placeholder="e.g. 14" />
                      <p className="co-hint">We&apos;ll bring the order to this table.</p>
                    </div>
                  ) : (
                    <div className="co-field">
                      <label className="co-label" htmlFor="co-addr">Delivery address</label>
                      <input id="co-addr" className="co-input" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Garden Crescent, building 14" />
                    </div>
                  )}

                  {error && <p className="co-error">{error}</p>}

                  <button className="place-order" type="submit" disabled={submitting || cart.length === 0}>
                    {submitting ? 'Processing…' : `Place order  ·  ${FMT(total)}`}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmedScreen({ open, order, onBack }) {
  if (!order) {
    return <div className={`page confirmed-page ${open ? 'open' : ''}`} />;
  }
  const total = Number(order.total) || (order.items || []).reduce((s, c) => s + (c.unitPrice ?? c.price ?? 0) * (c.quantity ?? 1), 0);
  return (
    <div className={`page confirmed-page ${open ? 'open' : ''}`}>
      <div className="cf-scroll">
        <div className="topbar solid cf-topbar">
          <div className="crest">
            <div className="mk"><span>HJ</span></div>
            <span className="crest-name"><span>Hotel</span><span>Jazeera</span></span>
          </div>
        </div>
        <div className="cf-body">
          <div className="cf-card">
            <div className="cf-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="cf-eyebrow">Order received</div>
            <h1 className="cf-title">Thank <em>you.</em></h1>
            <p className="cf-where">
              {order.orderType === 'dine_in' ? (
                <>We&apos;re bringing it to <strong>Table {order.tableNumber}</strong>.</>
              ) : (
                <>We&apos;re on our way to <strong>{order.address}</strong>.</>
              )}
            </p>
            <div className="cf-items">
              {(order.items || []).map((item, i) => {
                const price = item.unitPrice ?? item.price ?? 0;
                const qty = item.quantity ?? 1;
                const sub = [item.optionName ?? item.variant, ...(item.extras || []).map((e) => e.name), item.notes].filter(Boolean).join(' · ');
                return (
                  <div className="cf-row" key={item.uid ?? i}>
                    <div className="ci-body">
                      <p className="ci-name">
                        {item.name}
                        {qty > 1 && <span className="ci-qty-mark"> × {qty}</span>}
                      </p>
                      {sub && <div className="ci-sub">{sub}</div>}
                    </div>
                    <span className="ci-price">{FMT(price * qty)}</span>
                  </div>
                );
              })}
            </div>
            <div className="cf-total">
              <span className="lbl">Total</span>
              <span className="amt">{FMT(total)}</span>
            </div>
            <button className="cf-back" type="button" onClick={onBack}>Back to menu</button>
          </div>
        </div>
      </div>
    </div>
  );
}

