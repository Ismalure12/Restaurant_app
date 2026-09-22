// Shown while the menu is fetched on the server. Mirrors the home layout so
// the page doesn't jump when the real content arrives.
export default function MenuLoading() {
  return (
    <div className="mx-section" aria-busy="true" aria-label="Loading the menu">
      <div className="mx-skel mx-skel-hero" />
      <div className="mx-skel-head">
        <div className="mx-skel mx-skel-title" />
      </div>
      <div className="mx-cat-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mx-skel mx-skel-card" />
        ))}
      </div>
    </div>
  );
}
