import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Les colonnes DATE sont renvoyées en texte AAAA-MM-JJ (pas de décalage de fuseau horaire).
pg.types.setTypeParser(1082, v => v);
// NUMERIC -> nombre JavaScript
pg.types.setTypeParser(1700, v => Number(v));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 15 });
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(log = console.log) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
      await client.query('COMMIT');
      log(`Migration appliquée : ${f}`);
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
}

export async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; }
  finally { c.release(); }
}
