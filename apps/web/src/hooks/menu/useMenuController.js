'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { SOCIAL_ICONS, socialHref, pickContact } from '@/components/menu/socialIcons';
import { flyTo, CARRIERS } from '@/lib/menu/format';
import useCart from './useCart';
import useOrderContext from './useOrderContext';

// Last checkout details typed on this device (name, phone, delivery address).
const CHECKOUT_DETAILS_KEY = 'menu_checkout_details';

// Owns all customer-menu state, navigation, and the checkout flow. Returns a single
// object consumed via MenuContext so the presentational screens stay thin.
export default function useMenuController({ rawCategories, socialLinks = [], onlineOrdering, initialOrder = null, openConfirmed = false }) {
  const searchParams = useSearchParams();

  // ?table=N from the QR code, persisted so checkout can use it after navigation.
  const tableFromQr = useOrderContext(searchParams);

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

  // Categories show in the manager's sort order, all day. Category navigation
  // (swipe / arrows / swipe-next) follows the visible tab order — All, then
  // `ordered` — so it never drifts from the tabs.
  const ordered = categories;
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
  const { cart, setCart, cartCount, cartTotal, lineInc, lineDec, lineRemove } = useCart();

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

  // ===== Badge bump =====
  const badgeRef = useRef(null);
  const bumpBadge = () => {
    const el = badgeRef.current;
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  };

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
  }, [showToast, setCart]);

  // ===== Open category =====
  const openCategory = useCallback((slug, mode) => {
    arm();
    setCurrentCatSlug(slug);
    setScreen('category');
    setScreenBack(mode === 'back');
    window.scrollTo({ top: 0, behavior: 'instant' });
    // show first-visit swipe hint
    try {
      if (!localStorage.getItem('menu_swipe_hint_seen') && !localStorage.getItem('rh_swipe_hint_seen')) {
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
  // Back from Sifalo hosted checkout without a confirmed order:
  //   ?pay=failed                 → reopen checkout with an error
  //   ?pay=pending&payref=<ref>   → "confirming payment" + poll /api/payment/status
  // (A paid return lands on ?ref=<ref>, the server-rendered confirmation.)
  const payParam = searchParams?.get('pay') || null;
  const payRef = searchParams?.get('payref') || null;
  const returnedPending = payParam === 'pending' && !!payRef;
  const returnedFailed = payParam === 'failed';
  const [checkoutOpen, setCheckoutOpen] = useState(returnedFailed);
  const [confirmedOpen, setConfirmedOpen] = useState(!!openConfirmed && !!initialOrder);
  const [payOpen, setPayOpen] = useState(returnedPending);
  // 'redirect' = sending the customer to Sifalo · 'confirming' = waiting on verify
  const [payPhase, setPayPhase] = useState(returnedPending ? 'confirming' : 'redirect');
  const [completedOrder, setCompletedOrder] = useState(initialOrder);
  const [coOrderType, setCoOrderType] = useState(initialOrder?.orderType || (initialOrder ? 'dine_in' : (searchParams?.get('table') ? 'dine_in' : 'dine_in')));
  const [coCarrier, setCoCarrier] = useState('90');
  const [coCarrierOpen, setCoCarrierOpen] = useState(false);
  const [coPhoneFocus, setCoPhoneFocus] = useState(false);
  const [coName, setCoName] = useState('');
  const [coPhone, setCoPhone] = useState('');
  const [coTable, setCoTable] = useState('');
  const [coAddress, setCoAddress] = useState('');
  const [coError, setCoError] = useState(returnedFailed ? 'Payment was not completed. Please try again.' : '');
  const [coSubmitting, setCoSubmitting] = useState(false);
  const prefillLoadedRef = useRef(false);

  // Checkout prefill. What this device typed last (saved at submit, so a retry
  // after a failed payment needs no retyping) is applied when checkout opens;
  // the server profile (/api/customer/me — set after a confirmed payment) then
  // fills whatever is still empty.
  const applyPhone = (digits) => {
    const c = CARRIERS.find((x) => digits.startsWith(x.prefix));
    if (c) { setCoCarrier(c.prefix); setCoPhone(digits.slice(c.prefix.length)); } else { setCoPhone(digits); }
  };
  const savedDetails = () => {
    try { return JSON.parse(localStorage.getItem(CHECKOUT_DETAILS_KEY) || '{}') || {}; } catch { return {}; }
  };
  const prefillFromDevice = () => {
    const local = savedDetails();
    if (local.name && !coName) setCoName(local.name);
    if (local.phone && !coPhone) applyPhone(local.phone);
    if (local.address && !coAddress) setCoAddress(local.address);
  };
  useEffect(() => {
    if (!checkoutOpen || prefillLoadedRef.current) return;
    prefillLoadedRef.current = true;
    fetch('/api/customer/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      // No profile (first visit, expired cookie, offline): device details only.
      .catch(() => null)
      .then((data) => {
        // Also covers checkout opened by a page load (back from Sifalo with ?pay=failed).
        const local = savedDetails();
        const name = local.name || data?.name;
        const phone = local.phone || data?.phone?.replace(/^252/, '');
        const address = local.address || data?.address;
        if (name && !coName) setCoName(name);
        if (phone && !coPhone) applyPhone(phone);
        if (address && !coAddress) setCoAddress(address);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOpen]);

  // Lock body scroll when confirmed is shown via deep link
  useEffect(() => {
    if (confirmedOpen || returnedFailed || returnedPending) document.body.style.overflow = 'hidden';
    // The pay flags are one-shot: drop them so a refresh doesn't replay them.
    if (payParam && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('pay');
      url.searchParams.delete('payref');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    return () => { document.body.style.overflow = ''; };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pending Sifalo payment: poll every 3s for up to 2 minutes. Paid → reload
  // onto the server-rendered confirmation; failed → back to checkout.
  useEffect(() => {
    if (!returnedPending) return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      let state = 'pending';
      try {
        const res = await fetch('/api/payment/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: payRef }),
        });
        if (res.ok) state = (await res.json()).state || 'pending';
      } catch { /* network blip — keep polling */ }
      if (cancelled) return;
      if (state === 'paid') {
        window.location.replace(`/?ref=${encodeURIComponent(payRef)}`);
        return;
      }
      if (state === 'failed') {
        setPayOpen(false);
        setCoError('Payment was not completed. Please try again.');
        prefillFromDevice();
        setCheckoutOpen(true);
        return;
      }
      if (tries >= 40) {
        setPayOpen(false);
        setToastMsg(`We're still confirming your payment. If you were charged, show reference ${payRef} to our staff.`);
        return;
      }
      setTimeout(tick, 3000);
    };
    tick();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ===== Online ordering switch (Settings › General) =====
  // Off = the basket shows the manager's message instead of checkout. The API
  // refuses checkout too; if it was switched off after the menu loaded, that
  // refusal (code ONLINE_ORDERING_OFF) flips this so the basket says so.
  const [orderingOffMsg, setOrderingOffMsg] = useState(onlineOrdering && !onlineOrdering.enabled ? onlineOrdering.message : null);
  const refusedOff = (data) => {
    if (data?.code !== 'ONLINE_ORDERING_OFF') return false;
    setOrderingOffMsg(data.error);
    return true;
  };

  // ===== Proceed to checkout (in-shell overlay) =====
  const goCheckout = () => {
    if (!cart.length || orderingOffMsg) return;
    arm();
    try { localStorage.setItem('menu_cart', JSON.stringify(cart)); } catch {}
    if (tableFromQr) {
      setCoTable(tableFromQr);
      setCoOrderType('dine_in');
    } else if (!coTable) {
      // default to dine_in unless user picks delivery
      setCoOrderType((t) => t || 'dine_in');
    }
    prefillFromDevice();
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
    try { localStorage.removeItem('menu_cart'); localStorage.removeItem('rh_cart'); localStorage.removeItem('kfg_cart'); } catch {}
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
    // Remembered on this phone only, for the next checkout (never sent anywhere else).
    try {
      localStorage.setItem(CHECKOUT_DETAILS_KEY, JSON.stringify({
        name: coName.trim(), phone: coCarrier + coPhone.replace(/\D/g, ''),
        address: coOrderType === 'delivery' ? coAddress.trim() : undefined,
      }));
    } catch { /* storage blocked (private mode) — prefill just won't happen */ }
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
      refusedOff(checkoutData);
      if (!checkoutRes.ok || !checkoutData.reference) {
        throw new Error(checkoutData.error || 'Could not start checkout.');
      }
      // Open a Sifalo hosted-checkout session and hand the customer over to it.
      // Sifalo sends them back to /api/payment/return, which verifies the
      // payment server-side and lands them on ?ref= (paid) or ?pay=… .
      const payRes = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: checkoutData.reference }),
      });
      const payData = await payRes.json().catch(() => ({}));
      if (payRes.status === 409 && payData.reference) {
        window.location.assign(`/?ref=${encodeURIComponent(payData.reference)}`);
        return;
      }
      if (refusedOff(payData)) throw new Error(payData.error);
      if (!payRes.ok || !payData.checkoutUrl) {
        throw new Error('Payment could not be started. Please try again.');
      }
      try { localStorage.setItem('menu_cart', JSON.stringify(cart)); } catch {}
      setPayPhase('redirect');
      window.location.assign(payData.checkoutUrl);
      // Keep the overlay up while the browser navigates away.
    } catch (err) {
      setPayOpen(false);
      setCoSubmitting(false);
      setCoError(err.message || 'Something went wrong.');
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

  return {
    // data
    categories, allItems, ordered, orderedSlugs,
    headerContact, footerLinks, whatsappHref, tableFromQr,
    // search
    searchQ, setSearchQ, searchMatches,
    // screen
    screen, currentCatSlug, screenBack,
    // cart
    cart, cartCount, cartTotal, lineInc, lineDec, lineRemove, cartOpen, orderingOffMsg,
    // navigation + actions
    arm, goBack, goHome, openCategory, openDetail, closeDetail,
    openCart, closeCart, quickAdd, addDetailToCart,
    // detail
    detailItem, detailSel, setDetailSel, detailTotal,
    // checkout
    checkoutOpen, coOrderType, setCoOrderType, coCarrier, setCoCarrier,
    coCarrierOpen, setCoCarrierOpen, coPhoneFocus, setCoPhoneFocus,
    coName, setCoName, coPhone, setCoPhone, coTable, setCoTable,
    coAddress, setCoAddress, coError, coSubmitting, submitCheckout, goCheckout,
    // confirmed + pay
    confirmedOpen, completedOrder, payOpen, payPhase, toastMsg,
    // refs
    fabRef, topbarRef, catwrapHomeRef, catTabsCatRef, catnavHomeRef,
    catnavCatRef, homeSectionsRef, screenCatRef, swipeNextRef, swipeHintRef, badgeRef,
  };
}
