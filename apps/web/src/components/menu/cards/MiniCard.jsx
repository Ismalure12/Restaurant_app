import ImgWithFallback from '@/components/ui/ImgWithFallback';

// Compact card used in the home mini-grid and category "selected for you" row.
export default function MiniCard({ item, onClick, onAdd }) {
  return (
    <article className="mini-card" onClick={onClick}>
      <div className="thumb">
        <ImgWithFallback src={item.imageUrl} alt={item.name} />
        <button className="add-mini" aria-label="Add" onClick={(e) => { e.stopPropagation(); onAdd(item, e.currentTarget); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </button>
      </div>
      <div className="body">
        <h3 className="name">{item.name}</h3>
        <div className="meta-row">
          <span className="price"><small>$</small>{Number(item.price).toFixed(0)}</span>
          <span className="quick">{item.prepTime || ''}</span>
        </div>
      </div>
    </article>
  );
}
