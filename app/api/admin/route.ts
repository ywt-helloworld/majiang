import { json, requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';

async function adminOverview(db: D1Database, adminUserId: string) {
  const [users, matches] = await Promise.all([
    db
      .prepare(
        `SELECT u.id, u.username, u.created_at AS createdAt,
              u.last_seen_at AS lastSeenAt,
              COUNT(DISTINCT mr.match_id) AS games,
              EXISTS(
                SELECT 1 FROM room_members active_rm
                JOIN rooms active_room ON active_room.id = active_rm.room_id
                WHERE active_rm.user_id = u.id
                  AND active_rm.active = 1
                  AND active_room.status IN ('waiting', 'playing')
              ) OR EXISTS(
                SELECT 1 FROM rooms hosted_room
                WHERE hosted_room.host_user_id = u.id
                  AND hosted_room.status IN ('waiting', 'playing')
              ) AS inActiveRoom
       FROM users u
       LEFT JOIN match_results mr ON mr.user_id = u.id
       LEFT JOIN deleted_users du ON du.user_id = u.id
       WHERE du.user_id IS NULL
       GROUP BY u.id, u.username, u.created_at, u.last_seen_at
       ORDER BY u.last_seen_at DESC, u.created_at DESC
       LIMIT 100`,
      )
      .all<{
        id: string;
        username: string;
        createdAt: number;
        lastSeenAt: number;
        games: number;
        inActiveRoom: number;
      }>(),
    db
      .prepare(
        `SELECT m.id AS matchId, r.code AS roomCode,
              m.started_at AS startedAt, m.finished_at AS finishedAt,
              COUNT(mr.user_id) AS playerCount,
              GROUP_CONCAT(u.username, '、') AS playerNames
       FROM matches m
       JOIN rooms r ON r.id = m.room_id
       LEFT JOIN match_results mr ON mr.match_id = m.id
       LEFT JOIN users u ON u.id = mr.user_id
       WHERE m.finished_at IS NOT NULL
       GROUP BY m.id, r.code, m.started_at, m.finished_at
       ORDER BY m.finished_at DESC
       LIMIT 50`,
      )
      .all<{
        matchId: string;
        roomCode: string;
        startedAt: number;
        finishedAt: number;
        playerCount: number;
        playerNames: string | null;
      }>(),
  ]);
  return {
    users: users.results.map((user) => ({
      ...user,
      games: Number(user.games),
      inActiveRoom: Boolean(user.inActiveRoom),
      isAdmin: user.id === adminUserId,
    })),
    matches: matches.results.map((match) => ({
      ...match,
      playerCount: Number(match.playerCount),
      playerNames: match.playerNames ?? '无玩家记录',
    })),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.user) return auth.response;
  return json(await adminOverview(await getDb(), auth.user.id));
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.user) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const db = await getDb();
  const now = Date.now();

  if (action === 'delete-match') {
    const matchId = typeof body?.matchId === 'string' ? body.matchId : '';
    const match = await db
      .prepare('SELECT finished_at AS finishedAt FROM matches WHERE id = ?')
      .bind(matchId)
      .first<{ finishedAt: number | null }>();
    if (!match) return json({ error: '该对局记录已经不存在' }, 404);
    if (!match.finishedAt)
      return json({ error: '进行中的对局不能作为历史记录撤销' }, 409);
    await db.batch([
      db.prepare('DELETE FROM match_results WHERE match_id = ?').bind(matchId),
      db.prepare('DELETE FROM matches WHERE id = ?').bind(matchId),
      db
        .prepare(
          'UPDATE rooms SET current_match_id = NULL, updated_at = ?, version = version + 1 WHERE current_match_id = ?',
        )
        .bind(now, matchId),
    ]);
    return json(await adminOverview(db, auth.user.id));
  }

  if (action === 'delete-user') {
    const targetUserId = typeof body?.userId === 'string' ? body.userId : '';
    if (!targetUserId) return json({ error: '缺少账号信息' }, 400);
    if (targetUserId === auth.user.id)
      return json({ error: '不能删除当前管理员账号' }, 400);
    const target = await db
      .prepare(
        `SELECT u.id, du.user_id AS deletedUserId,
              EXISTS(
                SELECT 1 FROM room_members rm
                JOIN rooms r ON r.id = rm.room_id
                WHERE rm.user_id = u.id
                  AND rm.active = 1
                  AND r.status IN ('waiting', 'playing')
              ) OR EXISTS(
                SELECT 1 FROM rooms hosted_room
                WHERE hosted_room.host_user_id = u.id
                  AND hosted_room.status IN ('waiting', 'playing')
              ) AS inActiveRoom
         FROM users u
         LEFT JOIN deleted_users du ON du.user_id = u.id
         WHERE u.id = ?`,
      )
      .bind(targetUserId)
      .first<{
        id: string;
        deletedUserId: string | null;
        inActiveRoom: number;
      }>();
    if (!target || target.deletedUserId)
      return json({ error: '该账号已经不存在' }, 404);
    if (target.inActiveRoom)
      return json({ error: '该账号正在房间或对局中，暂时不能删除' }, 409);
    const anonymousName = `已删除-${targetUserId.slice(0, 6)}`;
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetUserId),
      db
        .prepare('DELETE FROM room_members WHERE user_id = ?')
        .bind(targetUserId),
      db
        .prepare('UPDATE rooms SET host_user_id = ? WHERE host_user_id = ?')
        .bind(auth.user.id, targetUserId),
      db
        .prepare('UPDATE users SET username = ?, last_seen_at = ? WHERE id = ?')
        .bind(anonymousName, now, targetUserId),
      db
        .prepare(
          'INSERT INTO deleted_users (user_id, deleted_at, deleted_by_user_id) VALUES (?, ?, ?)',
        )
        .bind(targetUserId, now, auth.user.id),
    ]);
    return json(await adminOverview(db, auth.user.id));
  }

  return json({ error: '未知管理操作' }, 400);
}
