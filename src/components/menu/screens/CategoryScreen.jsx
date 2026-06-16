'use client';

import { useMenu } from '../MenuContext';
import FeaturedCard from '../cards/FeaturedCard';
import MiniCard from '../cards/MiniCard';
import WideCard from '../cards/WideCard';
import ImgWithFallback from '@/components/ui/ImgWithFallback';

// Full category view: hero, sticky tab bar, and the dish list.
export default function CategoryScreen() {
  const {
    screen, screenBack, screenCatRef, currentCatSlug, categories, allItems,
    ordered, pInfo, goBack, openCart, openCategory, openDetail, quickAdd,
    catTabsCatRef, catnavCatRef,
  } = useMenu();

  return (
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
  );
}
