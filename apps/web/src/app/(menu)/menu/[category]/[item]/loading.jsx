// Dish skeleton — two columns on desktop, stacked on a phone, like the page.
export default function ItemLoading() {
  return (
    <div className="mx-item" aria-busy="true" aria-label="Loading dish">
      <div className="mx-item-grid">
        <div className="mx-skel mx-skel-media" />
        <div className="mx-item-panel">
          <div className="mx-skel mx-skel-title" />
          <div className="mx-skel mx-skel-line" />
          <div className="mx-skel mx-skel-line" />
          <div className="mx-skel mx-skel-block" />
        </div>
      </div>
    </div>
  );
}
