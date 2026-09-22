export default function Loading() {
  return (
    <div className="state-page" role="status" aria-live="polite">
      <div className="state-loading">
        <span className="state-spinner" aria-hidden="true" />
        <span className="state-loading-text">Loading the menu&hellip;</span>
      </div>
    </div>
  );
}
