// JSON API behind /api/admin. Every route here requires a signed-in admin
// (enforced in app.js before this router runs).
import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { loadProducts, loadBundles, loadSettings, invalidateCatalog, toQar, discountActive } from './catalog.js';
import { presentOrder, ORDER_SELECT, createSubscriptionOrder, OrderError } from './orders.js';
import { upload, saveImage } from './images.js';
import { hashPassword, passwordProblem } from './auth.js';
import { qatarNow, addDays } from './time.js';

const text = (max, min = 0) => z.string().trim().min(min).max(max);
const money = z.number().positive().max(100000);
const cents = qar => Math.round(qar * 100);
const imgPath = z.string().trim().max(300).regex(/^\/(img|assets)\/[\w./-]+$/, 'Upload a photo');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const ProductInput = z.object({
  name: text(80, 2),
  nameAr: text(80).default(''),
  cat: text(40, 1),
  origin: text(60).default('Eden Farm, Qatar'),
  originAr: text(60).default(''),
  badge: text(30).default(''),
  badgeAr: text(30).default(''),
  star: z.boolean().default(false),
  cut: z.boolean().default(false),
  img: imgPath,
  wide: z.union([imgPath, z.literal('')]).default(''),
  pack: text(40).default(''),
  packAr: text(40).default(''),
  taste: text(400).default(''),
  tasteAr: text(400).default(''),
  uses: z.array(text(30, 1)).max(8).default([]),
  usesAr: z.array(text(30, 1)).max(8).default([]),
  discountPct: z.number().int().min(0).max(90).default(0),
  discountUntil: day.nullable().default(null),
  active: z.boolean().default(true),
  units: z.array(z.object({
    id: z.number().int().positive().optional(),
    l: text(30, 1),
    lAr: text(30).default(''),
    p: money,
    was: money.nullable().optional(),
  })).min(1, 'Add at least one pack size and price').max(8),
});

const BundleInput = z.object({
  name: text(80, 2),
  nameAr: text(80).default(''),
  size: text(80).default(''),
  sizeAr: text(80).default(''),
  serves: text(80).default(''),
  servesAr: text(80).default(''),
  img: imgPath,
  tag: text(30).default(''),
  tagAr: text(30).default(''),
  price: money,
  was: money.nullable().default(null),
  active: z.boolean().default(true),
});

const SettingsInput = z.object({
  deliveryFee: z.number().min(0).max(1000),
  freeDelivery: z.number().min(0).max(100000),
  minOrder: z.number().min(0).max(100000),
  cutoffHour: z.number().int().min(0).max(23),
  slotsToday: z.array(text(40, 1)).max(8),
  slotsTomorrow: z.array(text(40, 1)).min(1, 'Keep at least one slot for tomorrow').max(8),
  orderingOpen: z.boolean(),
  closedMessage: text(300, 1),
  closedMessageAr: text(300),
  whatsapp: z.string().trim().regex(/^\d{8,15}$/, 'Digits only, with country code, e.g. 97466431863'),
  areas: z.array(text(60, 1)).max(80),
  areasAr: z.array(text(60, 1)).max(80),
  zones: z.array(z.object({
    name: text(60, 1),
    lat: z.number().min(24.4).max(26.3),
    lng: z.number().min(50.6).max(51.8),
    radiusKm: z.number().min(0.5).max(80),
  })).min(1, 'Keep at least one delivery area').max(20),
  popular: z.array(text(30, 1)).max(10),
  popularAr: z.array(text(30, 1)).max(10),
  deliveryHours: text(60, 1),
  deliveryHoursAr: text(60),
}).partial();

const SETTINGS_MAP = {
  deliveryFee: ['delivery_fee_cents', cents], freeDelivery: ['free_delivery_cents', cents], minOrder: ['min_order_cents', cents],
  cutoffHour: ['cutoff_hour'], slotsToday: ['slots_today'], slotsTomorrow: ['slots_tomorrow'],
  orderingOpen: ['ordering_open'], closedMessage: ['closed_message'], closedMessageAr: ['closed_message_ar'],
  whatsapp: ['whatsapp'], areas: ['areas'], areasAr: ['areas_ar'],
  zones: ['delivery_zones', zs => zs.map(z => ({ name: z.name, lat: z.lat, lng: z.lng, radius_km: z.radiusKm }))],
  popular: ['popular_searches'], popularAr: ['popular_searches_ar'],
  deliveryHours: ['delivery_hours'], deliveryHoursAr: ['delivery_hours_ar'],
};

