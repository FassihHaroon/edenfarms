/* Initial catalogue, copied from the original js/products.js (October 2026).
   Used only to fill an empty database on first start. After that, the admin panel
   (/admin) is the place to change products, prices and discounts. */

export const CATEGORIES = [
  { id: 'mushrooms', name: 'Mushrooms', note: 'Our speciality', img: 'assets/img/eden/mush-white.webp', star: true },
  { id: 'vegetables', name: 'Vegetables', note: 'Grown on our farm', img: 'assets/img/eden/peppers.webp', cut: true },
  { id: 'herbs', name: 'Fresh Herbs', note: 'Cut this morning', img: 'assets/img/eden/coriander.webp' },
  { id: 'honey', name: 'Farm Honey', note: 'Pure Sidr honey', img: 'assets/img/eden/honey.webp', cut: true },
  { id: 'boxes', name: 'Bundles', note: 'Trio, crate & veg', img: 'assets/img/eden/shop-mush-shelf.webp' },
];

export const PRODUCTS = [
  /* ---- Mushrooms: grown at Eden Farm, packed under the Oryx label ---- */
  { id: 'mush-white', name: 'White Button Mushrooms', cat: 'mushrooms', origin: 'Oryx · Eden Farm', star: true, badge: 'Our speciality',
    img: 'assets/img/eden/mush-white.webp', wide: 'assets/img/eden/mush-white-wide.webp', pack: '250 g pack',
    taste: 'Mild, delicate and versatile. Firm white caps that stay crisp raw and turn golden in the pan.',
    uses: ['Salads', 'Omelettes', 'Pizza', 'Stir-fries'],
    units: [{ l: '1 pack', p: 7 }, { l: '2 packs', p: 13 }, { l: '4 packs', p: 24 }] },
  { id: 'mush-brown', name: 'Brown Mushrooms', cat: 'mushrooms', origin: 'Oryx · Eden Farm', star: true, badge: 'Our speciality',
    img: 'assets/img/eden/mush-brown.webp', wide: 'assets/img/eden/mush-brown-wide.webp', pack: '250 g pack',
    taste: 'Earthier and nuttier than white buttons, with a meatier bite that holds up in long cooking.',
    uses: ['Pasta', 'Risotto', 'Stews', 'Sauces'],
    units: [{ l: '1 pack', p: 8 }, { l: '2 packs', p: 15 }, { l: '4 packs', p: 28 }] },
  { id: 'mush-porta', name: 'Portabella Mushrooms', cat: 'mushrooms', origin: 'Oryx · Eden Farm', star: true, badge: 'Our speciality', cut: true,
    img: 'assets/img/eden/mush-porta.webp', wide: 'assets/img/eden/mush-porta-wide.webp', pack: '170 g · 2 caps',
    taste: 'Big, open caps with a rich, almost steak-like texture. Made for the grill.',
    uses: ['Grilling', 'Burgers', 'Stuffed', 'BBQ'],
    units: [{ l: '1 pack', p: 9 }, { l: '2 packs', p: 17 }, { l: '4 packs', p: 32 }] },

  /* ---- Vegetables ---- */
  { id: 'peppers', name: 'Red & Yellow Bell Peppers', cat: 'vegetables', origin: 'Eden Farm, Qatar', badge: 'Picked today', cut: true,
    img: 'assets/img/eden/peppers.webp', units: [{ l: '500 g', p: 6.5 }, { l: '1 kg', p: 12 }] },
  { id: 'corn', name: 'Sweet Corn', cat: 'vegetables', origin: 'Eden Farm, Qatar', cut: true,
    img: 'assets/img/eden/corn.webp', units: [{ l: '3 cobs', p: 8 }, { l: '6 cobs', p: 15 }] },
  { id: 'chili', name: 'Long Green Chillies', cat: 'vegetables', origin: 'Eden Farm, Qatar', cut: true,
    img: 'assets/img/eden/chili.webp', units: [{ l: '1 tray', p: 5 }, { l: '2 trays', p: 9 }] },
  { id: 'capsicum', name: 'Green & Yellow Capsicum', cat: 'vegetables', origin: 'Eden Farm, Qatar', cut: true,
    img: 'assets/img/eden/capsicum.webp', units: [{ l: '500 g', p: 6 }, { l: '1 kg', p: 11 }] },
  { id: 'cucumbers', name: 'Baby Cucumbers', cat: 'vegetables', origin: 'Eden Farm, Qatar',
    img: 'assets/img/eden/cucumbers.webp', units: [{ l: '1 kg', p: 5 }, { l: '2 kg', p: 9 }] },
  { id: 'beans', name: 'Green Beans', cat: 'vegetables', origin: 'Eden Farm, Qatar',
    img: 'assets/img/eden/beans.webp', units: [{ l: '500 g', p: 7 }, { l: '1 kg', p: 13 }] },
  { id: 'tomatoes', name: 'Field Tomatoes', cat: 'vegetables', origin: 'Eden Farm, Qatar',
    img: 'assets/img/eden/tomatoes.webp', units: [{ l: '1 kg', p: 4.5 }, { l: '2 kg', p: 8 }] },
  { id: 'cherry-tom', name: 'Cherry Tomatoes on the Vine', cat: 'vegetables', origin: 'Eden Farm, Qatar',
    img: 'assets/img/eden/cherry-tom.webp', units: [{ l: '250 g', p: 6 }, { l: '500 g', p: 11 }] },
  { id: 'radish', name: 'Red Radish', cat: 'vegetables', origin: 'Eden Farm, Qatar',
    img: 'assets/img/eden/radish.webp', units: [{ l: '500 g', p: 4 }, { l: '1 kg', p: 7 }] },

  /* ---- Herbs & honey ---- */
  { id: 'coriander', name: 'Fresh Coriander', cat: 'herbs', origin: 'Eden Farm, Qatar', badge: 'Cut today',
    img: 'assets/img/eden/coriander.webp', units: [{ l: '1 bunch', p: 2.5 }, { l: '3 bunches', p: 6 }] },
  { id: 'honey', name: 'Eden Farm Sidr Honey', cat: 'honey', origin: 'Eden Farm, Qatar', badge: 'From our farm', cut: true,
    img: 'assets/img/eden/honey.webp', units: [{ l: '1 jar', p: 90 }, { l: '2 jars', p: 170 }] },
];

export const BOXES = [
  { id: 'box-trio', name: 'Mushroom Trio', size: 'White, brown & portabella · 3 packs', serves: 'All picked the same morning',
    img: 'assets/img/eden/shop-mush-shelf.webp', price: 21, was: 24, tag: 'Our speciality' },
  { id: 'box-crate', name: "Chef's Mushroom Crate", size: '8 × 250 g white button · 2 kg', serves: 'For restaurants, parties & big cooks',
    img: 'assets/img/eden/mush-white-wide.webp', price: 48, was: 56 },
  { id: 'box-veg', name: 'Eden Veg Basket', size: 'Peppers, corn, cucumbers, beans & coriander', serves: 'A week of farm veg for 3–4',
    img: 'assets/img/eden/ig-peppers.webp', price: 59, was: 70 },
];
