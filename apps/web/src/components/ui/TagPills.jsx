// Row of tag pills (e.g. "Vegan", "Spicy") with variant styling.
export default function TagPills({ tags }) {
  if (!tags || !tags.length) return null;
  return (
    <div className="tags" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {tags.map((t, i) => (
        <span key={i} className={`tag ${t.variant && t.variant !== 'default' ? t.variant : ''}`}>{t.label}</span>
      ))}
    </div>
  );
}
