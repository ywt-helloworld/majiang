import type { SeasonInfo } from '@/lib/season';

export type LeaderboardRecord = {
  id: string;
  username: string;
  games: number;
  totalPt: number;
  avgPt: number;
  avgRank: number;
  firsts: number;
};

export type YakumanLeaderboardRecord = {
  id: string;
  username: string;
  total: number;
  latestAt: number;
  yakumans: Array<{ name: string; count: number }>;
};

function seasonWhere(season: SeasonInfo | null) {
  if (!season) return { sql: '', values: [] as number[] };
  if (season.endAt === null)
    return { sql: 'WHERE m.finished_at >= ?', values: [season.startAt] };
  return {
    sql: 'WHERE m.finished_at >= ? AND m.finished_at < ?',
    values: [season.startAt, season.endAt],
  };
}

export async function getLeaderboard(
  db: D1Database,
  season: SeasonInfo | null,
) {
  const filter = seasonWhere(season);
  const statement = db.prepare(
    `SELECT u.id, u.username, COUNT(*) AS games,
          ROUND(SUM(mr.total_pt), 1) AS totalPt,
          ROUND(AVG(mr.total_pt), 1) AS avgPt,
          ROUND(AVG((50.0 - mr.uma) / 20.0), 2) AS avgRank,
          SUM(CASE WHEN mr.rank = 1 THEN 1 ELSE 0 END) AS firsts
     FROM match_results mr
     JOIN matches m ON m.id = mr.match_id
     JOIN users u ON u.id = mr.user_id
     ${filter.sql}
     GROUP BY u.id, u.username
     ORDER BY totalPt DESC, firsts DESC, games ASC, u.created_at ASC`,
  );
  const result = filter.values.length
    ? await statement.bind(...filter.values).all<LeaderboardRecord>()
    : await statement.all<LeaderboardRecord>();
  return result.results.map((row) => ({
    ...row,
    games: Number(row.games),
    totalPt: Number(row.totalPt),
    avgPt: Number(row.avgPt),
    avgRank: Number(row.avgRank),
    firsts: Number(row.firsts),
  }));
}

export async function getYakumanLeaderboard(
  db: D1Database,
  season: SeasonInfo | null,
) {
  const filter = seasonWhere(season);
  const statement = db.prepare(
    `SELECT u.id, u.username, yw.yakuman_name AS yakumanName,
            COUNT(*) AS count, MAX(yw.won_at) AS latestAt
     FROM yakuman_wins yw
     JOIN matches m ON m.id = yw.match_id
     JOIN users u ON u.id = yw.user_id
     ${filter.sql}
     GROUP BY u.id, u.username, yw.yakuman_name
     ORDER BY count DESC, latestAt DESC`,
  );
  const result = filter.values.length
    ? await statement.bind(...filter.values).all<{
        id: string;
        username: string;
        yakumanName: string;
        count: number;
        latestAt: number;
      }>()
    : await statement.all<{
        id: string;
        username: string;
        yakumanName: string;
        count: number;
        latestAt: number;
      }>();
  const grouped = new Map<string, YakumanLeaderboardRecord>();
  for (const row of result.results) {
    const entry = grouped.get(row.id) ?? {
      id: row.id,
      username: row.username,
      total: 0,
      latestAt: 0,
      yakumans: [],
    };
    const count = Number(row.count);
    entry.total += count;
    entry.latestAt = Math.max(entry.latestAt, Number(row.latestAt));
    entry.yakumans.push({ name: row.yakumanName, count });
    grouped.set(row.id, entry);
  }
  return [...grouped.values()].sort(
    (a, b) => b.total - a.total || b.latestAt - a.latestAt,
  );
}
