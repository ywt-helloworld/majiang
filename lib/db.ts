import { env } from 'cloudflare:workers';

import { schemaStatements } from '@/db/schema';

let schemaReady: Promise<void> | null = null;

export async function getDb() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Database binding DB is unavailable');

  schemaReady ??= (async () => {
    await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
    await db.prepare('PRAGMA optimize').run();
  })();
  await schemaReady;
  return db;
}
