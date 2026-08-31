import { json, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const db = await getDb();

  const activeRoom = await db
    .prepare(
      `SELECT r.id, r.code, r.status
     FROM room_members rm
     JOIN rooms r ON r.id = rm.room_id
     WHERE rm.user_id = ? AND rm.active = 1
     ORDER BY r.updated_at DESC LIMIT 1`,
    )
    .bind(auth.user.id)
    .first<{ id: string; code: string; status: string }>();

  const history = await db
    .prepare(
      `SELECT mr.match_id AS matchId, mr.final_score AS finalScore, mr.rank,
            mr.uma, mr.penalty, mr.total_pt AS totalPt,
            mr.created_at AS createdAt, r.code AS roomCode
     FROM match_results mr
     JOIN matches m ON m.id = mr.match_id
     JOIN rooms r ON r.id = m.room_id
     WHERE mr.user_id = ?
     ORDER BY mr.created_at DESC LIMIT 30`,
    )
    .bind(auth.user.id)
    .all();

  const leaderboard = await db
    .prepare(
      `SELECT u.id, u.username, COUNT(*) AS games,
            ROUND(SUM(mr.total_pt), 1) AS totalPt,
            ROUND(AVG(mr.total_pt), 1) AS avgPt,
            SUM(CASE WHEN mr.rank = 1 THEN 1 ELSE 0 END) AS firsts
     FROM match_results mr
     JOIN users u ON u.id = mr.user_id
     GROUP BY u.id, u.username
     ORDER BY totalPt DESC, firsts DESC, games ASC, u.created_at ASC`,
    )
    .all();

  return json({
    user: auth.user,
    activeRoom: activeRoom ?? null,
    history: history.results,
    leaderboard: leaderboard.results,
  });
}
