// Database access. Production uses a real Postgres server through DATABASE_URL
// (Supabase, Neon, RDS...). Without it, an embedded Postgres (PGlite) stores data
// in ./data/pglite so the shop runs locally with zero setup.
//
// Both expose the same tiny API:
//   db.query(sql, params) -> { rows }
//   db.tx(async q => { ... })   runs callback in one transaction; q has .query()
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createDb({ url = process.env.DATABASE_URL, dataDir, memory = false } = {}) {
  let db;
  if (url) {
    const { default: pg } = await import('pg');
    // Return int8 (bigint, count(*)) as JS numbers; our values stay far below 2^53.
    pg.types.setTypeParser(20, v => Number(v));
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX || 10),
      ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    });
    pool.on('error', err => console.error('[db] idle client error', err.message));
    db = {
      kind: 'postgres',
      query: (text, params) => pool.query(text, params),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn({ query: (t, p) => client.query(t, p) });
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = memory ? undefined : (dataDir || path.join(__dirname, '..', 'data', 'pglite'));
    if (dir) fs.mkdirSync(dir, { recursive: true });
    const lite = memory ? new PGlite() : new PGlite(dir);
    await lite.waitReady;
    const norm = r => ({ rows: r.rows.map(fixRow) });
    db = {
      kind: 'pglite',
      exec: sql => lite.exec(sql),
      query: async (text, params) => norm(await lite.query(text, params)),
      // PGlite holds an exclusive lock for the whole transaction, so concurrent
      // requests queue up exactly like row locks would on a server.
      tx: fn => lite.transaction(t => fn({ query: async (q, p) => norm(await t.query(q, p)) })),
      close: () => lite.close(),
    };
  }
  await migrate(db);
  return db;
}

// PGlite returns bytea as Uint8Array and int8 as BigInt; match node-postgres.
function fixRow(row) {
  for (const k in row) {
    const v = row[k];
    if (typeof v === 'bigint') row[k] = Number(v);
    else if (v instanceof Uint8Array && !Buffer.isBuffer(v)) row[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  }
  return row;
}

async function migrate(db) {
  // schema.sql is idempotent (IF NOT EXISTS everywhere), so it runs on every boot.
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  if (db.kind === 'pglite') await db.exec(sql);
  else await db.query(sql);
}