const STATUSES = ['new', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];

class InputError extends Error {
  constructor(fields) { super('Please fix the highlighted fields.'); this.fields = fields; }
}
function parse(schema, body) {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const fields = {};
  for (const i of r.error.issues) fields[i.path.join('.') || 'form'] ??= i.message;
  throw new InputError(fields);
}

const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'item';

async function uniqueId(db, table, base) {
  let id = base;
  for (let n = 2; ; n++) {
    const { rows } = await db.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
    if (!rows.length) return id;
    id = `${base}-${n}`;
  }
}

function presentAdminProduct(p) {
  return {
    id: p.id, name: p.name, nameAr: p.name_ar, cat: p.category_id, origin: p.origin, originAr: p.origin_ar,
    badge: p.badge, badgeAr: p.badge_ar, star: p.star, cut: p.cut, img: p.img, wide: p.wide_img,
    pack: p.pack, packAr: p.pack_ar, taste: p.taste, tasteAr: p.taste_ar, uses: p.uses, usesAr: p.uses_ar, active: p.active,
    discountPct: p.discount_pct,
    discountUntil: p.discount_until ? qatarNow(new Date(p.discount_until)).date : null,
    discountLive: discountActive(p),
    units: p.units.map(u => ({ id: u.id, l: u.label, lAr: u.label_ar, p: toQar(u.price_cents), was: u.compare_cents ? toQar(u.compare_cents) : null })),
    updatedAt: p.updated_at,
  };
}

function presentAdminBundle(b) {
  return {
    id: b.id, name: b.name, nameAr: b.name_ar, size: b.size, sizeAr: b.size_ar, serves: b.serves, servesAr: b.serves_ar,
    img: b.img, tag: b.tag, tagAr: b.tag_ar, active: b.active,
    price: toQar(b.price_cents), was: b.compare_cents ? toQar(b.compare_cents) : null,
  };
}

function presentSubscription(s, today) {
  return {
    id: s.id, status: s.status, everyDays: s.every_days, nextDate: s.next_day, due: s.status === 'active' && s.next_day <= addDays(today, 1),
    customer: { name: s.customer_name, phone: s.phone, area: s.area, zone: s.zone, street: s.street, building: s.building, details: s.address_notes },
    location: s.lat != null ? { lat: s.lat, lng: s.lng } : null,
    window: s.slot_window, payment: s.payment_method, notes: s.notes, lang: s.lang,
    items: s.items_view || [], orders: s.order_count, lastOrderId: s.last_order_id, createdAt: s.created_at,
  };
}

// Discount "until" is a date; it runs to the end of that day in Qatar.
const endOfQatarDay = d => (d ? `${d}T23:59:59+03:00` : null);

