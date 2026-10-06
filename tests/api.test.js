// API tests against a fresh in-memory Postgres (PGlite). Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createDb } from '../server/db.js';
import { seed } from '../server/seed/index.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { normalizeQatarPhone } from '../server/orders.js';
import { extractKeys, loadDict, PAGES } from '../server/i18n.js';

process.env.GEOCODER = 'off'; // never call OpenStreetMap from tests

let db, server, base;
const ADMIN = { email: 'staff@edenfarm.qa', password: 'correct horse battery' };
const WEST_BAY = { lat: 25.3226, lng: 51.5303, label: 'West Bay, Doha' };
const AL_KHOR = { lat: 25.6839, lng: 51.5058 }; // ~44 km north: outside the default area

before(async () => {
  db = await createDb({ memory: true });
  await seed(db);
  await db.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2)', [ADMIN.email, await hashPassword(ADMIN.password)]);
  // Keep same-day slots open whatever time the tests run.
  await db.query(`UPDATE settings SET value = '24'::jsonb WHERE key = 'cutoff_hour'`);
  const app = createApp({ db, sessionSecret: 'x'.repeat(40), orderRateLimit: 0 });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

const call = async (method, path, body, headers = {}) => {
  const res = await fetch(base + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json, text, headers: res.headers };
};
const catalog = async (lang = 'en') => (await call('GET', `/api/catalog?lang=${lang}`)).body;
const loginCookie = async () => {
  const r = await call('POST', '/api/admin/login', ADMIN);
  assert.equal(r.status, 200);
  return { Cookie: r.headers.get('set-cookie').split(';')[0] };
};
const orderBody = async (over = {}) => {
  const c = await catalog();
  const p = c.products.find(x => x.id === 'mush-white');
  const slot = c.settings.slots.find(s => s.open);
  const subtotal = p.units[1].p * 2;
  return {
    idempotencyKey: crypto.randomUUID(),
    items: [{ id: p.id, unit: p.units[1].id, qty: 2 }],
    slot: { date: slot.date, window: slot.window },
    location: WEST_BAY,
    customer: { name: 'Noor Test', phone: '+974 5512 3456', area: 'West Bay', zone: '61', street: '850', building: '12' },
    payment: 'card',
    expectedTotal: subtotal + (subtotal >= c.settings.freeDelivery ? 0 : c.settings.deliveryFee),
    ...over,
  };
};

test('catalogue serves the seeded shop', async () => {
  const c = await catalog();
  assert.equal(c.products.length, 14);
  assert.equal(c.boxes.length, 3);
  assert.ok(c.products.every(p => p.units.every(u => Number.isInteger(u.id) && u.p > 0)));
  assert.deepEqual(c.boxes[0].units.map(u => u.id), ['once']);
  assert.ok(c.settings.zones.length && c.settings.popular.length && c.settings.deliveryHours);
});

test('Arabic catalogue uses Arabic names, with English as fallback', async () => {
  const c = await catalog('ar');
  assert.equal(c.lang, 'ar');
  assert.equal(c.products.find(p => p.id === 'mush-white').name, 'فطر الزر الأبيض');
  assert.equal(c.products.find(p => p.id === 'peppers').units[0].l, '500 غ');
  assert.equal(c.categories.find(x => x.id === 'honey').name, 'عسل المزرعة');
  assert.ok(Object.keys(c.t).length > 50, 'UI strings are sent to the page');
});

test('storefront, help and Arabic pages are served', async () => {
  for (const page of ['/', '/about.html', '/faq.html', '/refund.html', '/terms.html', '/privacy.html', '/track.html', '/faq']) {
    assert.equal((await call('GET', page)).status, 200, page);
  }
  for (const page of ['/ar/', '/ar/about.html', '/ar/faq.html', '/ar/track.html', '/ar/terms.html']) {
    const r = await call('GET', page);
    assert.equal(r.status, 200, page);
    assert.match(r.text, /<html lang="ar" dir="rtl">/);
    assert.match(r.text, /\/api\/catalog\.js\?lang=ar/);
    assert.match(r.text, /class="lang lang-switch" href="\/[a-z.]*" lang="en">English</);
  }
  const ar404 = await call('GET', '/ar/nope');
  assert.equal(ar404.status, 404);
  assert.match(ar404.text, /dir="rtl"/);
  assert.equal((await call('POST', '/api/newsletter', { email: 'a@b.qa' })).status, 404, 'newsletter removed');
});

test('every English text on the site has an Arabic translation', () => {
  const dict = loadDict();
  const missing = [];
  for (const f of [...PAGES.map(p => `${p}.html`), 'server/404.html']) {
    for (const k of extractKeys(fs.readFileSync(f, 'utf8'))) if (!dict.pages[k]) missing.push(`${f}: ${k}`);
  }
  for (const f of ['js/app.js', 'js/site.js', 'js/track.js']) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      const key = m[2].replace(/\\(.)/g, '$1');
      if (!dict.ui[key]) missing.push(`${f}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('qatar phone numbers are normalised', () => {
  assert.equal(normalizeQatarPhone('55123456'), '+974 5512 3456');
  assert.equal(normalizeQatarPhone('+974 6643-1863'), '+974 6643 1863');
  assert.equal(normalizeQatarPhone('0097433001122'), '+974 3300 1122');
  assert.equal(normalizeQatarPhone('12345678'), null);
  assert.equal(normalizeQatarPhone('5512345'), null);
});

test('order is priced by the server, not the browser', async () => {
  const r = await call('POST', '/api/orders', await orderBody());
  assert.equal(r.status, 201, r.text);
  assert.match(r.body.order.code, /^EF-\d+$/);
  assert.equal(r.body.order.items[0].total, 26); // 2 × "2 packs" at QAR 13
  assert.equal(r.body.order.total, 26 + 15);
  assert.equal(r.body.order.customer.phone, '+974 5512 3456');
  assert.ok(r.body.order.track.length >= 16, 'customer gets a private tracking link');
  assert.equal(r.body.order.adminNote, undefined, 'staff notes never go to customers');
  const { rows } = await db.query('SELECT lat, lng FROM orders WHERE code = $1', [r.body.order.code]);
  assert.deepEqual(rows[0], { lat: WEST_BAY.lat, lng: WEST_BAY.lng });
});

test('orders need a delivery pin inside a delivery area', async () => {
  let r = await call('POST', '/api/orders', await orderBody({ location: undefined }));
  assert.equal(r.status, 422);
  assert.ok(r.body.fields.location);
  r = await call('POST', '/api/orders', await orderBody({ location: AL_KHOR }));
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'OUT_OF_AREA');
  r = await call('POST', '/api/orders', await orderBody({ location: AL_KHOR, lang: 'ar' }));
  assert.match(r.body.message, /لا نوصّل/);
});

test('a tampered total is rejected with fresh prices', async () => {
  const r = await call('POST', '/api/orders', await orderBody({ expectedTotal: 1 }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'PRICES_CHANGED');
  assert.ok(r.body.catalog.products.length);
});

test('the same order sent twice is stored once', async () => {
  const body = await orderBody();
  const [a, b] = await Promise.all([call('POST', '/api/orders', body), call('POST', '/api/orders', body)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.body.order.code, b.body.order.code);
  const { rows } = await db.query('SELECT count(*)::int AS n FROM orders WHERE idempotency_key = $1', [body.idempotencyKey]);
  assert.equal(rows[0].n, 1);
});

test('50 customers ordering at once all get their own order', async () => {
  const bodies = await Promise.all(Array.from({ length: 50 }, () => orderBody()));
  const results = await Promise.all(bodies.map(b => call('POST', '/api/orders', b)));
  assert.ok(results.every(r => r.status === 201), results.map(r => r.status).join(','));
  assert.equal(new Set(results.map(r => r.body.order.code)).size, 50);
});

test('invalid details come back field by field', async () => {
  const r = await call('POST', '/api/orders', await orderBody({ customer: { name: 'A', phone: '123', area: '' } }));
  assert.equal(r.status, 422);
  assert.ok(r.body.fields['customer.name']);
  assert.ok(r.body.fields['customer.area']);
  const bad = await call('POST', '/api/orders', await orderBody({ repeatEvery: 2 }));
  assert.equal(bad.status, 422);
  assert.ok(bad.body.fields.repeatEvery);
});

test('unknown items and closed slots are refused', async () => {
  let r = await call('POST', '/api/orders', await orderBody({ items: [{ id: 'mush-white', unit: 999999, qty: 1 }] }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'ITEMS_UNAVAILABLE');
  r = await call('POST', '/api/orders', await orderBody({ slot: { date: '2020-01-01', window: '4 – 7 pm' } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'SLOT_CLOSED');
});

test('repeat orders: customer chooses the interval, staff create the next delivery', async () => {
  const c = await catalog();
  const box = c.boxes.find(b => b.id === 'box-trio');
  const body = await orderBody({ repeatEvery: 10 });
  body.items.push({ id: box.id, unit: 'once', qty: 1 });
  body.expectedTotal = 26 + box.price + ((26 + box.price) >= c.settings.freeDelivery ? 0 : c.settings.deliveryFee);
  const r = await call('POST', '/api/orders', body);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.order.repeatEvery, 10);

  const h = await loginCookie();
  const list = await call('GET', '/api/admin/orders?status=new&repeat=1', null, h);
  const first = list.body.orders.find(o => o.code === r.body.order.code);
  assert.equal(first.repeat.everyDays, 10, 'order is marked as a regular customer');

  const subs = await call('GET', '/api/admin/subscriptions', null, h);
  const sub = subs.body.subscriptions.find(s => s.id === first.repeat.id);
  assert.equal(sub.items.length, 2);
  const firstDate = first.slot.date;
  const d = new Date(firstDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 10);
  assert.equal(sub.nextDate, d.toISOString().slice(0, 10));

  const made = await call('POST', `/api/admin/subscriptions/${sub.id}/order`, { date: sub.nextDate, window: sub.window }, h);
  assert.equal(made.status, 201, made.text);
  assert.equal(made.body.order.status, 'new');
  assert.equal(made.body.order.repeat.id, sub.id);
  assert.equal(made.body.order.total, r.body.order.total, 'same basket at the same prices');
  const after = (await call('GET', '/api/admin/subscriptions', null, h)).body.subscriptions.find(s => s.id === sub.id);
  d.setUTCDate(d.getUTCDate() + 10);
  assert.equal(after.nextDate, d.toISOString().slice(0, 10), 'next date moves on by the interval');
  assert.equal(after.orders, 2);

  assert.equal((await call('PATCH', `/api/admin/subscriptions/${sub.id}`, { status: 'paused' }, h)).status, 200);
  const summary = await call('GET', '/api/admin/summary', null, h);
  assert.ok('repeatDue' in summary.body && 'repeatActive' in summary.body);
});

test('tracking: private link, phone lookup, rider shown once out for delivery', async () => {
  const placed = await call('POST', '/api/orders', await orderBody());
  const { code, track } = placed.body.order;
  let r = await call('GET', `/api/track/${code}?k=${track}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.order.status, 'new');
  assert.equal(r.body.order.rider, null);
  assert.equal((await call('GET', `/api/track/${code}?k=wrong-token-123456`)).status, 404);

  const look = await call('POST', '/api/track/lookup', { code: code.toLowerCase(), phone: '55123456' });
  assert.equal(look.status, 200);
  assert.equal(look.body.token, track);
  assert.equal((await call('POST', '/api/track/lookup', { code, phone: '66666666' })).status, 404);

  const h = await loginCookie();
  const id = (await call('GET', `/api/admin/orders?status=all&q=${code}`, null, h)).body.orders[0].id;
  assert.equal((await call('PATCH', `/api/admin/orders/${id}`, { riderLink: 'javascript:alert(1)' }, h)).status, 422);
  await call('PATCH', `/api/admin/orders/${id}`, { riderName: 'Ahmed', riderPhone: '33001122', riderLink: 'https://maps.app.goo.gl/abc' }, h);
  r = await call('GET', `/api/track/${code}?k=${track}`);
  assert.equal(r.body.order.rider, null, 'rider hidden until the order leaves');
  await call('PATCH', `/api/admin/orders/${id}`, { status: 'out_for_delivery' }, h);
  r = await call('GET', `/api/track/${code}?k=${track}`);
  assert.deepEqual(r.body.order.rider, { name: 'Ahmed', phone: '33001122', link: 'https://maps.app.goo.gl/abc' });
});

test('map lookups answer without the geocoder', async () => {
  assert.equal((await call('GET', '/api/geo/reverse?lat=25.3&lng=51.5')).status, 200);
  assert.equal((await call('GET', '/api/geo/reverse?lat=abc&lng=51.5')).status, 422);
  assert.deepEqual((await call('GET', '/api/geo/search?q=pearl')).body, { results: [] });
});

test('admin area is closed to customers', async () => {
  assert.equal((await call('GET', '/admin')).status, 302);
  assert.equal((await call('GET', '/admin/app.js')).status, 302);
  assert.equal((await call('GET', '/api/admin/orders')).status, 401);
  assert.equal((await call('GET', '/api/admin/subscriptions')).status, 401);
  assert.equal((await call('POST', '/api/admin/products', { name: 'x' })).status, 401);
  assert.equal((await call('GET', '/api/admin/orders', null, { Cookie: 'eden_admin=forged.token.value' })).status, 401);
  const bad = await call('POST', '/api/admin/login', { email: ADMIN.email, password: 'wrong password!' });
  assert.equal(bad.status, 401);
  assert.equal((await call('GET', '/server/app.js')).status, 404);
  assert.equal((await call('GET', '/package.json')).status, 404);
  assert.equal((await call('GET', '/i18n/ar.json')).status, 404);
});

test('admin adds a product with Arabic text and a discount, and the shop shows it', async () => {
  const h = await loginCookie();
  const r = await call('POST', '/api/admin/products', {
    name: 'Oyster Mushrooms', nameAr: 'فطر المحار', cat: 'mushrooms', img: '/assets/img/eden/mush-brown.webp', badge: 'New',
    discountPct: 20, units: [{ l: '200 g', p: 10 }, { l: '400 g', lAr: '400 غرام', p: 18 }],
  }, h);
  assert.equal(r.status, 201, r.text);
  const c = await catalog();
  const p = c.products.find(x => x.id === 'oyster-mushrooms');
  assert.ok(p, 'new product is in the shop');
  assert.deepEqual(p.units.map(u => [u.p, u.was]), [[8, 10], [14.4, 18]]);
  const ar = (await catalog('ar')).products.find(x => x.id === 'oyster-mushrooms');
  assert.equal(ar.name, 'فطر المحار');
  assert.deepEqual(ar.units.map(u => u.l), ['200 غ', '400 غرام']);

  // Orders use the discounted price.
  const slot = c.settings.slots.find(s => s.open);
  const o = await call('POST', '/api/orders', {
    idempotencyKey: crypto.randomUUID(), items: [{ id: p.id, unit: p.units[0].id, qty: 1 }], location: WEST_BAY,
    slot: { date: slot.date, window: slot.window }, customer: { name: 'Sara', phone: '66431863', area: 'Lusail' }, payment: 'cash',
  });
  assert.equal(o.status, 201, o.text);
  assert.equal(o.body.order.items[0].price, 8);

  // Hide it: gone from the shop, still listed for admins.
  assert.equal((await call('PATCH', '/api/admin/products/oyster-mushrooms', { active: false }, h)).status, 200);
  assert.ok(!(await catalog()).products.some(x => x.id === 'oyster-mushrooms'));
  const all = await call('GET', '/api/admin/products', null, h);
  assert.ok(all.body.products.some(x => x.id === 'oyster-mushrooms' && !x.active));

  // Delete it: past orders keep their snapshot.
  assert.equal((await call('DELETE', '/api/admin/products/oyster-mushrooms', null, h)).status, 200);
  const { rows } = await db.query(`SELECT name, unit_cents FROM order_items WHERE item_id = 'oyster-mushrooms'`);
  assert.deepEqual(rows, [{ name: 'Oyster Mushrooms', unit_cents: 800 }]);
});

test('editing prices keeps pack ids, so baskets stay valid', async () => {
  const h = await loginCookie();
  const before = (await call('GET', '/api/admin/products', null, h)).body.products.find(p => p.id === 'corn');
  const units = before.units.map(u => ({ ...u, p: u.p + 1 }));
  const r = await call('PUT', '/api/admin/products/corn', { ...before, units }, h);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.product.units.map(u => u.id), before.units.map(u => u.id));
  assert.deepEqual(r.body.product.units.map(u => u.p), before.units.map(u => u.p + 1));
  assert.equal(r.body.product.nameAr, 'ذرة حلوة', 'Arabic name survives an edit');
});

