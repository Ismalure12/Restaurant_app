/* eslint-disable */
// One-off: set KFG's public contact / social links in the SocialLink table.
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
  { platform: 'whatsapp', value: '252907795752' },
  { platform: 'phone', value: '+252 90 552 2221' },
  { platform: 'tiktok', value: 'https://www.tiktok.com/@kfg_galkacyo' },
  { platform: 'facebook', value: 'https://www.facebook.com/profile.php?id=61574278020670' },
  { platform: 'website', value: 'https://kfggalkacyo.com' },
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
  console.log(`\nDone. ${LINKS.length} KFG contact links set.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
