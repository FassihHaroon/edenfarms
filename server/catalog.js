// Builds the public catalogue (what the storefront shows) and owns all price
// maths, so the shop page and the order API can never disagree on a price.
import { qatarNow, availableSlots } from './time.js';
import { DEFAULT_SETTINGS } from './seed/index.js';
import { unitLabelAr } from './seed/catalog-ar.js';
import { uiStrings } from './i18n.js';

export const toQar = cents => Math.round(cents) / 100;

export async function loadSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export function discountActive(product, now = new Date()) {
  return product.discount_pct > 0 && (!product.discount_until || new Date(product.discount_until) > now);
}

// Selling price and the struck-through "was" price for one pack size.
export function unitPrice(product, unit, now = new Date()) {
  if (discountActive(product, now)) {
    const price = Math.round(unit.price_cents * (100 - product.discount_pct) / 100);
    return { cents: price, compare: Math.max(unit.compare_cents || 0, unit.price_cents) };
  }
  const compare = unit.compare_cents && unit.compare_cents > unit.price_cents ? unit.compare_cents : null;
  return { cents: unit.price_cents, compare };
}

// Bundles are sold as one box; repeat deliveries are chosen at checkout for the whole basket.
export function bundleUnits(bundle) {
  return [{ id: 'once', label: 'Box', label_ar: 'صندوق', cents: bundle.price_cents, compare: bundle.compare_cents }];
}

export async function loadProducts(db, { includeHidden = false, ids } = {}) {
  const where = [];
  const params = [];
  if (!includeHidden) where.push('p.active');
  if (ids) { params.push(ids); where.push(`p.id = ANY($${params.length})`); }
  const { rows } = await db.query(
    `SELECT p.*, coalesce(json_agg(json_build_object(
        'id', u.id, 'label', u.label, 'label_ar', u.label_ar, 'price_cents', u.price_cents, 'compare_cents', u.compare_cents, 'sort', u.sort
      ) ORDER BY u.sort, u.id) FILTER (WHERE u.id IS NOT NULL), '[]') AS units
     FROM products p
     LEFT JOIN product_units u ON u.product_id = p.id
     JOIN categories c ON c.id = p.category_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY p.id, c.sort
     ORDER BY c.sort, p.sort, p.name`, params);
  return rows;
}

export async function loadBundles(db, { includeHidden = false, ids } = {}) {
  const where = [];
  const params = [];
  if (!includeHidden) where.push('active');
  if (ids) { params.push(ids); where.push(`id = ANY($${params.length})`); }
  const { rows } = await db.query(
    `SELECT * FROM bundles ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort, name`, params);
  return rows;
}

// Arabic text where it exists, English otherwise.
const pick = (row, field, ar) => (ar && row[`${field}_ar`]) || row[field];

export function publicZones(settings) {
  return (settings.delivery_zones || []).map(z => ({ name: z.name, lat: z.lat, lng: z.lng, radiusKm: z.radius_km }));
}

export async function buildCatalog(db, { now = new Date(), lang = 'en' } = {}) {
  const ar = lang === 'ar';
  const [settings, { rows: categories }, products, bundles] = await Promise.all([
    loadSettings(db),
    db.query('SELECT * FROM categories ORDER BY sort, name'),
    loadProducts(db),
    loadBundles(db),
  ]);
  return {
    lang,
    categories: categories.map(c => ({ id: c.id, name: pick(c, 'name', ar), note: pick(c, 'note', ar), img: c.img, cut: c.cut, star: c.star })),
    products: products.filter(p => p.units.length).map(p => ({
      id: p.id, name: pick(p, 'name', ar), cat: p.category_id, origin: pick(p, 'origin', ar), badge: pick(p, 'badge', ar),
      star: p.star, cut: p.cut, img: p.img, wide: p.wide_img || '', pack: pick(p, 'pack', ar), taste: pick(p, 'taste', ar),
      uses: ar && p.uses_ar.length ? p.uses_ar : p.uses,
      units: p.units.map(u => {
        const { cents, compare } = unitPrice(p, u, now);
        const l = ar ? (u.label_ar || unitLabelAr(u.label) || u.label) : u.label;
        return { id: u.id, l, p: toQar(cents), ...(compare ? { was: toQar(compare) } : {}) };
      }),
    })),
    boxes: bundles.map(b => ({
      id: b.id, name: pick(b, 'name', ar), size: pick(b, 'size', ar), serves: pick(b, 'serves', ar), img: b.img, tag: pick(b, 'tag', ar),
      price: toQar(b.price_cents), ...(b.compare_cents > b.price_cents ? { was: toQar(b.compare_cents) } : {}),
      units: bundleUnits(b).map(u => ({ id: u.id, l: ar ? u.label_ar : u.label, p: toQar(u.cents) })),
    })),
    settings: {
      freeDelivery: toQar(settings.free_delivery_cents),
      deliveryFee: toQar(settings.delivery_fee_cents),
      minOrder: toQar(settings.min_order_cents),
      cutoffHour: settings.cutoff_hour,
      orderingOpen: settings.ordering_open,
      closedMessage: (ar && settings.closed_message_ar) || settings.closed_message,
      whatsapp: settings.whatsapp,
      areas: (ar && settings.areas_ar?.length ? settings.areas_ar : settings.areas) || [],
      slots: availableSlots(settings, now),
      zones: publicZones(settings),
      popular: (ar && settings.popular_searches_ar?.length ? settings.popular_searches_ar : settings.popular_searches) || [],
      deliveryHours: (ar && settings.delivery_hours_ar) || settings.delivery_hours,
    },
    t: uiStrings(lang),
    qatar: qatarNow(now),
  };
}

// Short-lived in-process cache: the storefront asks for the catalogue on every
// page view, admin edits clear it immediately.
const cache = new WeakMap();
const TTL_MS = 15_000;
export async function getCatalog(db, lang = 'en') {
  let perDb = cache.get(db);
  if (!perDb) cache.set(db, (perDb = new Map()));
  const hit = perDb.get(lang);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await buildCatalog(db, { lang });
  perDb.set(lang, { at: Date.now(), data });
  return data;
}
export const invalidateCatalog = db => { cache.delete(db); };
