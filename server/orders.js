// Order placement. The browser only says WHAT it wants (item, pack size, qty);
// every price and total is recomputed here from the database.
import crypto from 'node:crypto';
import { z } from 'zod';
import { loadSettings, loadProducts, loadBundles, unitPrice, bundleUnits, toQar } from './catalog.js';
import { availableSlots, slotLabel, addDays, qatarNow } from './time.js';
import { zoneFor, inQatar } from './geo.js';

export class OrderError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

const text = (max, min = 0) => z.string().trim().min(min).max(max);

const ItemInput = z.object({
  id: text(80, 1),
  unit: z.union([z.number().int().positive(), z.literal('once')]),
  qty: z.number().int().min(1).max(99),
});

const OrderInput = z.object({
  idempotencyKey: z.string().uuid(),
  items: z.array(ItemInput).min(1, 'Your basket is empty').max(60),
  slot: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), window: text(40, 1) }),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), label: text(200).default('') }).optional(),
  customer: z.object({
    name: text(80, 2),
    phone: text(24, 1),
    area: text(60, 2),
    zone: text(10).default(''),
    street: text(10).default(''),
    building: text(10).default(''),
    details: text(300).default(''),
  }),
  payment: z.enum(['cash', 'card', 'transfer']),
  repeatEvery: z.number().int().refine(n => n === 0 || (n >= 3 && n <= 90)).default(0),
  notes: text(500).default(''),
  lang: z.enum(['en', 'ar']).default('en'),
  expectedTotal: z.number().nonnegative().optional(),
  website: z.string().max(200).optional(), // honeypot: real people never fill this in
});

const MESSAGES = {
  en: {
    'customer.name': 'Please enter your name.',
    'customer.phone': 'Please enter a Qatar mobile number.',
    'customer.area': 'Please choose your area.',
    'customer.zone': 'Zone number is too long.',
    'customer.street': 'Street number is too long.',
    'customer.building': 'Building number is too long.',
    payment: 'Please choose how you will pay the rider.',
    'slot.date': 'Please choose a delivery slot.',
    'slot.window': 'Please choose a delivery slot.',
    items: 'Your basket is empty.',
    location: 'Please set your delivery location on the map.',
    repeatEvery: 'Choose a repeat between 3 and 90 days.',
    invalid: 'Please check the highlighted details.',
    outOfArea: "Sorry, we don't deliver to that location yet. Choose another location, or message us on WhatsApp.",
  },
  ar: {
    'customer.name': 'يرجى إدخال اسمك.',
    'customer.phone': 'يرجى إدخال رقم جوال قطري.',
    'customer.area': 'يرجى اختيار الحي.',
    'customer.zone': 'رقم المنطقة طويل جدًا.',
    'customer.street': 'رقم الشارع طويل جدًا.',
    'customer.building': 'رقم المبنى طويل جدًا.',
    payment: 'يرجى اختيار طريقة الدفع للمندوب.',
    'slot.date': 'يرجى اختيار موعد التوصيل.',
    'slot.window': 'يرجى اختيار موعد التوصيل.',
    items: 'سلتك فارغة.',
    location: 'يرجى تحديد موقع التوصيل على الخريطة.',
    repeatEvery: 'اختر تكرارًا بين 3 و90 يومًا.',
    invalid: 'يرجى مراجعة البيانات المحددة.',
    outOfArea: 'عذرًا، لا نوصّل إلى هذا الموقع حاليًا. اختر موقعًا آخر أو راسلنا على واتساب.',
  },
};
const ERRORS = {
  en: {
    paused: null,
    slot: 'That delivery slot is no longer available. Please pick another one.',
    unavailable: 'Some items in your basket are no longer available. We have updated your basket.',
    minimum: amount => `The minimum order is QAR ${amount}.`,
    prices: 'Some prices have changed since you opened the page. Please check your basket total.',
    tooMany: 'Too many orders in a short time. Please wait a few minutes or message us on WhatsApp.',
    retry: 'Please check your details and try again.',
  },
  ar: {
    paused: null,
    slot: 'هذا الموعد لم يعد متاحًا. يرجى اختيار موعد آخر.',
    unavailable: 'بعض المنتجات في سلتك لم تعد متوفرة، وقد حدّثنا سلتك.',
    minimum: amount => `الحد الأدنى للطلب ${amount} ر.ق.`,
    prices: 'تغيّرت بعض الأسعار منذ فتح الصفحة. يرجى مراجعة إجمالي السلة.',
    tooMany: 'طلبات كثيرة خلال وقت قصير. يرجى الانتظار بضع دقائق أو مراسلتنا على واتساب.',
    retry: 'يرجى مراجعة بياناتك والمحاولة مرة أخرى.',
  },
};

