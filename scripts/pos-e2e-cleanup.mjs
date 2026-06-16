import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });

async function main() {
  // POS orders only exist from the e2e test (feature just shipped); remove them.
  const orders = await prisma.order.deleteMany({ where: { source: 'pos' } });
  // Purchase expenses the test booked.
  const expenses = await prisma.expense.deleteMany({ where: { note: 'e2e purchase' } });
  // Shifts created with the test's float/cash values.
  const shifts = await prisma.shift.deleteMany({ where: { openingFloat: 50, closingCash: 120 } });
  // Demo inventory items created by the screenshot run.
  const inv = await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: 'Demo ' } } });
  // Retired waiter login (waiters are non-login records now) + any test waiters.
  const waiterUser = await prisma.adminUser.deleteMany({ where: { email: 'waiter@restaurant.com' } });
  const testWaiters = await prisma.waiter.deleteMany({ where: { OR: [{ name: { startsWith: 'E2E ' } }, { name: { startsWith: 'Demo ' } }] } });
  console.log(`Removed: ${orders.count} pos orders, ${expenses.count} expenses, ${shifts.count} shifts, ${inv.count} demo inventory, ${waiterUser.count} waiter login, ${testWaiters.count} test waiters`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
