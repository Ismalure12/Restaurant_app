import { Suspense } from 'react';
import prisma from '@/lib/prisma';
import RoyalShell from '@/components/public/RoyalShell';

export const revalidate = 300;

function decimalToNumber(d) {
  return d == null ? null : Number(d.toString());
}

async function fetchOrderByRef(ref) {
  if (!ref) return null;
  try {
    const order = await prisma.order.findUnique({
      where: { reference: ref },
      include: { customer: { select: { name: true, phone: true } } },
    });
    if (!order) return null;
    return {
      reference: order.reference,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      address: order.address,
      items: order.items,
      total: decimalToNumber(order.total),
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      customer: order.customer,
    };
  } catch {
    return null;
  }
}

export default async function HomePage({ searchParams }) {
  const sp = (await searchParams) || {};
  const ref = typeof sp.ref === 'string' ? sp.ref : null;
  const initialOrderPromise = fetchOrderByRef(ref);
  const [categories, banners, socialLinks] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            optionGroups: {
              orderBy: { sortOrder: 'asc' },
              include: { options: { orderBy: { sortOrder: 'asc' } } },
            },
            extras: { orderBy: { sortOrder: 'asc' } },
            tags: { include: { tag: true } },
          },
        },
      },
    }),
    prisma.banner.findMany({ where: { isActive: true } }),
    prisma.socialLink.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  // Sanitize Prisma Decimal -> number for client component
  const safeCategories = categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    kicker: c.kicker,
    headline: c.headline,
    sub: c.sub,
    coverUrl: c.coverUrl,
    period: c.period,
    items: c.items.map((it) => ({
      id: it.id,
      name: it.name,
      description: it.description,
      price: decimalToNumber(it.price),
      imageUrl: it.imageUrl,
      kcal: it.kcal,
      prepTime: it.prepTime,
      pairing: it.pairing,
      optionGroups: it.optionGroups.map((g) => ({
        id: g.id,
        title: g.title,
        options: g.options.map((o) => ({ id: o.id, name: o.name, priceAdd: decimalToNumber(o.priceAdd) })),
      })),
      extras: it.extras.map((e) => ({ id: e.id, name: e.name, priceAdd: decimalToNumber(e.priceAdd) })),
      tags: it.tags.map((t) => ({ id: t.tag.id, slug: t.tag.slug, label: t.tag.label, variant: t.tag.variant })),
    })),
  }));

  const safeBanners = banners.map((b) => ({
    id: b.id,
    service: b.service,
    tagLabel: b.tagLabel,
    headline: b.headline,
    body: b.body,
    imageUrl: b.imageUrl,
    ctaText: b.ctaText,
    ctaCategorySlug: b.ctaCategorySlug,
    meta1Label: b.meta1Label, meta1Value: b.meta1Value,
    meta2Label: b.meta2Label, meta2Value: b.meta2Value,
    meta3Label: b.meta3Label, meta3Value: b.meta3Value,
  }));

  const safeSocialLinks = socialLinks.map((l) => ({ platform: l.platform, value: l.value }));

  const initialOrder = await initialOrderPromise;

  return (
    <Suspense fallback={null}>
      <RoyalShell
        categories={safeCategories}
        banners={safeBanners}
        socialLinks={safeSocialLinks}
        initialOrder={initialOrder}
        openConfirmed={!!initialOrder}
      />
    </Suspense>
  );
}
