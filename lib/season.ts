export type SeasonInfo = {
  id: string;
  label: string;
  startAt: number;
  endAt: number | null;
  isCurrent: boolean;
};

type SeasonRow = {
  id: string;
  label: string;
  startAt: number;
  endAt: number | null;
};

const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;
const INITIAL_SEASON_START = Date.UTC(2026, 7, 8) - SHANGHAI_OFFSET;
const INITIAL_SEASON_END = Date.UTC(2026, 9, 8) - SHANGHAI_OFFSET;

function toSeason(row: SeasonRow, now: number): SeasonInfo {
  return {
    ...row,
    startAt: Number(row.startAt),
    endAt: row.endAt === null ? null : Number(row.endAt),
    isCurrent:
      now >= Number(row.startAt) &&
      (row.endAt === null || now < Number(row.endAt)),
  };
}

function seasonIdentity(startAt: number) {
  const local = new Date(startAt + SHANGHAI_OFFSET);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  return {
    id: `season-${year}-${month}-${day}`,
    label: `${year}.${month} 赛季`,
  };
}

async function latestSeason(db: D1Database) {
  return db
    .prepare(
      `SELECT id, label, start_at AS startAt, end_at AS endAt
       FROM seasons ORDER BY start_at DESC LIMIT 1`,
    )
    .first<SeasonRow>();
}

export async function ensureCurrentSeason(db: D1Database, now = Date.now()) {
  let latest = await latestSeason(db);
  if (!latest) {
    const earliest = await db
      .prepare(
        'SELECT MIN(finished_at) AS earliest FROM matches WHERE finished_at IS NOT NULL',
      )
      .first<{ earliest: number | null }>();
    const startAt = Math.min(
      INITIAL_SEASON_START,
      earliest?.earliest ?? INITIAL_SEASON_START,
    );
    await db
      .prepare(
        `INSERT OR IGNORE INTO seasons (id, label, start_at, end_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        seasonIdentity(startAt).id,
        '2026.08 赛季',
        startAt,
        INITIAL_SEASON_END,
        now,
      )
      .run();
    latest = await latestSeason(db);
  }
  if (!latest) throw new Error('无法初始化赛季');

  if (latest.endAt !== null && now >= Number(latest.endAt)) {
    const startAt = Number(latest.endAt);
    const identity = seasonIdentity(startAt);
    await db
      .prepare(
        `INSERT OR IGNORE INTO seasons (id, label, start_at, end_at, created_at)
         VALUES (?, ?, ?, NULL, ?)`,
      )
      .bind(identity.id, identity.label, startAt, now)
      .run();
    latest = (await latestSeason(db)) ?? latest;
  }

  return toSeason(latest, now);
}

export async function getSeasonById(
  db: D1Database,
  id: string,
  now = Date.now(),
) {
  await ensureCurrentSeason(db, now);
  const row = await db
    .prepare(
      `SELECT id, label, start_at AS startAt, end_at AS endAt
       FROM seasons WHERE id = ?`,
    )
    .bind(id)
    .first<SeasonRow>();
  return row ? toSeason(row, now) : null;
}

export async function getSeasonAt(
  db: D1Database,
  timestamp: number,
  now = Date.now(),
) {
  await ensureCurrentSeason(db, now);
  const row = await db
    .prepare(
      `SELECT id, label, start_at AS startAt, end_at AS endAt
       FROM seasons
       WHERE start_at <= ? AND (end_at IS NULL OR ? < end_at)
       ORDER BY start_at DESC LIMIT 1`,
    )
    .bind(timestamp, timestamp)
    .first<SeasonRow>();
  return row ? toSeason(row, now) : null;
}

export async function listSeasons(db: D1Database, now = Date.now()) {
  await ensureCurrentSeason(db, now);
  const rows = await db
    .prepare(
      `SELECT id, label, start_at AS startAt, end_at AS endAt
       FROM seasons ORDER BY start_at DESC`,
    )
    .all<SeasonRow>();
  return rows.results.map((row) => toSeason(row, now));
}

export function seasonEndFromShanghaiDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const startOfDay = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(startOfDay)) return null;
  const check = new Date(startOfDay + SHANGHAI_OFFSET);
  const normalized = `${check.getUTCFullYear()}-${String(check.getUTCMonth() + 1).padStart(2, '0')}-${String(check.getUTCDate()).padStart(2, '0')}`;
  if (normalized !== value) return null;
  return startOfDay + 24 * 60 * 60 * 1000;
}