test('admin validation returns readable field errors', async () => {
  const h = await loginCookie();
  const r = await call('POST', '/api/admin/products', { name: '', cat: 'mushrooms', img: 'javascript:alert(1)', units: [] }, h);
  assert.equal(r.status, 422);
  assert.ok(r.body.fields.name && r.body.fields.img && r.body.fields.units);
});

test('settings: delivery areas, popular searches and hours reach the shop', async () => {
  const h = await loginCookie();
  let r = await call('PUT', '/api/admin/settings', { zones: [{ name: 'Mars', lat: 10, lng: 10, radiusKm: 5 }] }, h);
  assert.equal(r.status, 422, 'zones must be in Qatar');
  r = await call('PUT', '/api/admin/settings', {
    zones: [{ name: 'Greater Doha', lat: 25.2854, lng: 51.531, radiusKm: 30 }, { name: 'Al Khor', lat: 25.6839, lng: 51.5058, radiusKm: 6 }],
    popular: ['Oyster', 'Honey'], popularAr: ['عسل'], deliveryHours: 'Daily, 7 am – 11 pm',
  }, h);
  assert.equal(r.status, 200, r.text);
  const c = await catalog();
  assert.equal(c.settings.zones.length, 2);
  assert.deepEqual(c.settings.popular, ['Oyster', 'Honey']);
  assert.equal(c.settings.deliveryHours, 'Daily, 7 am – 11 pm');
  assert.deepEqual((await catalog('ar')).settings.popular, ['عسل']);
  const ok = await call('POST', '/api/orders', await orderBody({ location: AL_KHOR }));
  assert.equal(ok.status, 201, 'Al Khor accepted once it is a delivery area');
});

