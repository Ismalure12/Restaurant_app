'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import Icon from '@/components/admin/ui/icons';


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
    <div ref={boxRef} className={`relative flex-none ${mobileOpen ? 'max-desk:fixed max-desk:inset-x-0 max-desk:top-0 max-desk:z-50 max-desk:p-2.5 max-desk:bg-mq-canvas max-desk:border-b max-desk:border-mq-line' : ''}`}>
      <button
        type="button"
        className={`desk:hidden grid place-items-center w-9 h-9 rounded-lg border border-mq-line bg-white text-mq-muted hover:bg-mq-canvas hover:text-mq-ink ${mobileOpen ? 'hidden' : ''}`}
        onClick={() => { setMobileOpen(true); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        aria-label="Search"
      >
        <Icon name="search" size={16} stroke={1.9} />
      </button>
      <div className={`${mobileOpen ? 'flex' : 'hidden'} desk:flex items-center gap-2 h-9 px-[11px] bg-white border border-mq-line rounded-lg w-full desk:w-[280px] focus-within:border-mq-focus focus-within:shadow-mq-focus`}>
        <span className="text-mq-muted"><Icon name="search" size={15} stroke={1.9} /></span>
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
          className="flex-1 min-w-0 border-0 outline-none bg-transparent text-base text-mq-ink placeholder:text-mq-muted"
        />
        <kbd className="max-desk:hidden font-mq-mono text-[10.5px] text-mq-muted border border-mq-line rounded-[5px] px-[5px] py-px bg-mq-cream flex-none">⌘K</kbd>
        <button type="button" className="desk:hidden grid place-items-center w-7 h-7 rounded-md text-mq-muted hover:bg-mq-chip" onClick={() => { setMobileOpen(false); setOpen(false); }} aria-label="Close search">
          <Icon name="x" size={14} stroke={2.2} />
        </button>
      </div>
      {open && dq && (
        <div id="gs-results" role="listbox" className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(420px,calc(100vw-20px))] max-h-[min(70vh,520px)] overflow-y-auto bg-white border border-mq-line rounded-xl shadow-mq-lg p-1.5 animate-mq-in motion-reduce:animate-none">
          {isError ? <div className="px-3 py-4 text-[13px] text-mq-muted">Search failed — try again.</div>
            : groups.length === 0 ? <div className="px-3 py-4 text-[13px] text-mq-muted">{isFetching || data?.q !== dq ? 'Searching…' : `Nothing matches “${dq}”.`}</div>
              : groups.map((g) => (
                <div key={g.key} className="py-1">
                  <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[.12em] text-mq-muted">{g.label}</div>
                  {g.items.map((it) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button type="button" role="option" aria-selected={i === active} key={it.id}
                        className={`w-full flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg text-left ${i === active ? 'bg-mq-soft' : 'hover:bg-mq-canvas'}`}
                        onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(it)}>
                        <span className={`text-[13.5px] font-medium ${i === active ? 'text-mq-primary' : 'text-mq-ink'}`}>{it.title}</span>
                        {it.sub && <span className="text-xs text-mq-muted">{it.sub}</span>}
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
