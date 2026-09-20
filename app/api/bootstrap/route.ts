import { json, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSeasonAt, listSeasons } from '@/lib/season';
import { getLeaderboard } from '@/lib/stats';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const db = await getDb();
  const now = Date.now();
  const currentSeason = getSeasonAt(now, now);

  const [activeRoom, history, earliestMatch, leaderboard] = await Promise.all([
    db
      .prepare(
        `SELECT r.id, r.code, r.status
         FROM room_members rm
         JOIN rooms r ON r.id = rm.room_id
         WHERE rm.user_id = ? AND rm.active = 1
         ORDER BY r.updated_at DESC LIMIT 1`,
      )
      .bind(auth.user.id)
      .first<{ id: string; code: string; status: string }>(),
    db
      .prepare(
        `SELECT mr.match_id AS matchId, mr.final_score AS finalScore, mr.rank,
              mr.uma, mr.penalty, mr.total_pt AS totalPt,
              COALESCE(m.finished_at, mr.created_at) AS createdAt,
              r.code AS roomCode
         FROM match_results mr
         JOIN matches m ON m.id = mr.match_id
         JOIN rooms r ON r.id = m.room_id
         WHERE mr.user_id = ?
         ORDER BY mr.created_at DESC LIMIT 30`,
      )
      .bind(auth.user.id)
      .all<{
        matchId: string;
        finalScore: number;
        rank: number;
        uma: number;
        penalty: number;
        totalPt: number;
        createdAt: number;
        roomCode: string;
      }>(),
    db
      .prepare(
        'SELECT MIN(finished_at) AS earliest FROM matches WHERE finished_at IS NOT NULL',
      )
      .first<{ earliest: number | null }>(),
    getLeaderboard(db, currentSeason),
  ]);

  return json({
    user: auth.user,
    activeRoom: activeRoom ?? null,
    history: history.results.map((row) => {
      const season = getSeasonAt(row.createdAt, now);
      return { ...row, seasonId: season.id, seasonLabel: season.label };
    }),
    currentSeason,
    seasons: listSeasons(earliestMatch?.earliest ?? null, now),
    leaderboard,
  });
}
