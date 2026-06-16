const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

// Unsplash image URLs mapped by item name keywords
const IMAGE_MAP = {
  // Chicken
  '1 pc leg': 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=400&q=80',
  'snack box': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',
  'dinner 3pc': 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=400&q=80',
  'dinner 4pc': 'https://images.unsplash.com/photo-1585325701956-60dd9c8553bc?w=400&q=80',
  '9 pc meal': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',
  '12 pc meal': 'https://images.unsplash.com/photo-1585325701956-60dd9c8553bc?w=400&q=80',
  '15 pc meal': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',
  '18 pc meal': 'https://images.unsplash.com/photo-1585325701956-60dd9c8553bc?w=400&q=80',
  'box meal combo': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',

  // Strips
  'chicken strips': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',
  'strip fish': 'https://images.unsplash.com/photo-1580217593608-61931ceaa480?w=400&q=80',

  // Pizza
  'pizza chicken': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
  'pizza fish': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&q=80',
  'pizza meat': 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400&q=80',
  'pizza margherita': 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=400&q=80',
  'pizza orkha': 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=400&q=80',

  // Burgers
  'chicken burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  'fish burger': 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=400&q=80',
  'meat burger': 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&q=80',

  // Wraps
  'chicken wrap': 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&q=80',
  'fish wrap': 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&q=80',
  'meat wrap': 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&q=80',

  // Box Master
  'chicken box master': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',
  'fish box master': 'https://images.unsplash.com/photo-1580217593608-61931ceaa480?w=400&q=80',
  'meat box master': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',

  // Nuggets & Extras
  'nuggets (9 pcs)': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',
  'chicken popcorn + fries': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',
  'chips only': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80',
  'mayonnaise': 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&q=80',
  'mushroom sauce': 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&q=80',
  'marinara sauce': 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&q=80',
  'coleslaw': 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&q=80',
};

async function main() {
  console.log('Adding images to menu items...\n');

  const items = await prisma.menuItem.findMany();

  for (const item of items) {
    const key = item.name.toLowerCase();
    const imageUrl = IMAGE_MAP[key];

    if (imageUrl && !item.imageUrl) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { imageUrl },
      });
      console.log(`  Updated: ${item.name}`);
    } else if (!imageUrl) {
      console.log(`  No image for: ${item.name}`);
    } else {
      console.log(`  Already has image: ${item.name}`);
    }
  }

  // Add Coleslaw if it doesn't exist
  const nuggetsCat = await prisma.category.findFirst({ where: { slug: 'nuggets-extras' } });
  if (nuggetsCat) {
    const existing = await prisma.menuItem.findFirst({
      where: { categoryId: nuggetsCat.id, name: 'Coleslaw' },
    });
    if (!existing) {
      await prisma.menuItem.create({
        data: {
          categoryId: nuggetsCat.id,
          name: 'Coleslaw',
          price: 1.5,
          sortOrder: 7,
          isActive: true,
          imageUrl: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&q=80',
        },
      });
      console.log('\n  + Added Coleslaw to Nuggets & Extras');
    }
  }

  console.log('\nDone!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
