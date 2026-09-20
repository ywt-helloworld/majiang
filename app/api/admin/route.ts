import { getAdminCredentials, json, requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { calculateStandings, createGame } from '@/lib/game';
import {
  ensureCurrentSeason,
  listSeasons,
  seasonEndFromShanghaiDate,
} from '@/lib/season';

const WINDS = ['东', '南', '西', '北'];

function resultRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join('');
}

async function adminOverview(db: D1Database, adminUserId: string) {
  const currentSeason = await ensureCurrentSeason(db);
  const [users, matches, seasons] = await Promise.all([
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
    listSeasons(db),
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
    currentSeason,
    seasons,
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

  if (action === 'set-season-end') {
    const seasonId = typeof body?.seasonId === 'string' ? body.seasonId : '';
    const endDate = typeof body?.endDate === 'string' ? body.endDate : '';
    const currentSeason = await ensureCurrentSeason(db, now);
    if (!seasonId || seasonId !== currentSeason.id)
      return json({ error: '只能设置当前赛季的结束时间' }, 400);
    const endAt = seasonEndFromShanghaiDate(endDate);
    if (!endAt) return json({ error: '请选择有效的赛季结束日期' }, 400);
    if (endAt <= now) return json({ error: '赛季结束日期不能早于今天' }, 400);
    if (endAt <= currentSeason.startAt)
      return json({ error: '赛季结束日期必须晚于开始日期' }, 400);
    const latestMatch = await db
      .prepare(
        'SELECT MAX(finished_at) AS latest FROM matches WHERE finished_at >= ?',
      )
      .bind(currentSeason.startAt)
      .first<{ latest: number | null }>();
    if (latestMatch?.latest && endAt <= latestMatch.latest)
      return json({ error: '结束日期不能早于本赛季已有牌局' }, 400);
    await db
      .prepare('UPDATE seasons SET end_at = ? WHERE id = ?')
      .bind(endAt, seasonId)
      .run();
    return json(await adminOverview(db, auth.user.id));
  }

  if (action === 'create-result') {
    const rawPlayers = Array.isArray(body?.players) ? body.players : [];
    if (rawPlayers.length !== 4)
      return json({ error: '请完整填写东、南、西、北四家结果' }, 400);
    const players = rawPlayers.map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        username:
          typeof item.username === 'string'
            ? item.username.trim().normalize('NFC')
            : '',
        score: Number(item.score),
        penalty: Number(item.penalty ?? 0),
      };
    });
    if (players.some((player) => !player.username))
      return json({ error: '四家玩家账号不能为空' }, 400);
    if (
      new Set(players.map((player) => player.username.toLowerCase())).size !== 4
    )
      return json({ error: '四家玩家账号不能重复' }, 400);
    if (
      players.some(
        (player) => !Number.isInteger(player.score) || player.score % 100 !== 0,
      )
    )
      return json({ error: '最终点数必须是整百点' }, 400);
    if (players.reduce((sum, player) => sum + player.score, 0) !== 100000)
      return json({ error: '四家最终点数合计必须为 100,000 点' }, 400);
    if (
      players.some(
        (player) =>
          !Number.isFinite(player.penalty) ||
          player.penalty > 0 ||
          Math.round(player.penalty * 10) !== player.penalty * 10,
      )
    )
      return json({ error: '额外判罚需为 0 或最多一位小数的负数 pt' }, 400);

    const accounts = await Promise.all(
      players.map((player) =>
        db
          .prepare(
            `SELECT u.id, u.username
             FROM users u
             LEFT JOIN deleted_users du ON du.user_id = u.id
             WHERE u.username = ? COLLATE NOCASE AND du.user_id IS NULL`,
          )
          .bind(player.username)
          .first<{ id: string; username: string }>(),
      ),
    );
    const missingIndex = accounts.findIndex((account) => !account);
    if (missingIndex >= 0)
      return json({ error: `${WINDS[missingIndex]}家账号不存在或已删除` }, 404);
    if (new Set(accounts.map((account) => account!.id)).size !== 4)
      return json({ error: '四家必须是不同的玩家账号' }, 400);

    const matchId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    let code = resultRoomCode();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const exists = await db
        .prepare('SELECT id FROM rooms WHERE code = ?')
        .bind(code)
        .first();
      if (!exists) break;
      code = resultRoomCode();
    }
    const game = createGame(
      accounts.map((account, seat) => ({
        userId: account!.id,
        name: account!.username,
        seat,
      })),
    );
    game.players = game.players.map((player, seat) => ({
      ...player,
      score: players[seat].score,
      penalty: players[seat].penalty,
    }));
    const standings = calculateStandings(game.players);
    const finished = { ...game, finishedResults: standings };
    await db.batch([
      db
        .prepare(
          `INSERT INTO rooms (id, code, host_user_id, status, game_state, current_match_id, version, created_at, updated_at)
           VALUES (?, ?, ?, 'finished', ?, ?, 0, ?, ?)`,
        )
        .bind(
          roomId,
          code,
          auth.user.id,
          JSON.stringify(finished),
          matchId,
          now,
          now,
        ),
      db
        .prepare(
          'INSERT INTO matches (id, room_id, started_at, finished_at) VALUES (?, ?, ?, ?)',
        )
        .bind(matchId, roomId, now, now),
      ...standings.map((standing) =>
        db
          .prepare(
            'INSERT INTO match_results (match_id, user_id, final_score, rank, uma, penalty, total_pt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            matchId,
            standing.userId,
            standing.score,
            standing.place,
            standing.rankPoints,
            standing.penalty,
            standing.totalPoints,
            now,
          ),
      ),
    ]);
    return json({ ...(await adminOverview(db, auth.user.id)), created: true });
  }

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
      db.prepare('DELETE FROM yakuman_wins WHERE match_id = ?').bind(matchId),
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

  if (action === 'rename-user') {
    const targetUserId = typeof body?.userId === 'string' ? body.userId : '';
    const username =
      typeof body?.username === 'string'
        ? body.username.trim().normalize('NFC')
        : '';
    if (!targetUserId) return json({ error: '缺少账号信息' }, 400);
    if (targetUserId === auth.user.id)
      return json({ error: '管理员账号名固定，不能修改' }, 400);
    if (!/^[\p{L}\p{N}_-]{1,12}$/u.test(username))
      return json(
        { error: '账户名需为 1–12 个中文、字母、数字、下划线或短横线' },
        400,
      );

    const adminCredentials = getAdminCredentials();
    if (
      adminCredentials &&
      username.localeCompare(adminCredentials.username, undefined, {
        sensitivity: 'accent',
      }) === 0
    )
      return json({ error: '该名称为管理员账号，不能使用' }, 403);

    const [target, duplicate] = await Promise.all([
      db
        .prepare(
          `SELECT u.id, du.user_id AS deletedUserId
           FROM users u
           LEFT JOIN deleted_users du ON du.user_id = u.id
           WHERE u.id = ?`,
        )
        .bind(targetUserId)
        .first<{ id: string; deletedUserId: string | null }>(),
      db
        .prepare(
          'SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?',
        )
        .bind(username, targetUserId)
        .first<{ id: string }>(),
    ]);
    if (!target || target.deletedUserId)
      return json({ error: '该账号已经不存在' }, 404);
    if (duplicate) return json({ error: '该账户名已被使用' }, 409);

    await db
      .prepare('UPDATE users SET username = ? WHERE id = ?')
      .bind(username, targetUserId)
      .run();
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
