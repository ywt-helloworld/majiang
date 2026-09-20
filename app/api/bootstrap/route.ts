import { json, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ensureCurrentSeason, listSeasons } from '@/lib/season';
import { getLeaderboard, getYakumanLeaderboard } from '@/lib/stats';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const db = await getDb();
  const now = Date.now();
  const currentSeason = await ensureCurrentSeason(db, now);

  const [activeRoom, history, leaderboard, yakumanLeaderboard, seasons] =
    await Promise.all([
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
      getLeaderboard(db, currentSeason),
      getYakumanLeaderboard(db, currentSeason),
      listSeasons(db, now),
    ]);

  return json({
    user: auth.user,
    activeRoom: activeRoom ?? null,
    history: history.results.map((row) => {
      const season = seasons.find(
        (item) =>
          row.createdAt >= item.startAt &&
          (item.endAt === null || row.createdAt < item.endAt),
      );
      return {
        ...row,
        seasonId: season?.id ?? 'unassigned',
        seasonLabel: season?.label ?? '早期记录',
      };
    }),
    currentSeason,
    seasons,
    leaderboard,
    yakumanLeaderboard,
  });
}