export function adminRouter({ db, auth }) {
  const r = express.Router();
  const changed = () => invalidateCatalog(db);

  r.get('/me', (req, res) => res.json({ email: req.admin.email, name: req.admin.name }));

  /* ---------- Dashboard summary ---------- */
  r.get('/summary', async (req, res) => {
    const today = qatarNow().date;
    const tomorrow = addDays(today, 1);
    // "Today" for sales means the Qatar calendar day, passed as explicit UTC bounds.
    const { rows: [s] } = await db.query(
      `SELECT count(*) FILTER (WHERE status = 'new')::int AS new_orders,
              count(*) FILTER (WHERE slot_date = $1::date AND status <> 'cancelled')::int AS today_deliveries,
              count(*) FILTER (WHERE slot_date = $2::date AND status <> 'cancelled')::int AS tomorrow_deliveries,
              coalesce(sum(total_cents) FILTER (WHERE created_at >= $3 AND created_at < $4 AND status <> 'cancelled'), 0)::int AS today_sales_cents,
              count(*) FILTER (WHERE created_at >= $3 AND created_at < $4 AND status <> 'cancelled')::int AS today_orders
       FROM orders`, [today, tomorrow, `${today}T00:00:00+03:00`, `${tomorrow}T00:00:00+03:00`]);
    const { rows: [sub] } = await db.query(
      `SELECT count(*) FILTER (WHERE status = 'active')::int AS active,
              count(*) FILTER (WHERE status = 'active' AND next_date <= $1::date)::int AS due
       FROM subscriptions`, [tomorrow]);
    const { rows: [p] } = await db.query(
      `SELECT count(*) FILTER (WHERE active)::int AS live, count(*) FILTER (WHERE NOT active)::int AS hidden,
              count(*) FILTER (WHERE active AND discount_pct > 0 AND (discount_until IS NULL OR discount_until > now()))::int AS on_sale
       FROM products`);
    res.json({
      newOrders: s.new_orders, todayDeliveries: s.today_deliveries, tomorrowDeliveries: s.tomorrow_deliveries,
      todayOrders: s.today_orders, todaySales: toQar(s.today_sales_cents),
      repeatActive: sub.active, repeatDue: sub.due,
      productsLive: p.live, productsHidden: p.hidden, productsOnSale: p.on_sale,
    });
  });

  /* ---------- Orders ---------- */
  r.get('/orders', async (req, res) => {
    const where = [];
    const params = [];
    const status = String(req.query.status || 'open');
    if (status === 'open') where.push(`o.status IN ('new', 'confirmed', 'out_for_delivery')`);
    else if (STATUSES.includes(status)) { params.push(status); where.push(`o.status = $${params.length}`); }
    const dayFilter = String(req.query.day || 'all');
    const today = qatarNow().date;
    if (dayFilter === 'today' || dayFilter === 'tomorrow') {
      params.push(dayFilter === 'today' ? today : addDays(today, 1));
      where.push(`o.slot_date = $${params.length}::date`);
    }
    if (req.query.repeat === '1') where.push('o.subscription_id IS NOT NULL');
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, m => '\\' + m)}%`);
      where.push(`(o.code ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR replace(o.phone, ' ', '') ILIKE replace($${params.length}, ' ', ''))`);
    }
    // New orders first; regular (repeat) customers ahead of one-off orders.
    const { rows } = await db.query(
      `${ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY (o.status = 'new') DESC, (o.subscription_id IS NOT NULL) DESC, o.slot_date, o.created_at DESC
       LIMIT 300`, params);
    res.json({ orders: rows.map(o => presentOrder(o)) });
  });

  r.patch('/orders/:id', async (req, res) => {
    const body = parse(z.object({
      status: z.enum(STATUSES).optional(),
      adminNote: text(500).optional(),
      riderName: text(60).optional(),
      riderPhone: text(24).optional(),
      riderLink: z.union([z.literal(''), z.string().trim().url().max(500).refine(u => /^https:\/\//.test(u), 'Use an https:// link')]).optional(),
    }), req.body);
    const { rows } = await db.query(
      `UPDATE orders SET status = coalesce($2, status), admin_note = coalesce($3, admin_note),
              rider_name = coalesce($4, rider_name), rider_phone = coalesce($5, rider_phone), rider_link = coalesce($6, rider_link),
              updated_at = now()
       WHERE id = $1 RETURNING id`,
      [Number(req.params.id), body.status ?? null, body.adminNote ?? null, body.riderName ?? null, body.riderPhone ?? null, body.riderLink ?? null]);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Order not found.' });
    res.json({ ok: true });
  });

  /* ---------- Repeat orders (subscriptions) ---------- */
  const SUB_SELECT = `
    SELECT s.*, to_char(s.next_date, 'YYYY-MM-DD') AS next_day,
           (SELECT count(*)::int FROM orders o WHERE o.subscription_id = s.id) AS order_count,
           (SELECT json_agg(json_build_object('name', i.name, 'unit', i.unit_label, 'qty', i.qty) ORDER BY i.id)
              FROM order_items i WHERE i.order_id = s.last_order_id) AS items_view
    FROM subscriptions s`;

  r.get('/subscriptions', async (req, res) => {
    const status = String(req.query.status || 'active');
    const params = [];
    let where = '';
    if (['active', 'paused', 'cancelled'].includes(status)) { params.push(status); where = 'WHERE s.status = $1'; }
    const { rows } = await db.query(`${SUB_SELECT} ${where} ORDER BY (s.status = 'active') DESC, s.next_date, s.id LIMIT 500`, params);
    const today = qatarNow().date;
    res.json({ subscriptions: rows.map(s => presentSubscription(s, today)) });
  });

  r.patch('/subscriptions/:id', async (req, res) => {
    const body = parse(z.object({
      status: z.enum(['active', 'paused', 'cancelled']).optional(),
      everyDays: z.number().int().min(3).max(90).optional(),
      nextDate: day.optional(),
      notes: text(500).optional(),
    }), req.body);
    const { rows } = await db.query(
      `UPDATE subscriptions SET status = coalesce($2, status), every_days = coalesce($3, every_days),
              next_date = coalesce($4::date, next_date), notes = coalesce($5, notes), updated_at = now()
       WHERE id = $1 RETURNING id`,
      [Number(req.params.id), body.status ?? null, body.everyDays ?? null, body.nextDate ?? null, body.notes ?? null]);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Repeat order not found.' });
    res.json({ ok: true });
  });

  // Make the next delivery: a new order with the same basket at today's prices.
  r.post('/subscriptions/:id/order', async (req, res) => {
    const body = parse(z.object({ date: day, window: text(40, 1) }), req.body);
    try {
      const { order, unavailable } = await createSubscriptionOrder(db, Number(req.params.id), body);
      res.status(201).json({ order, unavailable });
    } catch (err) {
      if (err instanceof OrderError) return res.status(err.status).json({ error: err.code, message: err.message });
      throw err;
    }
  });

  /* ---------- Categories (read-only for now) ---------- */
  r.get('/categories', async (req, res) => {
    const { rows } = await db.query('SELECT id, name FROM categories ORDER BY sort, name');
    res.json({ categories: rows });
  });

  /* ---------- Products ---------- */
  r.get('/products', async (req, res) => {
    const products = await loadProducts(db, { includeHidden: true });
    res.json({ products: products.map(presentAdminProduct) });
  });

  async function saveProduct(id, input, isNew) {
    const { rows: cat } = await db.query('SELECT 1 FROM categories WHERE id = $1', [input.cat]);
    if (!cat.length) throw new InputError({ cat: 'Choose a category' });
    for (const [i, u] of input.units.entries()) {
      if (u.was != null && u.was <= u.p) throw new InputError({ [`units.${i}.was`]: '"Was" price must be higher than the price' });
    }
    await db.tx(async q => {
      const vals = [input.name, input.cat, input.origin, input.badge, input.star, input.cut, input.img, input.wide,
        input.pack, input.taste, input.uses, input.discountPct, endOfQatarDay(input.discountUntil), input.active,
        input.nameAr, input.originAr, input.badgeAr, input.packAr, input.tasteAr, input.usesAr];
      if (isNew) {
        const { rows: [{ next }] } = await q.query('SELECT coalesce(max(sort), -1) + 1 AS next FROM products WHERE category_id = $1', [input.cat]);
        await q.query(
          `INSERT INTO products (name, category_id, origin, badge, star, cut, img, wide_img, pack, taste, uses, discount_pct, discount_until, active,
                                 name_ar, origin_ar, badge_ar, pack_ar, taste_ar, uses_ar, id, sort)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`, [...vals, id, next]);
      } else {
        const { rows } = await q.query(
          `UPDATE products SET name=$1, category_id=$2, origin=$3, badge=$4, star=$5, cut=$6, img=$7, wide_img=$8, pack=$9,
                  taste=$10, uses=$11, discount_pct=$12, discount_until=$13, active=$14,
                  name_ar=$15, origin_ar=$16, badge_ar=$17, pack_ar=$18, taste_ar=$19, uses_ar=$20, updated_at=now()
           WHERE id=$21 RETURNING id`, [...vals, id]);
        if (!rows.length) throw Object.assign(new Error('Product not found.'), { status: 404 });
      }
      // Keep pack-size ids stable so baskets that already contain them stay valid.
      const keep = input.units.filter(u => u.id).map(u => u.id);
      await q.query('DELETE FROM product_units WHERE product_id = $1 AND NOT (id = ANY($2::int[]))', [id, keep]);
      for (const [i, u] of input.units.entries()) {
        const args = [u.l, cents(u.p), u.was ? cents(u.was) : null, i, u.lAr];
        if (u.id) {
          const { rows } = await q.query(
            'UPDATE product_units SET label=$1, price_cents=$2, compare_cents=$3, sort=$4, label_ar=$5 WHERE id=$6 AND product_id=$7 RETURNING id',
            [...args, u.id, id]);
          if (rows.length) continue;
        }
        await q.query('INSERT INTO product_units (label, price_cents, compare_cents, sort, label_ar, product_id) VALUES ($1,$2,$3,$4,$5,$6)', [...args, id]);
      }
    });
    changed();
    const [p] = await loadProducts(db, { includeHidden: true, ids: [id] });
    return presentAdminProduct(p);
  }

  r.post('/products', async (req, res) => {
    const input = parse(ProductInput, req.body);
    const id = await uniqueId(db, 'products', slugify(input.name));
    res.status(201).json({ product: await saveProduct(id, input, true) });
  });

  r.put('/products/:id', async (req, res) => {
    const input = parse(ProductInput, req.body);
    res.json({ product: await saveProduct(req.params.id, input, false) });
  });

  // Quick actions from the list: show/hide, or set/clear a discount.
  r.patch('/products/:id', async (req, res) => {
    const body = parse(z.object({
      active: z.boolean().optional(),
      discountPct: z.number().int().min(0).max(90).optional(),
      discountUntil: day.nullable().optional(),
    }), req.body);
    const { rows } = await db.query(
      `UPDATE products SET active = coalesce($2, active), discount_pct = coalesce($3, discount_pct),
              discount_until = CASE WHEN $4::boolean THEN $5::timestamptz ELSE discount_until END, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [req.params.id, body.active ?? null, body.discountPct ?? null, body.discountUntil !== undefined, endOfQatarDay(body.discountUntil ?? null)]);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' });
    changed();
    const [p] = await loadProducts(db, { includeHidden: true, ids: [req.params.id] });
    res.json({ product: presentAdminProduct(p) });
  });

  r.delete('/products/:id', async (req, res) => {
    const { rows } = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' });
    changed();
    res.json({ ok: true });
  });

  /* ---------- Bundles ---------- */
  r.get('/bundles', async (req, res) => {
    res.json({ bundles: (await loadBundles(db, { includeHidden: true })).map(presentAdminBundle) });
  });

  async function saveBundle(id, b, isNew) {
    if (b.was != null && b.was <= b.price) throw new InputError({ was: '"Was" price must be higher than the price' });
    const vals = [b.name, b.size, b.serves, b.img, b.tag, cents(b.price), b.was ? cents(b.was) : null, b.active,
      b.nameAr, b.sizeAr, b.servesAr, b.tagAr, id];
    if (isNew) {
      await db.query(`INSERT INTO bundles (name, size, serves, img, tag, price_cents, compare_cents, active, name_ar, size_ar, serves_ar, tag_ar, id, sort)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, (SELECT coalesce(max(sort), -1) + 1 FROM bundles))`, vals);
    } else {
      const { rows } = await db.query(`UPDATE bundles SET name=$1, size=$2, serves=$3, img=$4, tag=$5, price_cents=$6,
                                        compare_cents=$7, active=$8, name_ar=$9, size_ar=$10, serves_ar=$11, tag_ar=$12, updated_at=now()
                                        WHERE id=$13 RETURNING id`, vals);
      if (!rows.length) throw Object.assign(new Error('Bundle not found.'), { status: 404 });
    }
    changed();
    const [row] = await loadBundles(db, { includeHidden: true, ids: [id] });
    return presentAdminBundle(row);
  }

  r.post('/bundles', async (req, res) => {
    const b = parse(BundleInput, req.body);
    const id = await uniqueId(db, 'bundles', 'box-' + slugify(b.name));
    res.status(201).json({ bundle: await saveBundle(id, b, true) });
  });
  r.put('/bundles/:id', async (req, res) => {
    res.json({ bundle: await saveBundle(req.params.id, parse(BundleInput, req.body), false) });
  });
  r.delete('/bundles/:id', async (req, res) => {
    const { rows } = await db.query('DELETE FROM bundles WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Bundle not found.' });
    changed();
    res.json({ ok: true });
  });

  /* ---------- Photos ---------- */
  r.post('/images', upload.single('photo'), async (req, res) => {
    if (!req.file) return res.status(422).json({ error: 'INVALID', message: 'Choose a JPG, PNG or WebP photo under 12 MB.' });
    try {
      res.status(201).json(await saveImage(db, req.file.buffer, { maxSize: req.query.wide ? 1800 : 1400 }));
    } catch {
      res.status(422).json({ error: 'INVALID', message: "That file couldn't be read as a photo. Try a JPG or PNG." });
    }
  });

  /* ---------- Settings ---------- */
  const presentSettings = s => ({
    deliveryFee: toQar(s.delivery_fee_cents), freeDelivery: toQar(s.free_delivery_cents), minOrder: toQar(s.min_order_cents),
    cutoffHour: s.cutoff_hour, slotsToday: s.slots_today, slotsTomorrow: s.slots_tomorrow,
    orderingOpen: s.ordering_open, closedMessage: s.closed_message, closedMessageAr: s.closed_message_ar,
    whatsapp: s.whatsapp, areas: s.areas, areasAr: s.areas_ar,
    zones: (s.delivery_zones || []).map(z => ({ name: z.name, lat: z.lat, lng: z.lng, radiusKm: z.radius_km })),
    popular: s.popular_searches, popularAr: s.popular_searches_ar,
    deliveryHours: s.delivery_hours, deliveryHoursAr: s.delivery_hours_ar,
  });
  r.get('/settings', async (req, res) => res.json({ settings: presentSettings(await loadSettings(db)) }));
  r.put('/settings', async (req, res) => {
    const input = parse(SettingsInput, req.body);
    await db.tx(async q => {
      for (const [k, v] of Object.entries(input)) {
        const [key, conv] = SETTINGS_MAP[k];
        await q.query(`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
                       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(conv ? conv(v) : v)]);
      }
    });
    changed();
    res.json({ settings: presentSettings(await loadSettings(db)) });
  });

  /* ---------- Own password ---------- */
  r.post('/password', async (req, res) => {
    const { current, next } = parse(z.object({ current: z.string().max(200), next: z.string().max(200) }), req.body);
    const { rows: [admin] } = await db.query('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
    if (!(await bcrypt.compare(current, admin.password_hash))) throw new InputError({ current: 'Current password is wrong' });
    const problem = passwordProblem(next);
    if (problem) throw new InputError({ next: problem });
    const { rows: [updated] } = await db.query(
      `UPDATE admins SET password_hash = $2, session_version = session_version + 1 WHERE id = $1 RETURNING *`,
      [admin.id, await hashPassword(next)]);
    await auth.issue(res, updated); // stay signed in here; every other device is signed out
    res.json({ ok: true });
  });

  // Validation and not-found errors become friendly JSON.
  r.use((err, req, res, next) => {
    if (err instanceof InputError) return res.status(422).json({ error: 'INVALID', message: err.message, fields: err.fields });
    if (err.status === 404) return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    if (err.name === 'MulterError') return res.status(422).json({ error: 'INVALID', message: 'Choose one photo under 12 MB.' });
    if (err.code === '23503') return res.status(409).json({ error: 'IN_USE', message: 'This item is still linked to something else.' });
    next(err);
  });

  return r;
}
