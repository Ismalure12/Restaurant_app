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
    headline: 'Morning, <em>slowly.</em>', sub: 'Eggs, grains & garden fruit',
    coverUrl: PEX(1640772, 1400), period: 'morning' },
  { slug: 'lunch', name: 'Lunch', kicker: 'Midday plates',
    headline: 'A bright <em>noon</em> table.', sub: 'Bowls, sandwiches & lighter mains',
    coverUrl: PEX(1640775, 1400), period: 'midday' },
  { slug: 'starters', name: 'Starters', kicker: 'To begin',
    headline: 'First <em>impressions.</em>', sub: 'Small plates, raw bar & soups',
    coverUrl: PEX(1146760, 1400), period: 'any' },
  { slug: 'mains', name: 'Dinner', kicker: 'From the grill',
    headline: 'The <em>heart</em> of dinner.', sub: 'Hearth, sea & garden',
    coverUrl: PEX(2725744, 1400), period: 'evening' },
  { slug: 'pasta', name: 'Pasta & Pizza', kicker: 'Hand-rolled',
    headline: 'Flour, <em>fire,</em> patience.', sub: '72-hour dough & house pasta',
    coverUrl: PEX(2147491, 1400), period: 'any' },
  { slug: 'desserts', name: 'Desserts', kicker: 'House-made',
    headline: 'A sweet <em>pause.</em>', sub: 'Pastry, gelato & finishers',
    coverUrl: PEX(45202, 1400), period: 'any' },
  { slug: 'drinks', name: 'Drinks', kicker: 'Bar & cellar',
    headline: 'Pour <em>something</em>.', sub: 'Cocktails, coffee & juice',
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
  { slug: 'alcoholic',     label: 'Alcoholic',       variant: 'default' },
  { slug: 'caffeine',      label: 'Caffeine',        variant: 'default' },
];

