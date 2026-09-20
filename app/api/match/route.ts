import { json, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { GameState } from '@/lib/game';
import { getSeasonAt } from '@/lib/season';

type MatchRow = {
  matchId: string;
  roomCode: string;
  startedAt: number;
  finishedAt: number | null;
  gameState: string | null;
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const matchId = new URL(request.url).searchParams.get('id') ?? '';
  if (!matchId) return json({ error: '缺少牌局记录编号' }, 400);
  const db = await getDb();
  const match = await db
    .prepare(
      `SELECT m.id AS matchId, r.code AS roomCode,
            m.started_at AS startedAt, m.finished_at AS finishedAt,
            r.game_state AS gameState
       FROM matches m
       JOIN rooms r ON r.id = m.room_id
       WHERE m.id = ?`,
    )
    .bind(matchId)
    .first<MatchRow>();
  if (!match || !match.finishedAt)
    return json({ error: '该牌局记录不存在或尚未结束' }, 404);

  if (!auth.user.isAdmin) {
    const participant = await db
      .prepare(
        'SELECT 1 AS allowed FROM match_results WHERE match_id = ? AND user_id = ?',
      )
      .bind(matchId, auth.user.id)
      .first<{ allowed: number }>();
    if (!participant) return json({ error: '你没有权限查看这场牌局' }, 403);
  }

  const results = await db
    .prepare(
      `SELECT mr.user_id AS userId, u.username, mr.final_score AS finalScore,
            mr.rank, mr.uma, mr.penalty, mr.total_pt AS totalPt
       FROM match_results mr
       JOIN users u ON u.id = mr.user_id
       WHERE mr.match_id = ?
       ORDER BY mr.rank ASC, mr.final_score DESC`,
    )
    .bind(matchId)
    .all<{
      userId: string;
      username: string;
      finalScore: number;
      rank: number;
      uma: number;
      penalty: number;
      totalPt: number;
    }>();

  let gameState: GameState | null = null;
  try {
    gameState = match.gameState
      ? (JSON.parse(match.gameState) as GameState)
      : null;
  } catch {
    gameState = null;
  }
  const seats = new Map(
    (gameState?.players ?? []).map((player) => [player.userId, player.seat]),
  );
  const records = Array.isArray(gameState?.records)
    ? [...gameState.records].reverse()
    : [];
  const processLimited =
    records.length === 30 && records.some((record) => !record.actionType);

  return json({
    matchId: match.matchId,
    roomCode: match.roomCode,
    startedAt: match.startedAt,
    finishedAt: match.finishedAt,
    season: getSeasonAt(match.finishedAt),
    results: results.results.map((result) => ({
      ...result,
      seat: seats.get(result.userId) ?? null,
    })),
    records,
    processLimited,
  });
}
