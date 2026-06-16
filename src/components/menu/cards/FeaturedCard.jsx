import ImgWithFallback from '@/components/ui/ImgWithFallback';

// Large hero card used at the top of each home section / category list.
export default function FeaturedCard({ item, onClick, onAdd }) {
  const firstTag = item.tags && item.tags[0];
  return (
    <article className="item featured" onClick={onClick}>
      <div className="thumb">
        {firstTag && <div className="stamp">{firstTag.label}</div>}
        <ImgWithFallback src={item.imageUrl} alt={item.name} />
      </div>
      <div className="body">
        <h3 className="name">{item.name}</h3>
        <p className="desc">{item.description}</p>
        <div className="foot">
          <span className="price"><small>$</small>{Number(item.price).toFixed(0)}</span>
          <button className="add" aria-label="Quick add" onClick={(e) => { e.stopPropagation(); onAdd(item, e.currentTarget); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
          </button>
        </div>
      </div>
    </article>
  );
}
