/* eslint-disable */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const PEX = (id, w = 900) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

const CATEGORIES = [
  { slug: 'breakfast', name: 'Breakfast', kicker: 'Until 11 AM',
    headline: 'Morning, <em>slowly.</em>', sub: 'Eggs, pancakes & fresh fruit',
    coverUrl: PEX(1640772, 1400), period: 'morning' },
  { slug: 'lunch', name: 'Lunch', kicker: 'Midday plates',
    headline: 'A bright <em>noon</em> table.', sub: 'Bowls, sandwiches & lighter plates',
    coverUrl: PEX(1640775, 1400), period: 'midday' },
  { slug: 'starters', name: 'Starters', kicker: 'To begin',
    headline: 'First <em>impressions.</em>', sub: 'Small plates, salads & soups',
    coverUrl: PEX(1146760, 1400), period: 'any' },
  { slug: 'mains', name: 'Mains', kicker: 'From the grill',
    headline: 'The <em>heart</em> of the meal.', sub: 'Grills, sea & garden',
    coverUrl: PEX(2725744, 1400), period: 'evening' },
  { slug: 'pasta', name: 'Pasta & Pizza', kicker: 'Hand-made',
    headline: 'Flour, <em>fire,</em> patience.', sub: 'Fresh dough & house pasta',
    coverUrl: PEX(2147491, 1400), period: 'any' },
  { slug: 'desserts', name: 'Desserts', kicker: 'House-made',
    headline: 'A sweet <em>pause.</em>', sub: 'Pastry, ice cream & finishers',
    coverUrl: PEX(45202, 1400), period: 'any' },
  { slug: 'drinks', name: 'Drinks', kicker: 'Juices & coffee',
    headline: 'Pour <em>something</em>.', sub: 'Juices, coffee & mocktails',
    coverUrl: PEX(1352270, 1400), period: 'any' },
];

const TAGS = [
  { slug: 'signature',     label: 'Signature',       variant: 'default' },
  { slug: 'vegetarian',    label: 'Vegetarian',      variant: 'green' },
  { slug: 'vegan',         label: 'Vegan',           variant: 'green' },
  { slug: 'pescatarian',   label: 'Pescatarian',     variant: 'green' },
  { slug: 'spicy',         label: 'Spicy',           variant: 'spicy' },
  { slug: 'raw',           label: 'Raw',             variant: 'spicy' },
  { slug: 'no-sugar',      label: 'No sugar added',  variant: 'green' },
  { slug: 'sweet',         label: 'Sweet',           variant: 'default' },
  { slug: 'sharing',       label: 'Sharing',         variant: 'default' },
  { slug: 'house',         label: 'House',           variant: 'default' },
  { slug: 'classic',       label: 'Classic',         variant: 'default' },
  { slug: 'healthy',       label: 'Healthy',         variant: 'green' },
  { slug: 'seasonal',      label: 'Seasonal',        variant: 'default' },
  { slug: 'chef-pick',     label: 'Chef pick',       variant: 'default' },
  { slug: 'warm',          label: 'Warm',            variant: 'default' },
  { slug: 'slow-cooked',   label: 'Slow-cooked',     variant: 'default' },
  { slug: 'wood-fired',    label: 'Wood-fired',      variant: 'default' },
  { slug: 'house-made',    label: 'House-made',      variant: 'green' },
  { slug: 'citrus',        label: 'Citrus',          variant: 'default' },
  { slug: 'quick',         label: 'Quick',           variant: 'default' },
  { slug: 'caffeine',      label: 'Caffeine',        variant: 'default' },
];

