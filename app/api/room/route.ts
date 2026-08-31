import { json, requireUser, type SessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  applyGameAction,
  calculateStandings,
  createGame,
  type GameAction,
  type GameState,
} from '@/lib/game';

type RoomRow = {
  id: string;
  code: string;
  hostUserId: string;
  status: 'waiting' | 'playing' | 'finished';
  gameState: string | null;
  currentMatchId: string | null;
  version: number;
};

type MemberRow = {
  userId: string;
  username: string;
  seat: number;
  ready: number;
};

type DealerMode = 'system' | 'host';

function parseStoredRoomState(room: RoomRow) {
  if (!room.gameState)
    return {
      gameState: null,
      dealerMode: 'system' as DealerMode,
      dealerUserId: null as string | null,
    };
  const stored = JSON.parse(room.gameState) as
    | GameState
    | {
        dealerMode?: DealerMode;
        dealerUserId?: string | null;
        seatMode?: string;
      };
  if (room.status === 'waiting')
    return {
      gameState: null,
      dealerMode:
        'dealerMode' in stored && stored.dealerMode === 'host'
          ? 'host'
          : 'system',
      dealerUserId:
        'dealerUserId' in stored && typeof stored.dealerUserId === 'string'
          ? stored.dealerUserId
          : null,
    };
  return {
    gameState: stored as GameState,
    dealerMode: 'system' as DealerMode,
    dealerUserId: null as string | null,
  };
}

