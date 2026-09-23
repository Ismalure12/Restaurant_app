'use client';

import { useMenu } from '../MenuContext';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import { SOCIAL_ICONS } from '../socialIcons';
import { FMT } from '@/lib/menu/format';

// Item detail sheet: hero, options, extras, notes, quantity, add-to-basket.
export default function DetailOverlay() {
  const { detailItem, detailSel, setDetailSel, detailTotal, whatsappHref, goBack, addDetailToCart } = useMenu();

  return (
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
  );
}
