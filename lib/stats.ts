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

export async function getLeaderboard(
  db: D1Database,
  season: SeasonInfo | null,
) {
  const statement = db.prepare(
    `SELECT u.id, u.username, COUNT(*) AS games,
          ROUND(SUM(mr.total_pt), 1) AS totalPt,
          ROUND(AVG(mr.total_pt), 1) AS avgPt,
          ROUND(AVG((50.0 - mr.uma) / 20.0), 2) AS avgRank,
          SUM(CASE WHEN mr.rank = 1 THEN 1 ELSE 0 END) AS firsts
     FROM match_results mr
     JOIN matches m ON m.id = mr.match_id
     JOIN users u ON u.id = mr.user_id
     ${season ? 'WHERE m.finished_at >= ? AND m.finished_at < ?' : ''}
     GROUP BY u.id, u.username
     ORDER BY totalPt DESC, firsts DESC, games ASC, u.created_at ASC`,
  );
  const result = season
    ? await statement
        .bind(season.startAt, season.endAt)
        .all<LeaderboardRecord>()
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
