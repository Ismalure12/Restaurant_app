'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

const icon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;

/**
 * The topbar search: one box for order IDs, receipt numbers, customers,
 * invoices, menu items, stock, staff and expenses (GET /api/admin/search —
 * the API decides which groups this role may see). Ctrl/⌘K focuses it;
 * ↑/↓ + Enter open a result. On phones it collapses to an icon that opens a
 * full-width bar.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDq(q.trim()); setActive(0); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMobileOpen(true);
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setMobileOpen(false); } };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, []);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['global-search', dq],
    queryFn: () => fetchJson(`/api/admin/search?q=${encodeURIComponent(dq)}`),
    enabled: dq.length > 0,
    staleTime: 15 * 1000,
  });
  const groups = dq && data?.q === dq ? data.groups : [];
  const flat = groups.flatMap((g) => g.items);

  const go = (item) => {
    if (!item) return;
    setOpen(false); setMobileOpen(false); setQ(''); setDq('');
    inputRef.current?.blur();
    router.push(item.href);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
    else if (e.key === 'Escape') { setOpen(false); setMobileOpen(false); inputRef.current?.blur(); }
  };

  let idx = -1;
  return (
    <div className={`gs${mobileOpen ? ' gs-mobile-open' : ''}`} ref={boxRef}>
      <button type="button" className="icon-btn gs-trigger" onClick={() => { setMobileOpen(true); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }} aria-label="Search">{icon}</button>
      <div className="search gs-box">
        {icon}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search orders, receipts, items, stock…"
          aria-label="Search everything"
          role="combobox"
          aria-expanded={open && Boolean(dq)}
          aria-controls="gs-results"
          aria-autocomplete="list"
        />
        <kbd>⌘K</kbd>
        <button type="button" className="gs-close" onClick={() => { setMobileOpen(false); setOpen(false); }} aria-label="Close search">×</button>
      </div>
      {open && dq && (
        <div className="gs-pop" id="gs-results" role="listbox">
          {isError ? <div className="gs-empty">Search failed — try again.</div>
            : groups.length === 0 ? <div className="gs-empty">{isFetching || data?.q !== dq ? 'Searching…' : `Nothing matches “${dq}”.`}</div>
              : groups.map((g) => (
                <div className="gs-group" key={g.key}>
                  <div className="gs-label">{g.label}</div>
                  {g.items.map((it) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button type="button" role="option" aria-selected={i === active} key={it.id} className={`gs-item${i === active ? ' on' : ''}`}
                        onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(it)}>
                        <span className="gs-t">{it.title}</span>
                        <span className="gs-s">{it.sub}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