// Qatar mobile numbers: 8 digits starting 3, 5, 6 or 7, with or without +974.
export function normalizeQatarPhone(input) {
  let d = String(input).replace(/[^\d]/g, '');
  if (d.startsWith('00974')) d = d.slice(5);
  else if (d.startsWith('974') && d.length === 11) d = d.slice(3);
  if (!/^[3567]\d{7}$/.test(d)) return null;
  return `+974 ${d.slice(0, 4)} ${d.slice(4)}`;
}

export function parseOrder(body) {
  const lang = body?.lang === 'ar' ? 'ar' : 'en';
  const msg = MESSAGES[lang];
  const r = OrderInput.safeParse(body);
  if (!r.success) {
    const fields = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join('.');
      const top = issue.path.slice(0, 2).join('.');
      const k = msg[key] ? key : msg[top] ? top : issue.path[0];
      fields[k] ??= msg[k] || issue.message;
    }
    throw new OrderError(422, 'INVALID', msg.invalid, { fields });
  }
  const data = r.data;
  const phone = normalizeQatarPhone(data.customer.phone);
  if (!phone) throw new OrderError(422, 'INVALID', msg.invalid, { fields: { 'customer.phone': msg['customer.phone'] } });
  data.customer.phone = phone;
  return data;
}

// Merge repeated lines and price everything from the database.
async function priceItems(db, items, now) {
  const merged = new Map();
  for (const it of items) {
    const key = `${it.id}|${it.unit}`;
    const prev = merged.get(key);
    merged.set(key, { ...it, qty: Math.min(99, (prev?.qty || 0) + it.qty) });
  }
  const lines = [...merged.values()];
  const productIds = lines.filter(l => typeof l.unit === 'number').map(l => l.id);
  const bundleIds = lines.filter(l => typeof l.unit === 'string').map(l => l.id);
  const products = new Map((productIds.length ? await loadProducts(db, { ids: productIds }) : []).map(p => [p.id, p]));
  const bundles = new Map((bundleIds.length ? await loadBundles(db, { ids: bundleIds }) : []).map(b => [b.id, b]));

  const priced = [];
  const unavailable = [];
  for (const l of lines) {
    if (typeof l.unit === 'number') {
      const p = products.get(l.id);
      const u = p?.units.find(x => x.id === l.unit);
      if (!u) { unavailable.push(l.id); continue; }
      const { cents, compare } = unitPrice(p, u, now);
      priced.push({ kind: 'product', item_id: p.id, unit_ref: u.id, name: p.name, unit_label: u.label, unit_cents: cents, compare_cents: compare, qty: l.qty, line_cents: cents * l.qty });
    } else {
      const b = bundles.get(l.id);
      const u = b && bundleUnits(b).find(x => x.id === l.unit);
      if (!u) { unavailable.push(l.id); continue; }
      priced.push({ kind: 'bundle', item_id: b.id, unit_ref: u.id, name: b.name, unit_label: u.label, unit_cents: u.cents, compare_cents: u.compare, qty: l.qty, line_cents: u.cents * l.qty });
    }
  }
  return { priced, unavailable };
}

export function deliveryFor(subtotal, settings) {
  return subtotal === 0 || subtotal >= settings.free_delivery_cents ? 0 : settings.delivery_fee_cents;
}

const newToken = () => crypto.randomBytes(18).toString('base64url');

async function insertOrder(q, o) {
  const { rows } = await q.query(
    `INSERT INTO orders (code, idempotency_key, customer_name, phone, area, zone, street, building, address_notes,
                         slot_date, slot_window, payment_method, notes, subtotal_cents, delivery_cents, total_cents, ip_hash,
                         lat, lng, location_label, repeat_every_days, subscription_id, track_token, lang)
     VALUES ('EF-' || nextval('order_number_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22, $23)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [o.key, o.name, o.phone, o.area, o.zone, o.street, o.building, o.details, o.date, o.window, o.payment, o.notes,
      o.subtotal, o.delivery, o.total, o.ipHash, o.lat, o.lng, o.label, o.repeatEvery || null, o.subscriptionId || null, newToken(), o.lang]);
  if (!rows.length) return null;
  for (const l of o.priced) {
    await q.query(
      `INSERT INTO order_items (order_id, kind, item_id, name, unit_label, unit_cents, compare_cents, qty, line_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [rows[0].id, l.kind, l.item_id, l.name, l.unit_label, l.unit_cents, l.compare_cents, l.qty, l.line_cents]);
  }
  return rows[0].id;
}