test('cross-site admin requests are blocked', async () => {
  const h = { ...(await loginCookie()), Origin: 'https://evil.example' };
  const r = await call('PATCH', '/api/admin/products/corn', { active: false }, h);
  assert.equal(r.status, 403);
});

test('pausing orders stops checkout with the shop message', async () => {
  const h = await loginCookie();
  await call('PUT', '/api/admin/settings', { orderingOpen: false, closedMessage: 'Closed for Eid. Back Sunday!', closedMessageAr: 'مغلق للعيد' }, h);
  let r = await call('POST', '/api/orders', await orderBody());
  assert.equal(r.status, 503);
  assert.equal(r.body.message, 'Closed for Eid. Back Sunday!');
  r = await call('POST', '/api/orders', await orderBody({ lang: 'ar' }));
  assert.equal(r.body.message, 'مغلق للعيد');
  await call('PUT', '/api/admin/settings', { orderingOpen: true }, h);
});

test('order status updates show in the admin list', async () => {
  const h = await loginCookie();
  const list = await call('GET', '/api/admin/orders?status=new', null, h);
  const id = list.body.orders[0].id;
  assert.equal((await call('PATCH', `/api/admin/orders/${id}`, { status: 'confirmed', adminNote: 'Packed' }, h)).status, 200);
  const after = await call('GET', '/api/admin/orders?status=confirmed', null, h);
  assert.ok(after.body.orders.some(o => o.id === id && o.adminNote === 'Packed'));
  const sum = await call('GET', '/api/admin/summary', null, h);
  assert.ok(sum.body.todayOrders >= 50);
});

test('login is locked after repeated wrong passwords', async () => {
  for (let i = 0; i < 5; i++) await call('POST', '/api/admin/login', { email: 'nobody@edenfarm.qa', password: 'wrong-password' });
  const r = await call('POST', '/api/admin/login', { email: 'nobody@edenfarm.qa', password: 'wrong-password' });
  assert.equal(r.status, 429);
});
