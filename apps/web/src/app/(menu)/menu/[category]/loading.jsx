// Category skeleton — same grid as the real page so nothing shifts.
export default function CategoryLoading() {
  return (
    <div className="mx-section" aria-busy="true" aria-label="Loading dishes">
      <div className="mx-skel-head">
        <div className="mx-skel mx-skel-title" />
      </div>
      <div className="mx-dish-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mx-skel mx-skel-card" />
        ))}
      </div>
    </div>
  );
}
