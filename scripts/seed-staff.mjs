import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });

// Each staff account is sourced from .env so credentials aren't hard-coded.
// Waiters are not logins — only manager + cashier are seeded here.
const STAFF = [
  { role: 'manager', name: 'Manager', email: process.env.MANAGER_EMAIL, password: process.env.MANAGER_PASSWORD },
  { role: 'cashier', name: 'Cashier', email: process.env.CASHIER_EMAIL, password: process.env.CASHIER_PASSWORD },
];

async function main() {
  for (const s of STAFF) {
    if (!s.email || !s.password) {
      console.warn(`SKIP ${s.role}: missing ${s.role.toUpperCase()}_EMAIL / _PASSWORD in .env`);
      continue;
    }
    const passwordHash = await bcrypt.hash(s.password, 12);
    await prisma.adminUser.upsert({
      where: { email: s.email },
      // Update keeps the account in sync but does NOT reset the password on re-run.
      update: { role: s.role, name: s.name, isActive: true },
      create: { email: s.email, passwordHash, role: s.role, name: s.name, isActive: true },
    });
    console.log(`OK   ${s.role.padEnd(8)} ${s.email}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
