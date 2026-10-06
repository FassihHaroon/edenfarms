// Start the shop: node server/index.js  (or npm start)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { seed } from './seed/index.js';
import { createApp } from './app.js';
import { hashPassword, passwordProblem } from './auth.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';

function sessionSecret() {
  if (process.env.SESSION_SECRET) {
    if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
    return process.env.SESSION_SECRET;
  }
  if (production) throw new Error('Set SESSION_SECRET (32+ random characters) before running in production.');
  // Local development: keep a generated secret so sign-ins survive restarts.
  const file = path.join(ROOT, 'data', '.session-secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('base64url'));
  return fs.readFileSync(file, 'utf8').trim();
}

async function bootstrapAdmin(db) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  const { rows } = await db.query('SELECT count(*)::int AS n FROM admins');
  if (rows[0].n > 0) return;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('[admin] No admin account yet. Create one with: npm run create-admin -- you@example.com');
    return;
  }
  const problem = passwordProblem(ADMIN_PASSWORD);
  if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
  await db.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2)', [ADMIN_EMAIL.trim().toLowerCase(), await hashPassword(ADMIN_PASSWORD)]);
  console.log(`[admin] Created admin ${ADMIN_EMAIL}. Remove ADMIN_PASSWORD from the environment now.`);
}

if (production && !process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set: using the embedded database in ./data. Use a managed Postgres for a live shop.');
}

const db = await createDb();
if (await seed(db)) console.log('[db] Empty database filled with the starting catalogue.');
await bootstrapAdmin(db);

const app = createApp({
  db,
  sessionSecret: sessionSecret(),
  production,
  orderRateLimit: Number(process.env.ORDER_RATE_LIMIT ?? 8),
  trustProxy: process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : false,
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Eden Farm shop running on http://localhost:${port}  (database: ${db.kind})`);
  console.log(`Admin panel: http://localhost:${port}/admin`);
});

const shutdown = () => {
  server.close(async () => { await db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
