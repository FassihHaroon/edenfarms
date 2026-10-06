// Browser walk-through against a running server (npm start first):
//   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run e2e
// Phone, English: location found automatically → favourites → basket → checkout with a
// repeat order → tracking page. Phone, Arabic: same checkout in RTL. Admin: regular badge,
// rider details (shown on the tracking page), next repeat order, settings, Arabic product fields.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromePath } from './chrome.js';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || path.join('tests', 'e2e', 'shots');
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const WEST_BAY = { latitude: 25.3226, longitude: 51.5303, accuracy: 20 };
fs.mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1366, height: 900, deviceScaleFactor: 1 };
const wait = ms => new Promise(r => setTimeout(r, ms));
const problems = [];
const step = msg => console.log('✓', msg);
const codes = [];

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, protocolTimeout: 60000 });
const newPage = async (vp, { geo = false } = {}) => {
  const ctx = await browser.createBrowserContext();
  if (geo) await ctx.overridePermissions(BASE, ['geolocation']);
  const page = await ctx.newPage();
  await page.setViewport(vp);
  if (geo) await page.setGeolocation(WEST_BAY);
  page.on('console', m => { if (m.type() === 'error' && !/tile\.openstreetmap|status of 404/.test(m.text())) problems.push(`console (${page.url()}): ${m.text()}`); });
  page.on('pageerror', e => problems.push(`page error (${page.url()}): ${e.message}`));
  return page;
};
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });

async function checkout(page, { name, phone, repeat }) {
  await page.click('#tab-cart');
  await page.waitForSelector('#cart.is-open');
  await page.waitForSelector('#slots [aria-pressed="true"]');
  await wait(450); // let the drawer finish sliding in
  await page.click('#checkout');
  await page.waitForSelector('#checkout-view:not([hidden])');
  await page.waitForSelector('#co-loc.is-set', { timeout: 10000 });
  await page.$eval('#co-name', el => { el.value = ''; });
  await page.type('#co-name', name);
  await page.$eval('#co-phone', el => { el.value = ''; });
  await page.type('#co-phone', phone);
  await page.$eval('#co-area', el => { if (!el.value) el.value = 'West Bay'; });
  await page.$eval('#co-zone', el => { el.value = '61'; });
  await page.$eval('#co-building', el => { el.value = '12'; });
  if (repeat) await page.click(`.rchip input[value="${repeat}"] + span`);
  await page.click('.paychip input[value="cash"] + span');
}

