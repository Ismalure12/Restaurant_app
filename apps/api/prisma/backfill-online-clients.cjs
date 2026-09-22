// One-off: move online (Sifalo) payers out of the back-office Customer list
// into OnlineClient, so Customers only holds account / owing customers.
//
//   node prisma/backfill-online-clients.cjs            # dry run: prints what would change
//   node prisma/backfill-online-clients.cjs --apply    # does it
//
// For every Customer that has online orders not yet linked to a client:
//   • upsert the OnlineClient with the same phone (name/address from the customer)
//   • point those online orders at the client (clientId) and off the customer
//   • delete the Customer only if nothing else uses it (no invoices, no other orders)
// Each customer is one transaction; re-running is safe (already moved = skipped).
// A per-customer loop is fine here: a one-off admin script, not a request path.
if (require('node:fs').existsSync('.env')) process.loadEnvFile('.env');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
const apply = process.argv.includes('--apply');

async function main() {
  const host = (() => { try { return new URL(process.env.DATABASE_URL).host; } catch { return '?'; } })();
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} on ${host}`);

  const grouped = await prisma.order.groupBy({
    by: ['customerId'],
    where: { source: 'online', clientId: null, customerId: { not: null } },
    _count: { _all: true },
  });
  if (!grouped.length) { console.log('Nothing to move — every online order already has its client.'); return; }

  const customers = await prisma.customer.findMany({
    where: { id: { in: grouped.map((g) => g.customerId) } },
    include: { _count: { select: { invoices: true, orders: true } } },
  });
  const onlineCount = Object.fromEntries(grouped.map((g) => [g.customerId, g._count._all]));

  let moved = 0; let removed = 0; let kept = 0;
  for (const c of customers) {
    const online = onlineCount[c.id] ?? 0;
    const usedElsewhere = c._count.invoices > 0 || c._count.orders > online;
    console.log(`  ${c.name} (${c.phone}): ${online} online order(s) → client${usedElsewhere ? '; customer KEPT (has invoices or counter orders)' : '; customer removed'}`);
    if (!apply) { moved += online; usedElsewhere ? kept++ : removed++; continue; }

    await prisma.$transaction(async (tx) => {
      const client = await tx.onlineClient.upsert({
        where: { phone: c.phone },
        update: {},
        create: { phone: c.phone, name: c.name, address: c.address || null, createdAt: c.createdAt },
      });
      const r = await tx.order.updateMany({
        where: { customerId: c.id, source: 'online', clientId: null },
        data: { clientId: client.id, customerId: null },
      });
      moved += r.count;
      if (!usedElsewhere) {
        // Re-checked inside the transaction: never delete a customer that gained an invoice or order meanwhile.
        const [inv, ord] = await Promise.all([
          tx.invoice.count({ where: { customerId: c.id } }),
          tx.order.count({ where: { customerId: c.id } }),
        ]);
        if (inv === 0 && ord === 0) { await tx.customer.delete({ where: { id: c.id } }); removed++; } else kept++;
      } else kept++;
    });
  }
  console.log(`${apply ? 'Moved' : 'Would move'} ${moved} online order(s); ${apply ? 'removed' : 'would remove'} ${removed} customer(s); kept ${kept}.`);
  if (!apply) console.log('Re-run with --apply to make these changes.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