const ITEMS = [
  // BREAKFAST
  { slug: 'breakfast', name: 'Truffled Eggs Royal', price: 18, imageUrl: PEX(1640772),
    description: 'Two soft poached eggs on toasted brioche with smoked salmon, hollandaise, chives and a shaving of summer truffle.',
    tags: ['signature'], prepTime: '12 min', kcal: '520', pairing: 'Champagne',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Toasted brioche', a: 0 }, { n: 'Sourdough', a: 0 }, { n: 'Gluten-free', a: 2 }] }],
    extras: [{ n: 'Avocado', a: 3 }, { n: 'Extra truffle', a: 6 }, { n: 'Hash brown', a: 4 }] },
  { slug: 'breakfast', name: 'Bircher Garden Bowl', price: 12, imageUrl: PEX(1099680),
    description: 'Overnight oats with toasted almonds, seasonal berries, apple compote and acacia honey.',
    tags: ['vegetarian', 'no-sugar'], prepTime: '5 min', kcal: '380', pairing: 'Cold brew',
    optionGroups: [{ title: 'Milk', options: [{ n: 'Whole milk', a: 0 }, { n: 'Oat', a: 0 }, { n: 'Almond', a: 1 }] }],
    extras: [{ n: 'Granola crunch', a: 2 }, { n: 'Banana', a: 1 }] },
  { slug: 'breakfast', name: 'Buttermilk Pancakes', price: 14, imageUrl: PEX(376464),
    description: 'Three fluffy pancakes stacked with whipped mascarpone, blueberries and warm Quebec maple.',
    tags: ['sweet'], prepTime: '10 min', kcal: '610', pairing: 'Coffee',
    optionGroups: [{ title: 'Stack', options: [{ n: 'Three stack', a: 0 }, { n: 'Five stack', a: 4 }] }],
    extras: [{ n: 'Crispy bacon', a: 3 }, { n: 'Strawberry compote', a: 2 }] },
  { slug: 'breakfast', name: 'Smashed Avocado Toast', price: 13, imageUrl: PEX(1633525),
    description: 'Sourdough toast, smashed avocado, chilli flakes, lemon zest and a soft-poached farm egg on top.',
    tags: ['vegetarian'], prepTime: '7 min', kcal: '440', pairing: 'Latte',
    optionGroups: [{ title: 'Egg', options: [{ n: 'Poached', a: 0 }, { n: 'Fried', a: 0 }, { n: 'None', a: 0 }] }],
    extras: [{ n: 'Feta crumble', a: 2 }, { n: 'Smoked salmon', a: 5 }] },
  { slug: 'breakfast', name: 'Royal Continental', price: 22, imageUrl: PEX(376464, 900),
    description: 'A spread of pastries, fruit, cured meats, cheeses, yogurt and fresh juice. A classic morning ritual.',
    tags: ['sharing'], prepTime: '8 min', kcal: '820', pairing: 'Espresso',
    optionGroups: [{ title: 'For', options: [{ n: 'One', a: 0 }, { n: 'Two (sharing)', a: 14 }] }],
    extras: [{ n: 'Champagne flute', a: 9 }] },
  { slug: 'breakfast', name: 'Shakshuka Verde', price: 15, imageUrl: PEX(566566),
    description: 'Eggs baked in a green tomatillo, spinach and herb sauce, feta crumble, served with charred flatbread.',
    tags: ['vegetarian', 'spicy'], prepTime: '14 min', kcal: '480', pairing: 'Mint tea',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Hot', a: 0 }] }],
    extras: [{ n: 'Extra flatbread', a: 2 }, { n: 'Lamb sausage', a: 5 }] },
  { slug: 'breakfast', name: 'Acai & Granola Bowl', price: 11, imageUrl: PEX(1099680, 900),
    description: 'Frozen acai blended with banana, topped with house granola, fresh berries and cocoa nibs.',
    tags: ['vegan'], prepTime: '4 min', kcal: '360', pairing: 'Green juice',
    optionGroups: [{ title: 'Size', options: [{ n: 'Regular', a: 0 }, { n: 'Large', a: 3 }] }],
    extras: [{ n: 'Peanut butter', a: 1 }, { n: 'Bee pollen', a: 2 }] },

  // LUNCH
  { slug: 'lunch', name: 'Caesar Royal Salad', price: 16, imageUrl: PEX(1059905),
    description: 'Baby gem & romaine, anchovy dressing, parmigiano shavings, crisp sourdough croutons and a soft-poached egg.',
    tags: ['house'], prepTime: '8 min', kcal: '420', pairing: 'Pinot Grigio',
    optionGroups: [{ title: 'Protein', options: [{ n: 'Plain', a: 0 }, { n: 'Grilled chicken', a: 6 }, { n: 'Tiger prawns', a: 9 }] }],
    extras: [{ n: 'Extra parmesan', a: 2 }, { n: 'Anchovy fillets', a: 3 }] },
  { slug: 'lunch', name: 'Niçoise with Seared Tuna', price: 22, imageUrl: PEX(70497),
    description: 'Seared yellowfin tuna over green beans, baby potatoes, olives, egg and tomatoes with a vinaigrette.',
    tags: ['pescatarian'], prepTime: '12 min', kcal: '520', pairing: 'Rosé',
    optionGroups: [{ title: 'Tuna', options: [{ n: 'Rare', a: 0 }, { n: 'Medium', a: 0 }] }],
    extras: [{ n: 'Extra egg', a: 1 }, { n: 'Caper berries', a: 2 }] },
  { slug: 'lunch', name: 'Royal Club Sandwich', price: 19, imageUrl: PEX(1556909),
    description: 'Triple-decker on toasted brioche: roast chicken, bacon, tomato, lettuce, aioli, with hand-cut chips.',
    tags: ['classic'], prepTime: '14 min', kcal: '780', pairing: 'Lager',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Brioche', a: 0 }, { n: 'Sourdough', a: 0 }, { n: 'Gluten-free', a: 2 }] }],
    extras: [{ n: 'Avocado', a: 3 }, { n: 'Fried egg', a: 2 }] },
  { slug: 'lunch', name: 'Grain Bowl Garden', price: 15, imageUrl: PEX(1640774),
    description: 'Quinoa & farro with roast pumpkin, beetroot, kale, pomegranate, feta and tahini-lemon dressing.',
    tags: ['vegetarian', 'healthy'], prepTime: '9 min', kcal: '460', pairing: 'Sparkling water',
    optionGroups: [{ title: 'Dressing', options: [{ n: 'Tahini-lemon', a: 0 }, { n: 'Green goddess', a: 0 }] }],
    extras: [{ n: 'Grilled halloumi', a: 4 }, { n: 'Smoked salmon', a: 5 }] },
  { slug: 'lunch', name: 'Wagyu Burger Royal', price: 26, imageUrl: PEX(1639557),
    description: '150g wagyu patty, aged cheddar, caramelised onion, pickles, truffle mayo and rosemary fries.',
    tags: ['signature'], prepTime: '16 min', kcal: '820', pairing: 'IPA',
    optionGroups: [{ title: 'Cook', options: [{ n: 'Medium-rare', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Well done', a: 0 }] }],
    extras: [{ n: 'Smoked bacon', a: 3 }, { n: 'Truffle fries swap', a: 4 }, { n: 'Fried egg', a: 2 }] },
  { slug: 'lunch', name: 'Roast Vegetable Tartine', price: 14, imageUrl: PEX(257816),
    description: 'Open-faced sourdough with whipped ricotta, roasted heirloom vegetables, basil oil and pine nuts.',
    tags: ['vegetarian'], prepTime: '10 min', kcal: '430', pairing: 'Iced tea',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Sourdough', a: 0 }, { n: 'Rye', a: 0 }] }],
    extras: [{ n: 'Burrata top', a: 5 }] },
  { slug: 'lunch', name: 'Salmon Poke Bowl', price: 18, imageUrl: PEX(1640774, 900),
    description: 'Sushi rice with sesame salmon, edamame, avocado, pickled ginger, cucumber, nori and yuzu soy.',
    tags: ['pescatarian'], prepTime: '8 min', kcal: '520', pairing: 'Sake',
    optionGroups: [{ title: 'Base', options: [{ n: 'Sushi rice', a: 0 }, { n: 'Brown rice', a: 0 }, { n: 'Greens only', a: 0 }] }],
    extras: [{ n: 'Extra salmon', a: 5 }, { n: 'Furikake', a: 1 }] },

  // STARTERS
  { slug: 'starters', name: 'Burrata & Stone Fruit', price: 16, imageUrl: PEX(1640775),
    description: 'Creamy Puglian burrata over grilled peaches, heirloom tomatoes, basil oil and toasted pine nuts.',
    tags: ['vegetarian', 'seasonal'], prepTime: '8 min', kcal: '410', pairing: 'Rosé',
    optionGroups: [{ title: 'Bread', options: [{ n: 'Focaccia', a: 0 }, { n: 'Sourdough', a: 0 }, { n: 'None', a: 0 }] }],
    extras: [{ n: 'Parma ham', a: 5 }, { n: 'Aged balsamic', a: 2 }] },
  { slug: 'starters', name: 'Tuna Tartare Royale', price: 22, imageUrl: PEX(1146760),
    description: 'Hand-cut yellowfin with avocado, yuzu kosho, soy pearls, sesame and crisp wonton chips.',
    tags: ['raw', 'chef-pick'], prepTime: '9 min', kcal: '320', pairing: 'Sancerre',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Hot', a: 0 }] }],
    extras: [{ n: 'Caviar drop', a: 8 }, { n: 'Extra wontons', a: 2 }] },
  { slug: 'starters', name: 'Wild Mushroom Velouté', price: 13, imageUrl: PEX(539451),
    description: 'Silky soup of porcini and cremini, truffle cream, chives and a chestnut crouton.',
    tags: ['vegetarian', 'warm'], prepTime: '7 min', kcal: '290', pairing: 'Pinot Noir',
    optionGroups: [{ title: 'Size', options: [{ n: 'Cup', a: 0 }, { n: 'Bowl', a: 3 }] }],
    extras: [{ n: 'Truffle shavings', a: 6 }] },
  { slug: 'starters', name: 'Beef Carpaccio', price: 19, imageUrl: PEX(675951),
    description: 'Thinly sliced raw beef tenderloin with capers, parmesan, rocket, lemon and truffle oil.',
    tags: ['raw'], prepTime: '7 min', kcal: '310', pairing: 'Chianti',
    optionGroups: [{ title: 'Garnish', options: [{ n: 'Classic', a: 0 }, { n: 'No capers', a: 0 }] }],
    extras: [{ n: 'Quail egg', a: 3 }] },
  { slug: 'starters', name: 'Garlic Tiger Prawns', price: 18, imageUrl: PEX(2624859),
    description: 'Six tiger prawns sizzled in garlic, chilli and parsley butter, served with grilled sourdough.',
    tags: ['pescatarian', 'spicy'], prepTime: '10 min', kcal: '380', pairing: 'Albariño',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Hot', a: 0 }] }],
    extras: [{ n: 'Extra bread', a: 2 }] },
  { slug: 'starters', name: 'Crispy Goat Cheese', price: 14, imageUrl: PEX(1633578),
    description: 'Panko-crusted goat cheese, beetroot, candied walnuts, baby greens and honey-mustard.',
    tags: ['vegetarian'], prepTime: '9 min', kcal: '370', pairing: 'Sauv Blanc',
    optionGroups: [{ title: 'Side', options: [{ n: 'Salad', a: 0 }, { n: 'Toasted bread', a: 0 }] }],
    extras: [{ n: 'Extra walnuts', a: 1 }] },

  // MAINS
  { slug: 'mains', name: 'Royal Wagyu Steak', price: 54, imageUrl: PEX(2725744),
    description: '250g wagyu sirloin grilled over oak with bone-marrow butter, pommes purée and a port jus.',
    tags: ['signature'], prepTime: '22 min', kcal: '780', pairing: 'Malbec',
    optionGroups: [{ title: 'Cooked to', options: [{ n: 'Rare', a: 0 }, { n: 'Medium-rare', a: 0 }, { n: 'Medium', a: 0 }, { n: 'Well done', a: 0 }] }],
    extras: [{ n: 'Truffle butter', a: 5 }, { n: 'Grilled asparagus', a: 6 }, { n: 'Café de Paris', a: 3 }] },
  { slug: 'mains', name: 'Pan-seared Sea Bass', price: 36, imageUrl: PEX(725992),
    description: 'Crispy-skin Mediterranean sea bass on saffron risotto with grilled fennel, lemon oil and salsa verde.',
    tags: ['pescatarian'], prepTime: '18 min', kcal: '520', pairing: 'Chardonnay',
    optionGroups: [{ title: 'Side', options: [{ n: 'Saffron risotto', a: 0 }, { n: 'Crushed potatoes', a: 0 }, { n: 'Seasonal greens', a: 0 }] }],
    extras: [{ n: 'Extra prawns', a: 7 }] },
  { slug: 'mains', name: 'Charred Cauliflower', price: 24, imageUrl: PEX(1437318),
    description: 'Whole roasted cauliflower with tahini, pomegranate, harissa oil, dukkah and herbed couscous.',
    tags: ['vegan', 'spicy'], prepTime: '25 min', kcal: '420', pairing: 'Grenache',
    optionGroups: [{ title: 'Portion', options: [{ n: 'Half', a: 0 }, { n: 'Whole', a: 6 }] }],
    extras: [{ n: 'Hummus side', a: 4 }] },
  { slug: 'mains', name: 'Slow-cooked Lamb Shoulder', price: 42, imageUrl: PEX(675951, 900),
    description: 'Eight-hour braised lamb shoulder, sticky pomegranate glaze, smoked aubergine and herb couscous.',
    tags: ['slow-cooked'], prepTime: '25 min', kcal: '720', pairing: 'Syrah',
    optionGroups: [{ title: 'Side', options: [{ n: 'Couscous', a: 0 }, { n: 'Roast potatoes', a: 0 }] }],
    extras: [{ n: 'Mint yogurt', a: 2 }, { n: 'Flatbread', a: 3 }] },
  { slug: 'mains', name: 'Free-range Chicken Suprême', price: 30, imageUrl: PEX(2338407),
    description: 'Crisp-skin corn-fed chicken, creamed leeks, wild mushrooms, tarragon jus and pommes purée.',
    tags: ['classic'], prepTime: '20 min', kcal: '620', pairing: 'Chardonnay',
    optionGroups: [{ title: 'Side', options: [{ n: 'Pommes purée', a: 0 }, { n: 'Buttered greens', a: 0 }] }],
    extras: [{ n: 'Truffle oil', a: 4 }] },
  { slug: 'mains', name: "Duck Breast à l'Orange", price: 38, imageUrl: PEX(2641886),
    description: 'Rendered duck breast, blood orange glaze, dauphinoise potatoes and braised red cabbage.',
    tags: ['chef-pick'], prepTime: '22 min', kcal: '680', pairing: 'Pinot Noir',
    optionGroups: [{ title: 'Cook', options: [{ n: 'Pink', a: 0 }, { n: 'Medium', a: 0 }] }],
    extras: [{ n: 'Foie gras slice', a: 9 }] },

  // PASTA & PIZZA
  { slug: 'pasta', name: 'Tagliatelle al Tartufo', price: 28, imageUrl: PEX(1437267),
    description: 'House-made egg tagliatelle in butter and parmesan, finished tableside with fresh black truffle.',
    tags: ['signature'], prepTime: '14 min', kcal: '610', pairing: 'Barolo',
    optionGroups: [{ title: 'Truffle', options: [{ n: 'Generous', a: 0 }, { n: 'Lavish (double)', a: 12 }] }],
    extras: [{ n: 'Fried egg', a: 2 }] },
  { slug: 'pasta', name: 'Pizza Margherita D.O.P.', price: 19, imageUrl: PEX(2147491),
    description: '72-hour dough, San Marzano tomato, fior di latte, fresh basil and extra-virgin olive oil.',
    tags: ['vegetarian', 'wood-fired'], prepTime: '11 min', kcal: '780', pairing: "Nero d'Avola",
    optionGroups: [{ title: 'Crust', options: [{ n: 'Classic', a: 0 }, { n: 'Thin', a: 0 }, { n: 'Sourdough', a: 2 }] }],
    extras: [{ n: 'Buffalo mozzarella', a: 5 }, { n: 'Spicy nduja', a: 4 }, { n: 'Anchovies', a: 3 }] },
  { slug: 'pasta', name: 'Lobster Linguine', price: 38, imageUrl: PEX(1438672),
    description: 'Half lobster tail, fresh linguine in a tomato-brandy bisque, chilli, garlic and parsley.',
    tags: ['pescatarian', 'signature'], prepTime: '18 min', kcal: '680', pairing: 'Vermentino',
    optionGroups: [{ title: 'Heat', options: [{ n: 'Mild', a: 0 }, { n: 'Spicy', a: 0 }] }],
    extras: [{ n: 'Extra lobster', a: 14 }] },
  { slug: 'pasta', name: 'Cacio e Pepe', price: 18, imageUrl: PEX(1373915),
    description: 'Tonnarelli with pecorino romano, crushed Tellicherry pepper and starchy pasta water. Three ingredients, perfected.',
    tags: ['vegetarian', 'classic'], prepTime: '12 min', kcal: '540', pairing: 'Frascati',
    optionGroups: [{ title: 'Pasta', options: [{ n: 'Tonnarelli', a: 0 }, { n: 'Spaghetti', a: 0 }] }],
    extras: [{ n: 'Black truffle shavings', a: 8 }] },
  { slug: 'pasta', name: 'Pizza Tartufo Bianco', price: 26, imageUrl: PEX(905847),
    description: 'White pizza with fior di latte, fontina, wild mushrooms, garlic oil and shaved white truffle.',
    tags: ['vegetarian', 'chef-pick'], prepTime: '12 min', kcal: '820', pairing: 'Soave',
    optionGroups: [{ title: 'Crust', options: [{ n: 'Classic', a: 0 }, { n: 'Thin', a: 0 }] }],
    extras: [{ n: 'Quail egg', a: 3 }] },

  // DESSERTS
  { slug: 'desserts', name: 'Vanilla Crème Brûlée', price: 11, imageUrl: PEX(2014693),
    description: 'Madagascar vanilla custard with a crackling burnt-sugar lid, served with shortbread and berries.',
    tags: ['house-made'], prepTime: '4 min', kcal: '460', pairing: 'Sauternes',
    optionGroups: [{ title: 'Side', options: [{ n: 'Berries', a: 0 }, { n: 'Vanilla ice cream', a: 2 }] }],
    extras: [] },
  { slug: 'desserts', name: 'Dark Chocolate Fondant', price: 13, imageUrl: PEX(45202),
    description: 'Warm 70% Valrhona fondant with a molten centre, salted caramel sauce and vanilla bean gelato.',
    tags: ['signature'], prepTime: '12 min', kcal: '580', pairing: 'Port',
    optionGroups: [{ title: 'Gelato', options: [{ n: 'Vanilla', a: 0 }, { n: 'Pistachio', a: 2 }, { n: 'Hazelnut', a: 2 }] }],
    extras: [{ n: 'Extra scoop', a: 3 }] },
  { slug: 'desserts', name: 'Tiramisù Royal', price: 10, imageUrl: PEX(8951406),
    description: 'Layered savoiardi soaked in espresso & marsala, mascarpone cream and a dusting of dark cocoa.',
    tags: ['classic'], prepTime: '3 min', kcal: '420', pairing: 'Vin Santo',
    optionGroups: [{ title: 'Style', options: [{ n: 'Classic', a: 0 }, { n: 'Pistachio', a: 2 }] }],
    extras: [{ n: 'Espresso shot', a: 3 }] },
  { slug: 'desserts', name: 'Lemon Tart Meringué', price: 11, imageUrl: PEX(1126359),
    description: 'Sablé pastry, Amalfi lemon curd, torched Italian meringue and candied lemon zest.',
    tags: ['citrus'], prepTime: '4 min', kcal: '380', pairing: 'Moscato',
    optionGroups: [{ title: 'Tart', options: [{ n: 'Classic', a: 0 }, { n: 'Yuzu', a: 1 }] }],
    extras: [{ n: 'Berry compote', a: 2 }] },
  { slug: 'desserts', name: 'Affogato al Caffè', price: 8, imageUrl: PEX(2059149),
    description: 'A scoop of vanilla bean gelato drowned tableside in a fresh shot of espresso. Pure ceremony.',
    tags: ['quick'], prepTime: '2 min', kcal: '220', pairing: 'Amaretto',
    optionGroups: [{ title: 'Liquor', options: [{ n: 'None', a: 0 }, { n: 'Amaretto splash', a: 4 }, { n: 'Frangelico', a: 4 }] }],
    extras: [] },

  // DRINKS
  { slug: 'drinks', name: 'Royal Garden Spritz', price: 14, imageUrl: PEX(1352270),
    description: 'House gin, elderflower, cucumber, lemon thyme and a top of brut prosecco. Bright, herbal, long.',
    tags: ['signature', 'alcoholic'], prepTime: '3 min', kcal: '180', pairing: 'Aperitivo',
    optionGroups: [{ title: 'Strength', options: [{ n: 'Standard', a: 0 }, { n: 'Double', a: 6 }] }],
    extras: [] },
  { slug: 'drinks', name: 'Single-Origin Espresso', price: 5, imageUrl: PEX(312418),
    description: 'A double shot of our Ethiopia Yirgacheffe — bright, floral, with notes of bergamot and stone fruit.',
    tags: ['caffeine'], prepTime: '2 min', kcal: '5', pairing: '',
    optionGroups: [{ title: 'Style', options: [{ n: 'Espresso', a: 0 }, { n: 'Cortado', a: 1 }, { n: 'Flat white', a: 2 }] }],
    extras: [{ n: 'Oat milk', a: 1 }] },
  { slug: 'drinks', name: 'Cold-pressed Greens', price: 9, imageUrl: PEX(616833),
    description: 'Cucumber, green apple, kale, ginger, mint and lemon. Pressed to order, served over crushed ice.',
    tags: ['vegan', 'no-sugar'], prepTime: '4 min', kcal: '110', pairing: '',
    optionGroups: [{ title: 'Ginger', options: [{ n: 'Mild', a: 0 }, { n: 'Standard', a: 0 }, { n: 'Fiery', a: 0 }] }],
    extras: [] },
  { slug: 'drinks', name: 'Negroni Classico', price: 15, imageUrl: PEX(602750),
    description: 'Equal parts gin, Campari and sweet vermouth, stirred over a single block of ice with orange peel.',
    tags: ['alcoholic', 'classic'], prepTime: '3 min', kcal: '210', pairing: 'Aperitivo',
    optionGroups: [{ title: 'Style', options: [{ n: 'Classic', a: 0 }, { n: 'Sbagliato (prosecco)', a: 0 }, { n: 'Bianco', a: 0 }] }],
    extras: [] },
  { slug: 'drinks', name: 'House Red — Sangiovese', price: 12, imageUrl: PEX(1407846),
    description: 'A medium-bodied Tuscan sangiovese with notes of cherry, leather and dried herbs. By the glass.',
    tags: ['alcoholic'], prepTime: '2 min', kcal: '150', pairing: 'Pasta',
    optionGroups: [{ title: 'Pour', options: [{ n: '125ml', a: 0 }, { n: '175ml', a: 3 }, { n: 'Bottle', a: 32 }] }],
    extras: [] },
  { slug: 'drinks', name: 'Earl Grey Royal', price: 6, imageUrl: PEX(230477),
    description: 'A bright Ceylon black tea scented with bergamot and a hint of blue cornflower. Served in a porcelain pot.',
    tags: ['caffeine'], prepTime: '3 min', kcal: '2', pairing: 'Pastries',
    optionGroups: [{ title: 'Milk', options: [{ n: 'None', a: 0 }, { n: 'Whole milk', a: 0 }, { n: 'Oat', a: 1 }] }],
    extras: [{ n: 'Honey', a: 1 }, { n: 'Lemon', a: 0 }] },
];

const BANNERS = [
  { service: 'morning', tagLabel: 'This morning',
    headline: 'A quiet morning,<br/>well <em>fed.</em>',
    body: "Pastries, eggs and slow coffee from 7 AM. Order ahead and we'll have it warm at your table.",
    imageUrl: PEX(1640772, 1400), ctaText: 'Explore breakfast', ctaCategorySlug: 'breakfast',
    meta1Label: 'served', meta1Value: '07–11',
    meta2Label: 'dishes', meta2Value: '14',
    meta3Label: 'service', meta3Value: 'Slow' },
  { service: 'midday', tagLabel: 'Midday plates',
    headline: 'Light, sharp,<br/><em>back</em> to the day.',
    body: 'A short, well-edited lunch list. Bowls, plates and a sandwich the chef would actually eat.',
    imageUrl: PEX(1640775, 1400), ctaText: 'Explore lunch', ctaCategorySlug: 'lunch',
    meta1Label: 'served', meta1Value: '12–15',
    meta2Label: 'courses max', meta2Value: '3',
    meta3Label: 'turnaround', meta3Value: '30m' },
  { service: 'evening', tagLabel: "Tonight's Tasting",
    headline: 'Five courses,<br/>one <em>unforgettable</em> evening.',
    body: "Chef Mateo's spring tasting menu with optional wine pairing. Served at your table until 11 PM.",
    imageUrl: PEX(1640772, 1400), ctaText: 'Explore dinner', ctaCategorySlug: 'mains',
    meta1Label: 'courses', meta1Value: '5',
    meta2Label: 'per guest', meta2Value: '$95',
    meta3Label: 'last seating', meta3Value: '11 PM' },
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

  console.log('\n✓ Royal Hotel seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