try {
  /* ---------- Customer on a phone, English ---------- */
  const shop = await newPage(PHONE, { geo: true });
  await shop.goto(BASE, { waitUntil: 'networkidle0' });
  await shop.waitForSelector('#grid .card .add');
  await shop.waitForFunction(() => document.querySelector('#loc-chip').classList.contains('is-ok'), { timeout: 15000 });
  const where = await shop.$eval('#loc-chip-txt', el => el.textContent);
  step(`location found automatically: "${where}", inside the delivery area`);
  await wait(500);
  await shot(shop, '01-phone-home');

  // Favourites
  await shop.click('#grid .card:nth-child(2) .wish');
  await shop.click('#tab-saved');
  await shop.waitForFunction(() => document.querySelectorAll('#grid .card').length === 1 && document.querySelector('#tab-fav[aria-selected="true"]'));
  await wait(400);
  await shot(shop, '02-phone-favourites');
  step('Saved tab shows the favourite product with an add button');
  await shop.click('#grid .card .add');
  await shop.click('#tabs [data-filter="all"]');
  await shop.click('#mush-cards .mcard .add');

  // Location picker (map): the chip lives in the header row, visible at the top of the page
  await shop.evaluate(() => scrollTo(0, 0));
  await wait(400);
  await shop.click('#loc-chip');
  await shop.waitForSelector('#loc:not([hidden]) .leaflet-container');
  await shop.waitForFunction(() => document.querySelector('#loc-status').classList.contains('is-ok'), { timeout: 15000 });
  await wait(1500);
  await shot(shop, '03-phone-location-picker');
  await shop.click('#loc-confirm');
  step('map picker opens, shows "We deliver here", confirms');

  await checkout(shop, { name: 'Noor Al Test', phone: '5512 3456', repeat: '14' });
  await wait(300);
  await shot(shop, '04-phone-checkout');
  await shop.click('#place-order');
  await shop.waitForSelector('#done-view:not([hidden]) .done__badge', { timeout: 15000 });
  await wait(500);
  await shot(shop, '05-phone-order-placed');
  const code = await shop.$eval('#done-view .done__lede b', el => el.textContent);
  codes.push(code);
  step(`order ${code} placed with "every 2 weeks" repeat`);

  await Promise.all([shop.waitForNavigation({ waitUntil: 'networkidle0' }), shop.click('#done-view a[href*="track.html"]')]);
  await shop.waitForSelector('#track-card:not([hidden]) .tsteps');
  await wait(300);
  await shot(shop, '06-phone-tracking', true);
  step('tracking page shows the order status');

  /* ---------- Customer on a phone, Arabic ---------- */
  const ar = await newPage(PHONE, { geo: true });
  await ar.goto(`${BASE}/ar/`, { waitUntil: 'networkidle0' });
  await ar.waitForSelector('#grid .card .add');
  const dir = await ar.$eval('html', el => el.dir);
  if (dir !== 'rtl') throw new Error('Arabic page is not right-to-left');
  await ar.waitForFunction(() => document.querySelector('#loc-chip').classList.contains('is-ok'), { timeout: 15000 });
  await wait(500);
  await shot(ar, '07-phone-ar-home');
  await ar.screenshot({ path: path.join(OUT, '07b-phone-ar-full.png'), fullPage: true });
  await ar.click('#grid .card:nth-child(1) .add');
  await checkout(ar, { name: 'نورة التجربة', phone: '6612 3456' });
  await wait(300);
  await shot(ar, '08-phone-ar-checkout');
  await ar.click('#place-order');
  await ar.waitForSelector('#done-view:not([hidden]) .done__badge', { timeout: 15000 });
  codes.push(await ar.$eval('#done-view .done__lede b', el => el.textContent));
  await wait(400);
  await shot(ar, '09-phone-ar-order-placed');
  step(`Arabic order ${codes[1]} placed (RTL)`);

  /* ---------- Staff ---------- */
  if (!EMAIL || !PASSWORD) {
    console.log('(skipping admin steps: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD)');
  } else {
    const admin = await newPage(DESKTOP);
    await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
    if (!admin.url().endsWith('/admin/login')) throw new Error('admin page was reachable without signing in');
    await admin.type('#email', EMAIL);
    await admin.type('#password', PASSWORD);
    await Promise.all([admin.waitForNavigation({ waitUntil: 'networkidle0' }), admin.click('#login-btn')]);
    await admin.waitForSelector('.order');
    const regular = await admin.evaluate(c => {
      const o = [...document.querySelectorAll('.order')].find(e => e.querySelector('.order__code').textContent === c);
      return !!o?.querySelector('.pill--regular');
    }, code);
    if (!regular) throw new Error(`${code} is not marked as a regular customer`);
    step(`${code} shows the ★ Regular badge in Orders`);

    // Rider details, then out for delivery
    await admin.evaluate(c => {
      const o = [...document.querySelectorAll('.order')].find(e => e.querySelector('.order__code').textContent === c);
      o.querySelector('.order__rider').open = true;
    }, code);
    const fill = async (field, value) => admin.evaluate((c, f, v) => {
      const o = [...document.querySelectorAll('.order')].find(e => e.querySelector('.order__code').textContent === c);
      const i = o.querySelector(`[data-rider="${f}"]`); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true }));
    }, code, field, value);
    await fill('riderName', 'Ahmed'); await wait(300);
    await fill('riderPhone', '33001122'); await wait(300);
    await admin.evaluate(c => {
      const o = [...document.querySelectorAll('.order')].find(e => e.querySelector('.order__code').textContent === c);
      const s = o.querySelector('[data-status-select]'); s.value = 'out_for_delivery'; s.dispatchEvent(new Event('change', { bubbles: true }));
    }, code);
    await wait(800);
    await shot(admin, '10-desktop-admin-orders');
    await shop.reload({ waitUntil: 'networkidle0' });
    await shop.waitForSelector('.tcard__rider');
    await shot(shop, '11-phone-tracking-rider', true);
    step('tracking page now shows "Out for delivery" with rider Ahmed');

    // Repeat orders tab: create the next delivery
    await admin.click('[data-tab="repeat"]');
    await admin.waitForSelector('[data-sub] [data-make]');
    await shot(admin, '12-desktop-admin-repeat');
    await admin.evaluate(() => document.querySelector('[data-sub] [data-make]').click());
    await admin.waitForFunction(() => /created for/.test(document.querySelector('#toast').textContent), { timeout: 10000 });
    step('next repeat order created from the Repeat orders tab');

    // Settings and product editor
    await admin.click('[data-tab="settings"]');
    await admin.waitForSelector('#zone-map.leaflet-container');
    await wait(1500);
    await shot(admin, '13-desktop-admin-settings', true);
    await admin.click('[data-tab="products"]');
    await admin.waitForSelector('.prow [data-edit]');
    await admin.click('.prow [data-edit]');
    await admin.waitForSelector('#sheet:not([hidden]) #p-name-ar');
    await wait(400);
    await shot(admin, '14-desktop-admin-product-arabic');
    await admin.click('[data-sheet-close]');
    step('settings (delivery-area map) and Arabic product fields render');

    const phoneAdmin = await newPage(PHONE);
    await phoneAdmin.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
    await phoneAdmin.type('#email', EMAIL);
    await phoneAdmin.type('#password', PASSWORD);
    await Promise.all([phoneAdmin.waitForNavigation({ waitUntil: 'networkidle0' }), phoneAdmin.click('#login-btn')]);
    await phoneAdmin.waitForSelector('.order');
    await shot(phoneAdmin, '15-phone-admin-orders');

    // Clean up: cancel test orders, stop test repeat orders.
    await admin.evaluate(async list => {
      for (const c of list) {
        const r = await (await fetch('/api/admin/orders?status=all&q=' + c)).json();
        for (const o of r.orders) {
          await fetch(`/api/admin/orders/${o.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled', adminNote: 'Automated test order' }) });
          if (o.repeat) {
            await fetch(`/api/admin/subscriptions/${o.repeat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
            const all = await (await fetch('/api/admin/orders?status=new&repeat=1')).json();
            for (const x of all.orders.filter(x => x.repeat?.id === o.repeat.id)) {
              await fetch(`/api/admin/orders/${x.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled', adminNote: 'Automated test order' }) });
            }
          }
        }
      }
    }, codes);
    step('cleaned up test orders');
  }
} catch (err) {
  problems.push(err.stack || err.message);
} finally {
  await browser.close();
}

if (problems.length) {
  console.error('\nPROBLEMS:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`\nAll good. Screenshots in ${OUT}`);