const ITEMS = [
  // BREAKFAST
  { slug: 'breakfast', name: 'Eggs Benedict', price: 9, imageUrl: PEX(1640772),
    description: 'Two poached eggs on a toasted muffin with ham, hollandaise sauce and chives.',
    tags: ['classic'], prepTime: '12 min', kcal: '520', pairing: 'Fresh orange juice',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Toasted muffin', a: 0 }, { n: 'Sourdough', a: 0 }, { n: 'Gluten-free', a: 2 }] }],
    extras: [{ n: 'Avocado', a: 3 }, { n: 'Extra egg', a: 1 }, { n: 'Hash brown', a: 2 }] },
  { slug: 'breakfast', name: 'Bircher Muesli Bowl', price: 6, imageUrl: PEX(1099680),
    description: 'Overnight oats with toasted almonds, seasonal berries, apple compote and honey.',
    tags: ['vegetarian', 'no-sugar'], prepTime: '5 min', kcal: '380', pairing: 'Cold brew',
    optionGroups: [{ title: 'Milk', options: [{ n: 'Whole milk', a: 0 }, { n: 'Oat', a: 0 }, { n: 'Almond', a: 1 }] }],
    extras: [{ n: 'Granola crunch', a: 2 }, { n: 'Banana', a: 1 }] },
  { slug: 'breakfast', name: 'Buttermilk Pancakes', price: 7, imageUrl: PEX(376464),
    description: 'Three fluffy pancakes stacked with whipped cream, blueberries and warm maple syrup.',
    tags: ['sweet'], prepTime: '10 min', kcal: '610', pairing: 'Cappuccino',
    optionGroups: [{ title: 'Stack', options: [{ n: 'Three stack', a: 0 }, { n: 'Five stack', a: 3 }] }],
    extras: [{ n: 'Crispy bacon', a: 3 }, { n: 'Strawberry compote', a: 2 }] },
  { slug: 'breakfast', name: 'Avocado Toast', price: 7, imageUrl: PEX(1633525),
    description: 'Sourdough toast, smashed avocado, chilli flakes, lemon zest and a soft-poached egg.',
    tags: ['vegetarian'], prepTime: '7 min', kcal: '440', pairing: 'Latte',
    optionGroups: [{ title: 'Egg', options: [{ n: 'Poached', a: 0 }, { n: 'Fried', a: 0 }, { n: 'None', a: 0 }] }],
    extras: [{ n: 'Feta crumble', a: 2 }, { n: 'Cherry tomatoes', a: 1 }] },
  { slug: 'breakfast', name: 'Full Breakfast Platter', price: 10, imageUrl: PEX(376464, 900),
    description: 'Eggs, beef sausage, grilled tomato, baked beans, mushrooms and toast. A proper start.',
    tags: ['sharing'], prepTime: '12 min', kcal: '820', pairing: 'Tea',
    optionGroups: [{ title: 'For', options: [{ n: 'One', a: 0 }, { n: 'Two (sharing)', a: 9 }] }],
    extras: [{ n: 'Extra sausage', a: 2 }, { n: 'Hash brown', a: 2 }] },
  { slug: 'breakfast', name: 'Shakshuka', price: 8, imageUrl: PEX(566566),
    description: 'Eggs baked in a spiced tomato and pepper sauce, feta crumble and charred flatbread.',
    tags: ['vegetarian', 'spicy'], prepTime: '14 min', kcal: '480', pairing: 'Mint tea',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Hot', a: 0 }] }],
    extras: [{ n: 'Extra flatbread', a: 2 }, { n: 'Beef sausage', a: 4 }] },
  { slug: 'breakfast', name: 'Fruit & Granola Bowl', price: 6, imageUrl: PEX(1099680, 900),
    description: 'Creamy yogurt topped with house granola, fresh fruit and a drizzle of honey.',
    tags: ['vegetarian', 'healthy'], prepTime: '4 min', kcal: '360', pairing: 'Green juice',
    optionGroups: [{ title: 'Size', options: [{ n: 'Regular', a: 0 }, { n: 'Large', a: 2 }] }],
    extras: [{ n: 'Peanut butter', a: 1 }, { n: 'Extra fruit', a: 1 }] },

  // LUNCH
  { slug: 'lunch', name: 'Caesar Salad', price: 8, imageUrl: PEX(1059905),
    description: 'Baby gem and romaine, parmesan shavings, crisp croutons and creamy caesar dressing.',
    tags: ['house'], prepTime: '8 min', kcal: '420', pairing: 'Lemonade',
    optionGroups: [{ title: 'Protein', options: [{ n: 'Plain', a: 0 }, { n: 'Grilled chicken', a: 4 }, { n: 'Prawns', a: 6 }] }],
    extras: [{ n: 'Extra parmesan', a: 2 }, { n: 'Soft-boiled egg', a: 1 }] },
  { slug: 'lunch', name: 'Seared Tuna Salad', price: 12, imageUrl: PEX(70497),
    description: 'Seared tuna over green beans, baby potatoes, olives, egg and tomatoes with a vinaigrette.',
    tags: ['pescatarian'], prepTime: '12 min', kcal: '520', pairing: 'Sparkling water',
    optionGroups: [{ title: 'Tuna', options: [{ n: 'Rare', a: 0 }, { n: 'Medium', a: 0 }] }],
    extras: [{ n: 'Extra egg', a: 1 }, { n: 'Olives', a: 2 }] },
  { slug: 'lunch', name: 'Club Sandwich', price: 9, imageUrl: PEX(1556909),
    description: 'Triple-decker toasted sandwich: roast chicken, bacon, tomato, lettuce and aioli, with fries.',
    tags: ['classic'], prepTime: '14 min', kcal: '780', pairing: 'Iced tea',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Toasted', a: 0 }, { n: 'Sourdough', a: 0 }, { n: 'Gluten-free', a: 2 }] }],
    extras: [{ n: 'Avocado', a: 3 }, { n: 'Fried egg', a: 2 }] },
  { slug: 'lunch', name: 'Garden Grain Bowl', price: 9, imageUrl: PEX(1640774),
    description: 'Quinoa and farro with roast pumpkin, beetroot, kale, feta and tahini-lemon dressing.',
    tags: ['vegetarian', 'healthy'], prepTime: '9 min', kcal: '460', pairing: 'Fresh lime soda',
    optionGroups: [{ title: 'Dressing', options: [{ n: 'Tahini-lemon', a: 0 }, { n: 'Green goddess', a: 0 }] }],
    extras: [{ n: 'Grilled halloumi', a: 4 }, { n: 'Grilled chicken', a: 4 }] },
  { slug: 'lunch', name: 'Beef Burger', price: 11, imageUrl: PEX(1639557),
    description: 'Grilled beef patty, aged cheddar, caramelised onion, pickles and house sauce, with fries.',
    tags: ['signature'], prepTime: '16 min', kcal: '820', pairing: 'Cola',
    optionGroups: [{ title: 'Cook', options: [{ n: 'Medium', a: 0 }, { n: 'Well done', a: 0 }] }],
    extras: [{ n: 'Smoked beef', a: 3 }, { n: 'Extra cheese', a: 1 }, { n: 'Fried egg', a: 2 }] },
  { slug: 'lunch', name: 'Roast Vegetable Tartine', price: 8, imageUrl: PEX(257816),
    description: 'Open-faced sourdough with whipped ricotta, roasted vegetables, basil oil and pine nuts.',
    tags: ['vegetarian'], prepTime: '10 min', kcal: '430', pairing: 'Iced tea',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Sourdough', a: 0 }, { n: 'Rye', a: 0 }] }],
    extras: [{ n: 'Extra ricotta', a: 2 }] },
  { slug: 'lunch', name: 'Salmon Poke Bowl', price: 12, imageUrl: PEX(1640774, 900),
    description: 'Rice with sesame salmon, edamame, avocado, pickled ginger, cucumber, nori and yuzu soy.',
    tags: ['pescatarian'], prepTime: '8 min', kcal: '520', pairing: 'Ginger ale',
    optionGroups: [{ title: 'Base', options: [{ n: 'White rice', a: 0 }, { n: 'Brown rice', a: 0 }, { n: 'Greens only', a: 0 }] }],
    extras: [{ n: 'Extra salmon', a: 5 }, { n: 'Furikake', a: 1 }] },

  // STARTERS
  { slug: 'starters', name: 'Burrata & Tomato', price: 9, imageUrl: PEX(1640775),
    description: 'Creamy burrata over heirloom tomatoes, basil oil and toasted pine nuts.',
    tags: ['vegetarian', 'seasonal'], prepTime: '8 min', kcal: '410', pairing: 'Sparkling water',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Focaccia', a: 0 }, { n: 'Sourdough', a: 0 }, { n: 'None', a: 0 }] }],
    extras: [{ n: 'Aged balsamic', a: 2 }, { n: 'Extra burrata', a: 4 }] },
  { slug: 'starters', name: 'Tuna Tartare', price: 12, imageUrl: PEX(1146760),
    description: 'Hand-cut tuna with avocado, sesame, soy and crisp wonton chips.',
    tags: ['raw', 'chef-pick'], prepTime: '9 min', kcal: '320', pairing: 'Iced green tea',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Hot', a: 0 }] }],
    extras: [{ n: 'Extra wontons', a: 2 }, { n: 'Avocado', a: 2 }] },
  { slug: 'starters', name: 'Wild Mushroom Soup', price: 7, imageUrl: PEX(539451),
    description: 'Silky soup of mushrooms with cream, chives and a crunchy crouton.',
    tags: ['vegetarian', 'warm'], prepTime: '7 min', kcal: '290', pairing: 'Warm bread',
    optionGroups: [{ title: 'Size', options: [{ n: 'Cup', a: 0 }, { n: 'Bowl', a: 2 }] }],
    extras: [{ n: 'Extra bread', a: 1 }] },
  { slug: 'starters', name: 'Beef Carpaccio', price: 12, imageUrl: PEX(675951),
    description: 'Thinly sliced beef with capers, parmesan, rocket and lemon.',
    tags: ['raw'], prepTime: '7 min', kcal: '310', pairing: 'Sparkling water',
    optionGroups: [{ title: 'Garnish', options: [{ n: 'Classic', a: 0 }, { n: 'No capers', a: 0 }] }],
    extras: [{ n: 'Soft-boiled egg', a: 1 }] },
  { slug: 'starters', name: 'Garlic Prawns', price: 11, imageUrl: PEX(2624859),
    description: 'Prawns sizzled in garlic, chilli and parsley butter, served with grilled bread.',
    tags: ['pescatarian', 'spicy'], prepTime: '10 min', kcal: '380', pairing: 'Lemon soda',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Hot', a: 0 }] }],
    extras: [{ n: 'Extra bread', a: 2 }] },
  { slug: 'starters', name: 'Crispy Goat Cheese', price: 8, imageUrl: PEX(1633578),
    description: 'Panko-crusted goat cheese, beetroot, candied walnuts, greens and honey-mustard.',
    tags: ['vegetarian'], prepTime: '9 min', kcal: '370', pairing: 'Apple juice',
    optionGroups: [{ title: 'Side', options: [{ n: 'Salad', a: 0 }, { n: 'Toasted bread', a: 0 }] }],
    extras: [{ n: 'Extra walnuts', a: 1 }] },

  // MAINS
  { slug: 'mains', name: 'Grilled Ribeye Steak', price: 22, imageUrl: PEX(2725744),
    description: 'Ribeye grilled over oak with garlic butter, mashed potato and a pepper sauce.',
    tags: ['signature'], prepTime: '22 min', kcal: '780', pairing: 'Sparkling water',
    optionGroups: [{ title: 'Cooked to', options: [{ n: 'Rare', a: 0 }, { n: 'Medium-rare', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Well done', a: 0 }] }],
    extras: [{ n: 'Grilled mushrooms', a: 3 }, { n: 'Grilled asparagus', a: 4 }, { n: 'Extra sauce', a: 2 }] },
  { slug: 'mains', name: 'Pan-seared Sea Bass', price: 18, imageUrl: PEX(725992),
    description: 'Crispy-skin sea bass on saffron risotto with grilled fennel, lemon oil and salsa verde.',
    tags: ['pescatarian'], prepTime: '18 min', kcal: '520', pairing: 'Still water',
    optionGroups: [{ title: 'Side', options: [{ n: 'Saffron risotto', a: 0 }, { n: 'Crushed potatoes', a: 0 }, { n: 'Seasonal greens', a: 0 }] }],
    extras: [{ n: 'Extra prawns', a: 5 }] },
  { slug: 'mains', name: 'Charred Cauliflower', price: 12, imageUrl: PEX(1437318),
    description: 'Whole roasted cauliflower with tahini, pomegranate, harissa oil, dukkah and couscous.',
    tags: ['vegan', 'spicy'], prepTime: '25 min', kcal: '420', pairing: 'Pomegranate juice',
    optionGroups: [{ title: 'Portion', options: [{ n: 'Half', a: 0 }, { n: 'Whole', a: 5 }] }],
    extras: [{ n: 'Hummus side', a: 3 }] },
  { slug: 'mains', name: 'Slow-cooked Lamb Shoulder', price: 20, imageUrl: PEX(675951, 900),
    description: 'Braised lamb shoulder with a sticky pomegranate glaze, smoked aubergine and herb couscous.',
    tags: ['slow-cooked'], prepTime: '25 min', kcal: '720', pairing: 'Mint lemonade',
    optionGroups: [{ title: 'Side', options: [{ n: 'Couscous', a: 0 }, { n: 'Roast potatoes', a: 0 }] }],
    extras: [{ n: 'Mint yogurt', a: 2 }, { n: 'Flatbread', a: 2 }] },
  { slug: 'mains', name: 'Roast Chicken Supreme', price: 15, imageUrl: PEX(2338407),
    description: 'Crisp-skin chicken breast, creamed leeks, wild mushrooms and mashed potato.',
    tags: ['classic'], prepTime: '20 min', kcal: '620', pairing: 'Fresh orange juice',
    optionGroups: [{ title: 'Side', options: [{ n: 'Mashed potato', a: 0 }, { n: 'Buttered greens', a: 0 }] }],
    extras: [{ n: 'Extra gravy', a: 1 }] },
  { slug: 'mains', name: 'BBQ Beef Ribs', price: 19, imageUrl: PEX(2641886),
    description: 'Slow-cooked beef ribs in a sticky house BBQ glaze, served with slaw and fries.',
    tags: ['chef-pick'], prepTime: '22 min', kcal: '680', pairing: 'Cola',
    optionGroups: [{ title: 'Portion', options: [{ n: 'Half rack', a: 0 }, { n: 'Full rack', a: 8 }] }],
    extras: [{ n: 'Extra slaw', a: 2 }] },

  // PASTA & PIZZA
  { slug: 'pasta', name: 'Tagliatelle Bolognese', price: 12, imageUrl: PEX(1437267),
    description: 'House-made egg tagliatelle in a rich slow-cooked beef and tomato ragù, finished with parmesan.',
    tags: ['signature'], prepTime: '14 min', kcal: '610', pairing: 'Sparkling water',
    optionGroups: [{ title: 'Pasta', options: [{ n: 'Tagliatelle', a: 0 }, { n: 'Spaghetti', a: 0 }] }],
    extras: [{ n: 'Extra parmesan', a: 2 }] },
  { slug: 'pasta', name: 'Pizza Margherita', price: 10, imageUrl: PEX(2147491),
    description: '72-hour dough, San Marzano tomato, mozzarella, fresh basil and extra-virgin olive oil.',
    tags: ['vegetarian', 'wood-fired'], prepTime: '11 min', kcal: '780', pairing: 'Lemon soda',
    optionGroups: [{ title: 'Crust', options: [{ n: 'Classic', a: 0 }, { n: 'Thin', a: 0 }, { n: 'Sourdough', a: 2 }] }],
    extras: [{ n: 'Buffalo mozzarella', a: 4 }, { n: 'Spicy beef', a: 3 }, { n: 'Mushrooms', a: 2 }] },
  { slug: 'pasta', name: 'Prawn Linguine', price: 16, imageUrl: PEX(1438672),
    description: 'Fresh linguine with prawns in a garlic, chilli and tomato sauce, finished with parsley.',
    tags: ['pescatarian', 'signature'], prepTime: '18 min', kcal: '680', pairing: 'Still water',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Spicy', a: 0 }] }],
    extras: [{ n: 'Extra prawns', a: 6 }] },
  { slug: 'pasta', name: 'Cacio e Pepe', price: 11, imageUrl: PEX(1373915),
    description: 'Tonnarelli with pecorino romano, cracked black pepper and starchy pasta water. Simple, perfected.',
    tags: ['vegetarian', 'classic'], prepTime: '12 min', kcal: '540', pairing: 'Sparkling water',
    optionGroups: [{ title: 'Pasta', options: [{ n: 'Tonnarelli', a: 0 }, { n: 'Spaghetti', a: 0 }] }],
    extras: [{ n: 'Extra pecorino', a: 2 }] },
  { slug: 'pasta', name: 'Pizza Funghi', price: 12, imageUrl: PEX(905847),
    description: 'White pizza with mozzarella, fontina, wild mushrooms and garlic oil.',
    tags: ['vegetarian', 'chef-pick'], prepTime: '12 min', kcal: '820', pairing: 'Iced tea',
    optionGroups: [{ title: 'Crust', options: [{ n: 'Classic', a: 0 }, { n: 'Thin', a: 0 }] }],
    extras: [{ n: 'Truffle oil drizzle', a: 2 }] },

  // DESSERTS
  { slug: 'desserts', name: 'Crème Brûlée', price: 6, imageUrl: PEX(2014693),
    description: 'Vanilla custard with a crackling burnt-sugar top, served with shortbread and berries.',
    tags: ['house-made'], prepTime: '4 min', kcal: '460', pairing: 'Espresso',
    optionGroups: [{ title: 'Side', options: [{ n: 'Berries', a: 0 }, { n: 'Vanilla ice cream', a: 2 }] }],
    extras: [] },
  { slug: 'desserts', name: 'Chocolate Fondant', price: 7, imageUrl: PEX(45202),
    description: 'Warm chocolate fondant with a molten centre, salted caramel sauce and vanilla ice cream.',
    tags: ['signature'], prepTime: '12 min', kcal: '580', pairing: 'Cappuccino',
    optionGroups: [{ title: 'Ice cream', options: [{ n: 'Vanilla', a: 0 }, { n: 'Pistachio', a: 2 }, { n: 'Hazelnut', a: 2 }] }],
    extras: [{ n: 'Extra scoop', a: 2 }] },
  { slug: 'desserts', name: 'Tiramisù', price: 6, imageUrl: PEX(8951406),
    description: 'Layered sponge soaked in espresso, mascarpone cream and a dusting of dark cocoa.',
    tags: ['classic'], prepTime: '3 min', kcal: '420', pairing: 'Coffee',
    optionGroups: [{ title: 'Style', options: [{ n: 'Classic', a: 0 }, { n: 'Pistachio', a: 2 }] }],
    extras: [{ n: 'Espresso shot', a: 2 }] },
  { slug: 'desserts', name: 'Lemon Meringue Tart', price: 6, imageUrl: PEX(1126359),
    description: 'Crisp pastry, tangy lemon curd, torched meringue and candied lemon zest.',
    tags: ['citrus'], prepTime: '4 min', kcal: '380', pairing: 'Mint tea',
    optionGroups: [{ title: 'Tart', options: [{ n: 'Classic', a: 0 }, { n: 'Yuzu', a: 1 }] }],
    extras: [{ n: 'Berry compote', a: 2 }] },
  { slug: 'desserts', name: 'Affogato', price: 5, imageUrl: PEX(2059149),
    description: 'A scoop of vanilla ice cream drowned tableside in a fresh shot of espresso.',
    tags: ['quick'], prepTime: '2 min', kcal: '220', pairing: 'Espresso',
    optionGroups: [{ title: 'Shot', options: [{ n: 'Single shot', a: 0 }, { n: 'Double shot', a: 1 }] }],
    extras: [] },

  // DRINKS
  { slug: 'drinks', name: 'Mango Passion Cooler', price: 6, imageUrl: PEX(1352270),
    description: 'Fresh mango and passion fruit with lime over crushed ice and a splash of soda. Bright and long.',
    tags: ['signature'], prepTime: '3 min', kcal: '180', pairing: '',
    optionGroups: [{ title: 'Size', options: [{ n: 'Regular', a: 0 }, { n: 'Large', a: 2 }] }],
    extras: [] },
  { slug: 'drinks', name: 'Single-Origin Espresso', price: 4, imageUrl: PEX(312418),
    description: 'A double shot of our Ethiopia Yirgacheffe — bright, floral, with notes of bergamot and stone fruit.',
    tags: ['caffeine'], prepTime: '2 min', kcal: '5', pairing: '',
    optionGroups: [{ title: 'Style', options: [{ n: 'Espresso', a: 0 }, { n: 'Cortado', a: 1 }, { n: 'Flat white', a: 2 }] }],
    extras: [{ n: 'Oat milk', a: 1 }] },
  { slug: 'drinks', name: 'Cold-pressed Greens', price: 6, imageUrl: PEX(616833),
    description: 'Cucumber, green apple, kale, ginger, mint and lemon. Pressed to order, served over crushed ice.',
    tags: ['vegan', 'no-sugar'], prepTime: '4 min', kcal: '110', pairing: '',
    optionGroups: [{ title: 'Ginger', options: [{ n: 'Mild', a: 0 }, { n: 'Standard', a: 0 }, { n: 'Fiery', a: 0 }] }],
    extras: [] },
  { slug: 'drinks', name: 'Fresh Lemon Mint', price: 5, imageUrl: PEX(602750),
    description: 'Freshly squeezed lemon blended with mint and a touch of honey, served over ice.',
    tags: ['signature'], prepTime: '3 min', kcal: '90', pairing: '',
    optionGroups: [{ title: 'Sweetness', options: [{ n: 'Standard', a: 0 }, { n: 'Light', a: 0 }] }],
    extras: [] },
  { slug: 'drinks', name: 'Mango Lassi', price: 5, imageUrl: PEX(1407846),
    description: 'Creamy blended yogurt with sweet mango and a hint of cardamom. Cool and refreshing.',
    tags: ['sweet'], prepTime: '3 min', kcal: '210', pairing: '',
    optionGroups: [{ title: 'Size', options: [{ n: 'Regular', a: 0 }, { n: 'Large', a: 2 }] }],
    extras: [] },
  { slug: 'drinks', name: 'Spiced Tea', price: 4, imageUrl: PEX(230477),
    description: 'Black tea gently spiced with cardamom, cinnamon and cloves. Served in a porcelain pot.',
    tags: ['caffeine'], prepTime: '3 min', kcal: '2', pairing: '',
    optionGroups: [{ title: 'Milk', options: [{ n: 'None', a: 0 }, { n: 'Whole milk', a: 0 }, { n: 'Oat', a: 1 }] }],
    extras: [{ n: 'Honey', a: 1 }, { n: 'Lemon', a: 0 }] },
];

const BANNERS = [
  { service: 'morning', tagLabel: 'This morning',
    headline: 'A quiet morning,<br/>well <em>fed.</em>',
    body: "Pastries, eggs and slow coffee from 7 AM. Order ahead and we'll have it warm at your table.",
    imageUrl: PEX(1640772, 1400), ctaText: 'Explore breakfast', ctaCategorySlug: 'breakfast',
    meta1Label: 'served', meta1Value: '07–11',
    meta2Label: 'dishes', meta2Value: '7',
    meta3Label: 'service', meta3Value: 'Slow' },
  { service: 'midday', tagLabel: 'Midday plates',
    headline: 'Light, sharp,<br/><em>back</em> to the day.',
    body: 'A short, well-edited lunch list. Bowls, plates and a sandwich the chef would actually eat.',
    imageUrl: PEX(1640775, 1400), ctaText: 'Explore lunch', ctaCategorySlug: 'lunch',
    meta1Label: 'served', meta1Value: '12–15',
    meta2Label: 'courses max', meta2Value: '3',
    meta3Label: 'turnaround', meta3Value: '30m' },
  { service: 'evening', tagLabel: 'This evening',
    headline: 'Something worth<br/><em>staying</em> for.',
    body: 'Grills, mains and house favourites, cooked to order and served at your table until 11 PM.',
    imageUrl: PEX(1640772, 1400), ctaText: 'Explore mains', ctaCategorySlug: 'mains',
    meta1Label: 'served', meta1Value: '18–23',
    meta2Label: 'mains', meta2Value: '6',
    meta3Label: 'last order', meta3Value: '11 PM' },
];

async function main() {
  // 1) Admin user (preserve existing logic)
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.adminUser.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash, role: 'admin' },
    });
    console.log(`Admin user seeded: ${user.email}`);
  } else {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user seed.');
  }

  // 2) Wipe menu data
  await prisma.itemTag.deleteMany();
  await prisma.itemOption.deleteMany();
  await prisma.optionGroup.deleteMany();
  await prisma.itemExtra.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.banner.deleteMany();

  // 3) Tags
  const tagBySlug = {};
  for (const t of TAGS) {
    const row = await prisma.tag.create({ data: t });
    tagBySlug[row.slug] = row.id;
  }
  console.log(`Seeded ${TAGS.length} tags`);

  // 4) Categories
  const catBySlug = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    const row = await prisma.category.create({ data: { ...c, sortOrder: i } });
    catBySlug[c.slug] = row.id;
  }
  console.log(`Seeded ${CATEGORIES.length} categories`);

  // 5) Items + option groups + extras + tags
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const categoryId = catBySlug[it.slug];
    if (!categoryId) continue;

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name: it.name,
        description: it.description,
        price: it.price,
        imageUrl: it.imageUrl,
        kcal: it.kcal,
        prepTime: it.prepTime,
        pairing: it.pairing || null,
        sortOrder: i,
      },
    });

    // Option groups
    for (let gi = 0; gi < (it.optionGroups || []).length; gi++) {
      const g = it.optionGroups[gi];
      const group = await prisma.optionGroup.create({
        data: { menuItemId: item.id, title: g.title, sortOrder: gi },
      });
      for (let oi = 0; oi < g.options.length; oi++) {
        const o = g.options[oi];
        await prisma.itemOption.create({
          data: { optionGroupId: group.id, name: o.n, priceAdd: o.a, sortOrder: oi },
        });
      }
    }

    // Extras
    for (let ei = 0; ei < (it.extras || []).length; ei++) {
      const x = it.extras[ei];
      await prisma.itemExtra.create({
        data: { menuItemId: item.id, name: x.n, priceAdd: x.a, sortOrder: ei },
      });
    }

    // Tags
    for (const tagSlug of (it.tags || [])) {
      const tagId = tagBySlug[tagSlug];
      if (tagId) await prisma.itemTag.create({ data: { menuItemId: item.id, tagId } });
    }
  }
  console.log(`Seeded ${ITEMS.length} menu items`);

  // 6) Banners
  for (const b of BANNERS) {
    await prisma.banner.create({ data: b });
  }
  console.log(`Seeded ${BANNERS.length} banners`);

  console.log('\n✓ Maqaaxi Pos demo seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
