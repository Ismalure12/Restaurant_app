export default function OrderLoading() {
  return (
    <div className="mx-section mx-empty" aria-busy="true" aria-live="polite">
      <span className="state-spinner" aria-hidden="true" />
      <p className="mx-empty-sub">Fetching your order&hellip;</p>
    </div>
  );
}
