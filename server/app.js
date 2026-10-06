// Express app: storefront files (English + Arabic), public shop API and the private admin panel.
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { getCatalog } from './catalog.js';
import { placeOrder, OrderError, publicOrder, findByToken, findForTracking } from './orders.js';
import { createAuth } from './auth.js';
import { adminRouter } from './admin-api.js';
import { serveImage } from './images.js';
import { arabicPage, PAGES } from './i18n.js';
import { reverseGeocode, searchPlaces } from './geo.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_DIR = path.join(ROOT, 'admin');
const TILES = ['https://tile.openstreetmap.org'];

// Small in-memory limiter for public lookups (per IP, per window).
function limiter(max, windowMs) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return list.length <= max;
  };
}

export function createApp({ db, sessionSecret, production = false, orderRateLimit = 8, trustProxy = false }) {
  const app = express();
  const auth = createAuth({ db, secret: sessionSecret, secureCookies: production });
  const lookupLimit = limiter(12, 10 * 60_000);
  const geoLimit = limiter(40, 60_000);

  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:', ...TILES],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        ...(production ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    strictTransportSecurity: production ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    // The location button needs the browser's geolocation on our own pages.
    permissionsPolicy: undefined,
  }));
  app.use((req, res, next) => { res.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()'); next(); });
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true });
  });

  /* ---------- Storefront files ---------- */
  // Only these folders are public; server code, admin files and the database never are.
  const page = file => (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(ROOT, file));
  app.get(['/', '/index.html'], page('index.html'));
  for (const name of PAGES.filter(p => p !== 'index')) {
    app.get([`/${name}`, `/${name}.html`], page(`${name}.html`));
  }

  // Arabic: the same pages, translated on the server (cached until a file changes).
  const arabic = (file, english) => (req, res) =>
    res.set('Cache-Control', 'no-cache').type('html').send(arabicPage(file, english));
  app.get(['/ar', '/ar/', '/ar/index.html'], arabic('index.html', '/'));
  for (const name of PAGES.filter(p => p !== 'index')) {
    app.get([`/ar/${name}`, `/ar/${name}.html`], arabic(`${name}.html`, `/${name}.html`));
  }

  app.use('/css', express.static(path.join(ROOT, 'css'), { cacheControl: true, maxAge: 0 }));
  app.use('/js', express.static(path.join(ROOT, 'js'), { cacheControl: true, maxAge: 0 }));
  app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '7d' }));
  app.use('/vendor/leaflet', express.static(path.join(ROOT, 'node_modules', 'leaflet', 'dist'), { maxAge: '30d' }));
  app.get('/favicon.ico', (req, res) => res.sendFile(path.join(ROOT, 'assets/img/favicon.png')));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /api/\n'));
  app.get('/img/:id.webp', serveImage(db));

  /* ---------- Public shop API ---------- */
  const langOf = req => (req.query.lang === 'ar' ? 'ar' : 'en');
  // The storefront loads this as a script, so products are ready before app.js runs.
  app.get('/api/catalog.js', async (req, res) => {
    const catalog = await getCatalog(db, langOf(req));
    res.type('application/javascript').set('Cache-Control', 'no-cache')
      .send(`window.EDEN = ${JSON.stringify(catalog)};\n`);
  });
  app.get('/api/catalog', async (req, res) => {
    res.set('Cache-Control', 'no-cache').json(await getCatalog(db, langOf(req)));
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const { order, duplicate } = await placeOrder(db, req.body, { ip: req.ip, secret: sessionSecret, rateLimit: orderRateLimit });
      res.status(duplicate ? 200 : 201).json({ order: publicOrder(order) });
    } catch (err) {
      if (err instanceof OrderError) {
        const body = { error: err.code, message: err.message, ...err.extra };
        // Send fresh prices with a price/availability conflict so the basket can update itself.
        if (['PRICES_CHANGED', 'ITEMS_UNAVAILABLE', 'SLOT_CLOSED'].includes(err.code)) {
          body.catalog = await getCatalog(db, req.body?.lang === 'ar' ? 'ar' : 'en');
        }
        return res.status(err.status).json(body);
      }
      throw err;
    }
  });

  /* ---------- Order tracking ---------- */
  app.get('/api/track/:code', async (req, res) => {
    const order = await findByToken(db, String(req.params.code), String(req.query.k || ''));
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    res.set('Cache-Control', 'no-store').json({ order: publicOrder(order) });
  });
  app.post('/api/track/lookup', async (req, res) => {
    if (!lookupLimit(req.ip)) return res.status(429).json({ error: 'TOO_MANY' });
    const r = z.object({ code: z.string().trim().min(3).max(20), phone: z.string().trim().min(6).max(24) }).safeParse(req.body);
    if (!r.success) return res.status(422).json({ error: 'INVALID' });
    const order = await findForTracking(db, r.data.code, r.data.phone);
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ code: order.code, token: order.track });
  });

  /* ---------- Map lookups (proxied to OpenStreetMap, cached) ---------- */
  const coord = z.coerce.number().finite();
  app.get('/api/geo/reverse', async (req, res) => {
    if (!geoLimit(req.ip)) return res.status(429).json({ error: 'TOO_MANY' });
    const r = z.object({ lat: coord.min(-90).max(90), lng: coord.min(-180).max(180) }).safeParse(req.query);
    if (!r.success) return res.status(422).json({ error: 'INVALID' });
    res.json(await reverseGeocode(r.data.lat, r.data.lng, langOf(req)));
  });
  app.get('/api/geo/search', async (req, res) => {
    if (!geoLimit(req.ip)) return res.status(429).json({ error: 'TOO_MANY' });
    const q = String(req.query.q || '').trim().slice(0, 120);
    if (q.length < 2) return res.json({ results: [] });
    res.json({ results: await searchPlaces(q, langOf(req)) });
  });

  /* ---------- Admin (private) ---------- */
  const privateHeaders = (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    next();
  };
  app.use(['/admin', '/api/admin'], privateHeaders);

  app.get('/admin/login', async (req, res) => {
    if (await auth.current(req)) return res.redirect(302, '/admin');
    res.sendFile(path.join(ADMIN_DIR, 'login.html'));
  });
  // The sign-in page needs these two files before anyone is signed in.
  app.get('/admin/admin.css', (req, res) => res.sendFile(path.join(ADMIN_DIR, 'admin.css')));
  app.get('/admin/login.js', (req, res) => res.sendFile(path.join(ADMIN_DIR, 'login.js')));

  app.post('/api/admin/login', auth.sameOrigin, async (req, res) => {
    const result = await auth.login(req, res, req.body || {});
    if (!result.ok) return res.status(result.status).json({ error: 'LOGIN_FAILED', message: result.message });
    res.json({ ok: true });
  });
  app.post('/api/admin/logout', auth.sameOrigin, (req, res) => { auth.logout(res); res.json({ ok: true }); });

  // Everything else under /admin needs a session: strangers only ever see the sign-in page.
  app.get(['/admin', '/admin/'], auth.requirePage, (req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));
  app.get('/admin/app.js', auth.requirePage, (req, res) => res.sendFile(path.join(ADMIN_DIR, 'app.js')));
  app.use('/admin', auth.requirePage, (req, res) => res.redirect(302, '/admin'));
  app.use('/api/admin', auth.sameOrigin, auth.requireApi, adminRouter({ db, auth }));

  /* ---------- Fallbacks ---------- */
  app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Not found.' }));
  app.use('/ar', (req, res) => res.status(404).set('Cache-Control', 'no-cache').type('html').send(arabicPage('server/404.html', '/')));
  app.use((req, res) => res.status(404).set('Cache-Control', 'no-cache').sendFile(path.join(ROOT, 'server', '404.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'The request could not be read.' });
    }
    const ref = crypto.randomBytes(4).toString('hex');
    console.error(`[error ${ref}] ${req.method} ${req.originalUrl}`, err);
    const msg = `Something went wrong on our side (ref ${ref}). Please try again, or message us on WhatsApp.`;
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'SERVER_ERROR', message: msg });
    res.status(500).type('text/plain').send(msg);
  });

  return app;
}