function shuffleMembers(members: MemberRow[]) {
  const shuffled = [...members];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const other = random[0] % (index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

async function getRoom(db: D1Database, roomId: string, userId: string) {
  const membership = await db
    .prepare(
      'SELECT active FROM room_members WHERE room_id = ? AND user_id = ?',
    )
    .bind(roomId, userId)
    .first<{ active: number }>();
  if (!membership?.active) return null;
  const room = await db
    .prepare(
      `SELECT id, code, host_user_id AS hostUserId, status,
            game_state AS gameState, current_match_id AS currentMatchId, version
     FROM rooms WHERE id = ?`,
    )
    .bind(roomId)
    .first<RoomRow>();
  if (!room) return null;
  const storedState = parseStoredRoomState(room);
  const members = await db
    .prepare(
      `SELECT rm.user_id AS userId, u.username, rm.seat, rm.ready
     FROM room_members rm JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = ? AND rm.active = 1 ORDER BY rm.seat`,
    )
    .bind(roomId)
    .all<MemberRow>();
  return {
    ...room,
    ...storedState,
    members: members.results,
    meId: userId,
  };
}

async function getActiveRoomId(db: D1Database, userId: string) {
  const row = await db
    .prepare(
      'SELECT room_id AS roomId FROM room_members WHERE user_id = ? AND active = 1 LIMIT 1',
    )
    .bind(userId)
    .first<{ roomId: string }>();
  return row?.roomId ?? null;
}

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join('');
}

async function respondRoom(
  db: D1Database,
  roomId: string,
  user: SessionUser,
  status = 200,
) {
  const room = await getRoom(db, roomId, user.id);
  return room
    ? json({ room }, status)
    : json({ error: '房间不存在或你已离开' }, 404);
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const roomId = new URL(request.url).searchParams.get('id');
  if (!roomId) return json({ error: '缺少房间编号' }, 400);
  return respondRoom(await getDb(), roomId, auth.user);
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const user = auth.user;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const db = await getDb();
  const now = Date.now();

  if (action === 'create') {
    const active = await getActiveRoomId(db, user.id);
    if (active)
      return json({ error: '你已经在一个房间中', roomId: active }, 409);
    let code = roomCode();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const exists = await db
        .prepare('SELECT id FROM rooms WHERE code = ?')
        .bind(code)
        .first();
      if (!exists) break;
      code = roomCode();
    }
    const roomId = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO rooms (id, code, host_user_id, status, version, created_at, updated_at) VALUES (?, ?, ?, 'waiting', 0, ?, ?)`,
        )
        .bind(roomId, code, user.id, now, now),
      db
        .prepare(
          'INSERT INTO room_members (room_id, user_id, seat, ready, active, joined_at) VALUES (?, ?, 0, 0, 1, ?)',
        )
        .bind(roomId, user.id, now),
    ]);
    return respondRoom(db, roomId, user, 201);
  }

  if (action === 'join') {
    const active = await getActiveRoomId(db, user.id);
    if (active)
      return json({ error: '你已经在一个房间中', roomId: active }, 409);
    const code =
      typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    const room = await db
      .prepare(`SELECT id, status FROM rooms WHERE code = ?`)
      .bind(code)
      .first<{ id: string; status: string }>();
    if (!room || room.status !== 'waiting')
      return json({ error: '房间不存在或已经开局' }, 404);
    const members = await db
      .prepare(
        'SELECT seat FROM room_members WHERE room_id = ? AND active = 1 ORDER BY seat',
      )
      .bind(room.id)
      .all<{ seat: number }>();
    if (members.results.length >= 4) return json({ error: '房间已满' }, 409);
    const occupied = new Set(members.results.map((item) => item.seat));
    const seat = [0, 1, 2, 3].find((item) => !occupied.has(item)) ?? 3;
    await db
      .prepare(
        'DELETE FROM room_members WHERE room_id = ? AND active = 0 AND seat = ? AND user_id != ?',
      )
      .bind(room.id, seat, user.id)
      .run();
    const previous = await db
      .prepare(
        'SELECT user_id AS userId FROM room_members WHERE room_id = ? AND user_id = ?',
      )
      .bind(room.id, user.id)
      .first<{ userId: string }>();
    if (previous) {
      await db
        .prepare(
          'UPDATE room_members SET seat = ?, ready = 0, active = 1, joined_at = ? WHERE room_id = ? AND user_id = ?',
        )
        .bind(seat, now, room.id, user.id)
        .run();
    } else {
      await db
        .prepare(
          'INSERT INTO room_members (room_id, user_id, seat, ready, active, joined_at) VALUES (?, ?, ?, 0, 1, ?)',
        )
        .bind(room.id, user.id, seat, now)
        .run();
    }
    await db
      .prepare(
        'UPDATE rooms SET updated_at = ?, version = version + 1 WHERE id = ?',
      )
      .bind(now, room.id)
      .run();
    return respondRoom(db, room.id, user);
  }

  const roomId = typeof body?.roomId === 'string' ? body.roomId : '';
  if (!roomId) return json({ error: '缺少房间编号' }, 400);
  const room = await getRoom(db, roomId, user.id);
  if (!room) return json({ error: '房间不存在或你已离开' }, 404);

  if (action === 'ready') {
    if (room.status !== 'waiting') return json({ error: '对局已经开始' }, 409);
    const ready = body?.ready ? 1 : 0;
    await db.batch([
      db
        .prepare(
          'UPDATE room_members SET ready = ? WHERE room_id = ? AND user_id = ?',
        )
        .bind(ready, roomId, user.id),
      db
        .prepare(
          'UPDATE rooms SET updated_at = ?, version = version + 1 WHERE id = ?',
        )
        .bind(now, roomId),
    ]);
    return respondRoom(db, roomId, user);
  }

  if (action === 'dealer-mode') {
    if (room.hostUserId !== user.id)
      return json({ error: '只有房主可以选择定庄方式' }, 403);
    if (room.status !== 'waiting') return json({ error: '对局已经开始' }, 409);
    if (body?.dealerMode !== 'system' && body?.dealerMode !== 'host')
      return json({ error: '请选择有效定庄方式' }, 400);
    const dealerMode: DealerMode = body.dealerMode;
    await db.batch([
      db
        .prepare(
          'UPDATE room_members SET ready = 0 WHERE room_id = ? AND active = 1',
        )
        .bind(roomId),
      db
        .prepare(
          'UPDATE rooms SET game_state = ?, updated_at = ?, version = version + 1 WHERE id = ?',
        )
        .bind(JSON.stringify({ dealerMode, dealerUserId: null }), now, roomId),
    ]);
    return respondRoom(db, roomId, user);
  }

  if (action === 'choose-dealer') {
    if (room.hostUserId !== user.id)
      return json({ error: '只有房主可以指定庄家' }, 403);
    if (room.status !== 'waiting') return json({ error: '对局已经开始' }, 409);
    if (room.dealerMode !== 'host')
      return json({ error: '当前由系统自动定庄' }, 409);
    const dealerUserId =
      typeof body?.dealerUserId === 'string' ? body.dealerUserId : '';
    if (!room.members.some((member) => member.userId === dealerUserId))
      return json({ error: '请选择房间内的玩家作为庄家' }, 400);
    await db.batch([
      db
        .prepare(
          'UPDATE room_members SET ready = 0 WHERE room_id = ? AND active = 1',
        )
        .bind(roomId),
      db
        .prepare(
          'UPDATE rooms SET game_state = ?, updated_at = ?, version = version + 1 WHERE id = ?',
        )
        .bind(
          JSON.stringify({ dealerMode: 'host', dealerUserId }),
          now,
          roomId,
        ),
    ]);
    return respondRoom(db, roomId, user);
  }

  if (action === 'kick') {
    if (room.hostUserId !== user.id)
      return json({ error: '只有房主可以移出玩家' }, 403);
    if (room.status !== 'waiting')
      return json({ error: '只能在对局开始前移出玩家' }, 409);
    const targetUserId =
      typeof body?.targetUserId === 'string' ? body.targetUserId : '';
    if (!targetUserId || targetUserId === user.id)
      return json({ error: '不能移出房主自己' }, 400);
    if (!room.members.some((member) => member.userId === targetUserId))
      return json({ error: '该玩家已经不在房间中' }, 404);
    const waitingState =
      room.dealerMode === 'host' && room.dealerUserId === targetUserId
        ? JSON.stringify({ dealerMode: 'host', dealerUserId: null })
        : JSON.stringify({
            dealerMode: room.dealerMode,
            dealerUserId: room.dealerUserId,
          });
    await db.batch([
      db
        .prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?')
        .bind(roomId, targetUserId),
      db
        .prepare(
          'UPDATE rooms SET game_state = ?, updated_at = ?, version = version + 1 WHERE id = ?',
        )
        .bind(waitingState, now, roomId),
    ]);
    return respondRoom(db, roomId, user);
  }

  if (action === 'start') {
    if (room.hostUserId !== user.id)
      return json({ error: '只有房主可以开始' }, 403);
    if (
      room.status !== 'waiting' ||
      room.members.length !== 4 ||
      room.members.some((member) => !member.ready)
    )
      return json({ error: '需要四位玩家全部准备' }, 409);
    const selectedDealer = room.members.find(
      (member) => member.userId === room.dealerUserId,
    );
    if (room.dealerMode === 'host' && !selectedDealer)
      return json({ error: '请先指定一位玩家作为东家和庄家' }, 409);
    const matchId = crypto.randomUUID();
    const seatedMembers =
      room.dealerMode === 'system'
        ? shuffleMembers(room.members).map((member, seat) => ({
            ...member,
            seat,
          }))
        : [
            selectedDealer!,
            ...shuffleMembers(
              room.members.filter(
                (member) => member.userId !== selectedDealer!.userId,
              ),
            ),
          ].map((member, seat) => ({ ...member, seat }));
    const game = createGame(
      seatedMembers.map((member) => ({
        userId: member.userId,
        name: member.username,
        seat: member.seat,
      })),
    );
    await db.batch([
      db
        .prepare(
          'INSERT INTO matches (id, room_id, started_at) VALUES (?, ?, ?)',
        )
        .bind(matchId, roomId, now),
      db
        .prepare(
          `UPDATE rooms SET status = 'playing', game_state = ?, current_match_id = ?, version = version + 1, updated_at = ? WHERE id = ?`,
        )
        .bind(JSON.stringify(game), matchId, now, roomId),
    ]);
    return respondRoom(db, roomId, user);
  }

  if (action === 'score') {
    if (room.status !== 'playing' || !room.gameState)
      return json({ error: '对局尚未开始' }, 409);
    const clientVersion = Number(body?.version);
    if (clientVersion !== room.version)
      return json({ error: '分数已被其他玩家更新，请重试' }, 409);
    try {
      const next = applyGameAction(
        room.gameState,
        body?.gameAction as GameAction,
      );
      const result = await db
        .prepare(
          'UPDATE rooms SET game_state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        )
        .bind(JSON.stringify(next), now, roomId, room.version)
        .run();
      if (!result.meta.changes)
        return json({ error: '分数刚刚发生变化，请重试' }, 409);
      return respondRoom(db, roomId, user);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : '无法记录本局' },
        400,
      );
    }
  }

  if (action === 'finish') {
    if (room.hostUserId !== user.id)
      return json({ error: '只有房主可以结束半庄' }, 403);
    if (room.status !== 'playing' || !room.gameState || !room.currentMatchId)
      return json({ error: '没有进行中的对局' }, 409);
    const standings = calculateStandings(room.gameState.players);
    const finished = { ...room.gameState, finishedResults: standings };
    const inserts = standings.map((item) =>
      db
        .prepare(
          'INSERT INTO match_results (match_id, user_id, final_score, rank, uma, penalty, total_pt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          room.currentMatchId,
          item.userId,
          item.score,
          item.place,
          item.rankPoints,
          item.penalty,
          item.totalPoints,
          now,
        ),
    );
    await db.batch([
      ...inserts,
      db
        .prepare('UPDATE matches SET finished_at = ? WHERE id = ?')
        .bind(now, room.currentMatchId),
      db
        .prepare(
          `UPDATE rooms SET status = 'finished', game_state = ?, version = version + 1, updated_at = ? WHERE id = ?`,
        )
        .bind(JSON.stringify(finished), now, roomId),
    ]);
    return respondRoom(db, roomId, user);
  }

  if (action === 'leave') {
    if (room.status === 'playing')
      return json({ error: '对局进行中，不能离开房间' }, 409);
    const others = room.members.filter((member) => member.userId !== user.id);
    const statements = [
      db
        .prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?')
        .bind(roomId, user.id),
    ];
    if (room.hostUserId === user.id && others.length)
      statements.push(
        db
          .prepare(
            'UPDATE rooms SET host_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ?',
          )
          .bind(others[0].userId, now, roomId),
      );
    else if (!others.length)
      statements.push(
        db
          .prepare(
            `UPDATE rooms SET status = 'finished', updated_at = ?, version = version + 1 WHERE id = ?`,
          )
          .bind(now, roomId),
      );
    else
      statements.push(
        db
          .prepare(
            'UPDATE rooms SET updated_at = ?, version = version + 1 WHERE id = ?',
          )
          .bind(now, roomId),
      );
    await db.batch(statements);
    return json({ ok: true });
  }

  return json({ error: '未知操作' }, 400);
}
