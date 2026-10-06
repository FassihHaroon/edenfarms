import { CATEGORIES, PRODUCTS, BOXES } from './catalog.js';
import { CATEGORIES_AR, PRODUCTS_AR, BUNDLES_AR, unitLabelAr } from './catalog-ar.js';

// Every setting the shop reads, with its default. New keys are added on boot
// without touching values an admin has already changed.
export const DEFAULT_SETTINGS = {
  delivery_fee_cents: 1500,
  free_delivery_cents: 10000,
  min_order_cents: 0,
  cutoff_hour: 14,
  slots_today: ['4 – 7 pm', '7 – 10 pm'],
  slots_tomorrow: ['8 – 11 am', '4 – 7 pm'],
  ordering_open: true,
  closed_message: "We're not taking online orders right now. Message us on WhatsApp and we'll help.",
  closed_message_ar: 'لا نستقبل الطلبات عبر الموقع حاليًا. راسلنا على واتساب وسنساعدك.',
  whatsapp: '97466431863',
  areas: ['West Bay', 'The Pearl', 'Lusail', 'Msheireb', 'Al Sadd', 'Bin Mahmoud', 'Old Airport', 'Al Waab',
    'Al Rayyan', 'Al Gharafa', 'Al Duhail', 'Madinat Khalifa', 'Abu Hamour', 'Ain Khaled', 'Al Thumama',
    'Al Wakra', 'Umm Salal'],
  areas_ar: ['الخليج الغربي', 'اللؤلؤة', 'لوسيل', 'مشيرب', 'السد', 'بن محمود', 'المطار القديم', 'الوعب',
    'الريان', 'الغرافة', 'الدحيل', 'مدينة خليفة', 'أبو هامور', 'عين خالد', 'الثمامة', 'الوكرة', 'أم صلال'],
  // Circles on the map we deliver inside (km from the centre).
  delivery_zones: [{ name: 'Greater Doha', lat: 25.2854, lng: 51.5310, radius_km: 30 }],
  delivery_hours: 'Daily, 8 am – 10 pm',
  delivery_hours_ar: 'يوميًا، 8 ص – 10 م',
  popular_searches: ['Mushrooms', 'Portabella', 'Honey', 'Corn', 'Peppers', 'Coriander'],
  popular_searches_ar: ['فطر', 'بورتابيلا', 'عسل', 'ذرة', 'فلفل', 'كزبرة'],
};

const cents = qar => Math.round(qar * 100);

export async function seed(db) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING',
      [key, JSON.stringify(value)]);
  }

  const { rows } = await db.query('SELECT count(*)::int AS n FROM categories');
  let created = false;
  if (rows[0].n === 0) {
    created = true;
    await db.tx(async q => {
      for (const [i, c] of CATEGORIES.entries()) {
        await q.query('INSERT INTO categories (id, name, note, img, cut, star, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [c.id, c.name, c.note || '', toAbs(c.img), !!c.cut, !!c.star, i]);
      }
      for (const [i, p] of PRODUCTS.entries()) {
        await q.query(`INSERT INTO products (id, name, category_id, origin, badge, star, cut, img, wide_img, pack, taste, uses, sort)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [p.id, p.name, p.cat, p.origin || '', p.badge || '', !!p.star, !!p.cut, toAbs(p.img), toAbs(p.wide || ''),
            p.pack || '', p.taste || '', p.uses || [], i]);
        for (const [j, u] of p.units.entries()) {
          await q.query('INSERT INTO product_units (product_id, label, price_cents, compare_cents, sort) VALUES ($1,$2,$3,$4,$5)',
            [p.id, u.l, cents(u.p), u.was ? cents(u.was) : null, j]);
        }
      }
      for (const [i, b] of BOXES.entries()) {
        await q.query(`INSERT INTO bundles (id, name, size, serves, img, tag, price_cents, compare_cents, sort)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [b.id, b.name, b.size || '', b.serves || '', toAbs(b.img), b.tag || '', cents(b.price), b.was ? cents(b.was) : null, i]);
      }
    });
  }
  await fillArabic(db);
  return created;
}

// Give the starting catalogue its Arabic text. Only empty fields are filled.
async function fillArabic(db) {
  for (const [id, c] of Object.entries(CATEGORIES_AR)) {
    await db.query(`UPDATE categories SET name_ar = CASE WHEN name_ar = '' THEN $2 ELSE name_ar END,
                    note_ar = CASE WHEN note_ar = '' THEN $3 ELSE note_ar END WHERE id = $1`, [id, c.name, c.note]);
  }
  for (const [id, p] of Object.entries(PRODUCTS_AR)) {
    await db.query(`UPDATE products SET
        name_ar   = CASE WHEN name_ar = ''   THEN $2 ELSE name_ar END,
        origin_ar = CASE WHEN origin_ar = '' THEN $3 ELSE origin_ar END,
        badge_ar  = CASE WHEN badge_ar = ''  THEN $4 ELSE badge_ar END,
        pack_ar   = CASE WHEN pack_ar = ''   THEN $5 ELSE pack_ar END,
        taste_ar  = CASE WHEN taste_ar = ''  THEN $6 ELSE taste_ar END,
        uses_ar   = CASE WHEN cardinality(uses_ar) = 0 THEN $7::text[] ELSE uses_ar END
      WHERE id = $1`, [id, p.name, p.origin || '', p.badge || '', p.pack || '', p.taste || '', p.uses || []]);
  }
  for (const [id, b] of Object.entries(BUNDLES_AR)) {
    await db.query(`UPDATE bundles SET
        name_ar   = CASE WHEN name_ar = ''   THEN $2 ELSE name_ar END,
        size_ar   = CASE WHEN size_ar = ''   THEN $3 ELSE size_ar END,
        serves_ar = CASE WHEN serves_ar = '' THEN $4 ELSE serves_ar END,
        tag_ar    = CASE WHEN tag_ar = ''    THEN $5 ELSE tag_ar END
      WHERE id = $1`, [id, b.name, b.size || '', b.serves || '', b.tag || '']);
  }
  const { rows } = await db.query(`SELECT id, label FROM product_units WHERE label_ar = ''`);
  for (const u of rows) {
    const ar = unitLabelAr(u.label);
    if (ar) await db.query('UPDATE product_units SET label_ar = $2 WHERE id = $1', [u.id, ar]);
  }
}

// Store image paths site-absolute so they work from any page (/admin included).
const toAbs = p => (p && !/^(\/|https?:)/.test(p) ? '/' + p : p);
