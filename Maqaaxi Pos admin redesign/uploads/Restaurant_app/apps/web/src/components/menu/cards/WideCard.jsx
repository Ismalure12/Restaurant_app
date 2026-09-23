import ImgWithFallback from '@/components/ui/ImgWithFallback';
import TagPills from '@/components/ui/TagPills';

// Horizontal card used in search results and the category "more from" grid.
export default function WideCard({ item, onClick, onAdd }) {
  return (
    <article className="item wide" onClick={onClick}>
      <div className="body">
        <div>
          <h3 className="name">{item.name}</h3>
          <p className="desc">{item.description}</p>
          <TagPills tags={item.tags} />
        </div>
        <div className="foot">
          <span className="price"><small>$</small>{Number(item.price).toFixed(0)}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 600 }}>{item.prepTime || ''}</span>
        </div>
      </div>
      <div className="thumb-wrap">
        <ImgWithFallback src={item.imageUrl} alt={item.name} />
        <button className="add-mini" aria-label="Add" onClick={(e) => { e.stopPropagation(); onAdd(item, e.currentTarget); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </button>
      </div>
    </article>
  );
}
