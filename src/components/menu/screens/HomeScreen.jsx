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
    banner, ordered, allItems, pInfo,
    catwrapHomeRef, catnavHomeRef, homeSectionsRef,
    footerLinks, openCategory, openDetail, quickAdd,
  } = useMenu();

  return (
    <section className={`screen ${screen === 'home' ? 'active' : ''} ${screen === 'home' && screenBack ? 'back' : ''}`}>
      <div className="topbar" ref={topbarRef}>
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
  );
}
