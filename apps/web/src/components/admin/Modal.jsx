'use client';

const CloseIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>;

/** The admin dialog shell (jz-modal-bk). `wide` widens it for tables. */
export default function Modal({ title, eyebrow, onClose, busy, wide, children }) {
  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`modal${wide ? ' stm-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">{eyebrow}</div><div className="h-1" style={{ marginTop: 3 }}>{title}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>{CloseIc}</button>
        </div>
        {children}
      </div>
    </div>
  );
}
