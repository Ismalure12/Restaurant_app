/* eslint-disable */
// One-off: set the demo restaurant's public contact / social links in the SocialLink table.
// Run once:
//   source <(grep -v '^#' .env | sed 's/^/export /') && node scripts/set-kfg-contact.mjs
//
// Value formats match socialHref() in src/components/menu/socialIcons.jsx:
//  - whatsapp: raw digits  -> https://wa.me/<digits>
//  - phone:    raw number  -> tel:<number>
//  - others:   full URL
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const LINKS = [
  { platform: 'whatsapp', value: '15551234567' },
  { platform: 'phone', value: '+1 555 123 4567' },
  { platform: 'tiktok', value: 'https://www.tiktok.com/@maqaaxipos' },
  { platform: 'facebook', value: 'https://www.facebook.com/maqaaxipos' },
  { platform: 'website', value: 'https://maqaaxipos.com' },
];

async function main() {
  for (const { platform, value } of LINKS) {
    const row = await prisma.socialLink.upsert({
      where: { platform },
      update: { value },
      create: { platform, value },
    });
    console.log(`✓ ${row.platform.padEnd(9)} → ${row.value}`);
  }
  console.log(`\nDone. ${LINKS.length} demo contact links set.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
