'use client';

import { useMenu } from '../MenuContext';
import Crest from '../components/Crest';
import FeaturedCard from '../cards/FeaturedCard';
import MiniCard from '../cards/MiniCard';
import WideCard from '../cards/WideCard';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import { SOCIAL_ICONS, SOCIAL_LABELS } from '../socialIcons';

// Home overview: topbar, search, hero banner, category nav, and curated sections.
export default function HomeScreen() {
  const {
    screen, screenBack, topbarRef, headerContact,
    searchQ, setSearchQ, searchMatches,
    categories, ordered, pInfo,
    catnavHomeRef, homeSectionsRef,
    footerLinks, openCategory, openDetail, quickAdd,
  } = useMenu();

  return (
    <section className={`screen ${screen === 'home' ? 'active' : ''} ${screen === 'home' && screenBack ? 'back' : ''}`}>
      <div className="topbar home-topbar" ref={topbarRef}>
        <Crest />
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
          <div className="menu-rail">
            <div className="rail-head">
              <h2>The <em>menu</em></h2>
              <span className="meta">{categories.length} categories</span>
            </div>
            <div className="rail" ref={catnavHomeRef}>
              {ordered.filter((c) => c.items.length).map((c) => (
                <button className="cat-tile" key={c.slug} onClick={() => openCategory(c.slug)}>
                  {c.slug === pInfo.meal && <span className="now-dot">Now</span>}
                  <ImgWithFallback src={c.coverUrl} alt="" />
                  <div className="info">
                    <div>
                      <div className="nm">{c.name}</div>
                      <span className="ct">{c.items.length} dishes</span>
                    </div>
                    <span className="arr">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div id="homeSections" ref={homeSectionsRef}>
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
          </div>

          <footer className="foot-info">
            <div className="crest-lg">— Maqaaxi Pos —</div>
            <p className="foot-tag">Taste the difference</p>
            <p className="foot-loc">Your restaurant · powered by Maqaaxi Pos</p>
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
  );
}
