import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem } from '@/lib/menuServer';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import TagPills from '@/components/ui/TagPills';
import ItemForm from '@/components/menu/site/ItemForm';
import { FMT } from '@/lib/menu/format';

export async function generateMetadata({ params }) {
  const { category, item: itemId } = await params;
  const found = await getItem(category, itemId);
  if (!found) return { title: 'Not found — Maqaaxi' };
  return {
    title: `${found.item.name} — Maqaaxi`,
    description: found.item.description || undefined,
  };
}

export default async function ItemPage({ params }) {
  const { category: slug, item: itemId } = await params;
  const found = await getItem(slug, itemId);
  if (!found) notFound();
  const { item, category } = found;

  return (
    <article className="mx-item">
      <nav className="mx-crumbs" aria-label="Breadcrumb">
        <Link href="/">Menu</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/menu/${category.slug}`}>{category.name}</Link>
      </nav>

      <div className="mx-item-grid">
        <div className="mx-item-media">
          <ImgWithFallback src={item.imageUrl} alt="" />
        </div>

        <div className="mx-item-panel">
          <header className="mx-item-head">
            <h1 className="mx-h1">{item.name}</h1>
            <span className="mx-price mx-price-lg tnum">{FMT(item.price)}</span>
          </header>

          {item.description && <p className="mx-item-desc">{item.description}</p>}

          <div className="mx-item-facts">
            {item.tags?.length > 0 && <TagPills tags={item.tags} />}
            {item.prepTime && <span className="mx-fact">{item.prepTime}</span>}
            {item.kcal && <span className="mx-fact">{item.kcal}</span>}
          </div>

          {item.pairing && <p className="mx-pairing">Goes well with {item.pairing}.</p>}

          <ItemForm item={item} />
        </div>
      </div>
    </article>
  );
}