export async function placeOrder(db, body, { ip = '', secret = '', rateLimit = 8, now = new Date() } = {}) {
  const input = parseOrder(body);
  const err = ERRORS[input.lang];
  const msg = MESSAGES[input.lang];
  if (input.website) throw new OrderError(422, 'INVALID', err.retry);

  // A retry of an order we already have (double tap, flaky network) gets the same order back.
  const existing = await findByKey(db, input.idempotencyKey);
  if (existing) return { order: existing, duplicate: true };

  const settings = await loadSettings(db);
  if (!settings.ordering_open) {
    throw new OrderError(503, 'ORDERING_PAUSED', (input.lang === 'ar' && settings.closed_message_ar) || settings.closed_message);
  }

  if (!input.location) throw new OrderError(422, 'INVALID', msg.invalid, { fields: { location: msg.location } });
  if (!inQatar(input.location) || !zoneFor(input.location, settings.delivery_zones)) {
    throw new OrderError(422, 'OUT_OF_AREA', msg.outOfArea, { fields: { location: msg.outOfArea } });
  }

  const slot = availableSlots(settings, now).find(s => s.date === input.slot.date && s.window === input.slot.window);
  if (!slot || !slot.open) throw new OrderError(409, 'SLOT_CLOSED', err.slot);

  const { priced, unavailable } = await priceItems(db, input.items, now);
  if (unavailable.length) throw new OrderError(409, 'ITEMS_UNAVAILABLE', err.unavailable, { unavailable });
  const subtotal = priced.reduce((s, l) => s + l.line_cents, 0);
  if (subtotal < settings.min_order_cents) {
    throw new OrderError(422, 'BELOW_MINIMUM', err.minimum(toQar(settings.min_order_cents).toFixed(2)));
  }
  const delivery = deliveryFor(subtotal, settings);
  const total = subtotal + delivery;
  if (input.expectedTotal != null && Math.round(input.expectedTotal * 100) !== total) {
    throw new OrderError(409, 'PRICES_CHANGED', err.prices, { total: toQar(total) });
  }

  const ipHash = ip ? crypto.createHash('sha256').update(secret + ip).digest('hex').slice(0, 32) : null;
  if (ipHash && rateLimit > 0) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM orders WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'`, [ipHash]);
    if (rows[0].n >= rateLimit) throw new OrderError(429, 'TOO_MANY', err.tooMany);
  }

  const c = input.customer;
  const created = await db.tx(async q => {
    const orderId = await insertOrder(q, {
      key: input.idempotencyKey, name: c.name, phone: c.phone, area: c.area, zone: c.zone, street: c.street, building: c.building,
      details: c.details, date: slot.date, window: slot.window, payment: input.payment, notes: input.notes,
      subtotal, delivery, total, ipHash, lat: input.location.lat, lng: input.location.lng, label: input.location.label,
      repeatEvery: input.repeatEvery, lang: input.lang, priced,
    });
    if (!orderId) return null; // the same order was committed by a parallel request
    if (input.repeatEvery) {
      const items = priced.map(l => ({ id: l.item_id, unit: l.unit_ref, qty: l.qty }));
      const { rows } = await q.query(
        `INSERT INTO subscriptions (every_days, next_date, customer_name, phone, area, zone, street, building, address_notes,
                                    lat, lng, slot_window, payment_method, items, notes, lang, first_order_id, last_order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $17) RETURNING id`,
        [input.repeatEvery, addDays(slot.date, input.repeatEvery), c.name, c.phone, c.area, c.zone, c.street, c.building, c.details,
          input.location.lat, input.location.lng, slot.window, input.payment, JSON.stringify(items), input.notes, input.lang, orderId]);
      await q.query('UPDATE orders SET subscription_id = $2 WHERE id = $1', [orderId, rows[0].id]);
    }
    return orderId;
  });

  const order = await findByKey(db, input.idempotencyKey);
  return { order, duplicate: created == null };
}

