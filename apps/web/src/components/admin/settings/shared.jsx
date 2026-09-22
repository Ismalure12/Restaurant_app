'use client';

// Pieces every Settings sub-page shares (General, Money): the section header,
// the small edit modal and the constants they use.
export const JSON_H = { 'Content-Type': 'application/json' };
export const KIND_LABEL = { cash: 'Cash', wallet: 'Mobile wallet', card: 'Card (Mastercard)', bank: 'Bank', gateway: 'Online (Sifalo)' };
export const ACCOUNTS_KEY = ['account-balances'];
export const plus = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;

export function SectionHead({ icon, gold, title, sub, action }) {
  return (
    <div className="set-head">
      <span className={`si${gold ? ' gold' : ''}`}>{icon}</span>
      <div style={{ flex: 1 }}><h3>{title}</h3><p className="sub">{sub}</p></div>
      {action}
    </div>
  );
}
export function Modal({ title, onClose, onSubmit, saving, canSave = true, banner, children }) {
  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-h"><div className="mt"><div className="h-1">{title}</div></div><button className="icon-btn" onClick={onClose} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <form onSubmit={onSubmit} noValidate>
          <div className="modal-b">{children}{banner && <div className="adm-error-banner">{banner}</div>}</div>
          <div className="modal-f"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || !canSave}>{saving ? 'Saving…' : 'Save'}</button></div>
        </form>
      </div>
    </div>
  );
}