// Staff create the next delivery of a repeat order from the admin panel.
export async function createSubscriptionOrder(db, subId, { date, window }) {
  const { rows: [sub] } = await db.query('SELECT * FROM subscriptions WHERE id = $1', [subId]);
  if (!sub) throw new OrderError(404, 'NOT_FOUND', 'Repeat order not found.');
  const settings = await loadSettings(db);
  const { priced, unavailable } = await priceItems(db, sub.items);
  if (!priced.length) throw new OrderError(409, 'ITEMS_UNAVAILABLE', 'None of the items in this repeat order are in the shop any more.');
  const subtotal = priced.reduce((s, l) => s + l.line_cents, 0);
  const delivery = deliveryFor(subtotal, settings);
  const orderId = await db.tx(async q => {
    const id = await insertOrder(q, {
      key: crypto.randomUUID(), name: sub.customer_name, phone: sub.phone, area: sub.area, zone: sub.zone, street: sub.street,
      building: sub.building, details: sub.address_notes, date, window: window || sub.slot_window, payment: sub.payment_method,
      notes: sub.notes, subtotal, delivery, total: subtotal + delivery, ipHash: null, lat: sub.lat, lng: sub.lng, label: '',
      repeatEvery: sub.every_days, subscriptionId: sub.id, lang: sub.lang, priced,
    });
    await q.query(`UPDATE subscriptions SET next_date = $2::date + every_days, last_order_id = $3, updated_at = now() WHERE id = $1`,
      [sub.id, date, id]);
    return id;
  });
  return { order: await getOrder(db, orderId), unavailable };
}

async function findByKey(db, key) {
  const { rows } = await db.query('SELECT id FROM orders WHERE idempotency_key = $1', [key]);
  return rows.length ? getOrder(db, rows[0].id) : null;
}

export const ORDER_SELECT = `
  SELECT o.*, to_char(o.slot_date, 'YYYY-MM-DD') AS slot_day,
         s.every_days AS sub_every, s.status AS sub_status, to_char(s.next_date, 'YYYY-MM-DD') AS sub_next,
         coalesce((SELECT json_agg(i ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id), '[]') AS items
  FROM orders o LEFT JOIN subscriptions s ON s.id = o.subscription_id`;

export async function getOrder(db, id) {
  const { rows } = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  return rows.length ? presentOrder(rows[0]) : null;
}

// Full order (admin view). publicOrder() trims it for customers.
export function presentOrder(o, now = new Date()) {
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    lang: o.lang,
    customer: { name: o.customer_name, phone: o.phone, area: o.area, zone: o.zone, street: o.street, building: o.building, details: o.address_notes },
    location: o.lat != null ? { lat: o.lat, lng: o.lng, label: o.location_label } : null,
    slot: { date: o.slot_day, window: o.slot_window, label: slotLabel(o.slot_day, o.slot_window, now) },
    payment: o.payment_method,
    notes: o.notes,
    items: o.items.map(i => ({ kind: i.kind, id: i.item_id, name: i.name, unit: i.unit_label, price: toQar(i.unit_cents), was: i.compare_cents ? toQar(i.compare_cents) : null, qty: i.qty, total: toQar(i.line_cents) })),
    subtotal: toQar(o.subtotal_cents),
    delivery: toQar(o.delivery_cents),
    total: toQar(o.total_cents),
    repeat: o.subscription_id ? { id: o.subscription_id, everyDays: o.sub_every, status: o.sub_status, nextDate: o.sub_next } : null,
    rider: { name: o.rider_name, phone: o.rider_phone, link: o.rider_link },
    track: o.track_token,
    adminNote: o.admin_note,
  };
}

// What a customer may see about their own order.
export function publicOrder(o) {
  const showRider = ['out_for_delivery', 'delivered'].includes(o.status);
  return {
    code: o.code, status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt,
    customer: o.customer, slot: o.slot, payment: o.payment, items: o.items,
    subtotal: o.subtotal, delivery: o.delivery, total: o.total,
    repeatEvery: o.repeat?.everyDays || null,
    rider: showRider && (o.rider.name || o.rider.phone || o.rider.link) ? o.rider : null,
    track: o.track,
  };
}

// Tracking-page lookup: order number + the phone it was placed with.
export async function findForTracking(db, code, phone) {
  const p = normalizeQatarPhone(phone);
  if (!p) return null;
  const { rows } = await db.query('SELECT id FROM orders WHERE upper(code) = upper($1) AND phone = $2', [code.trim(), p]);
  return rows.length ? getOrder(db, rows[0].id) : null;
}

export async function findByToken(db, code, token) {
  if (!token || token.length < 16) return null;
  const { rows } = await db.query('SELECT id FROM orders WHERE upper(code) = upper($1) AND track_token = $2', [code.trim(), token]);
  return rows.length ? getOrder(db, rows[0].id) : null;
}

export const todayQatar = () => qatarNow().date;
