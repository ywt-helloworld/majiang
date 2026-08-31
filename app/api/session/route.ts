import {
  clearSessionCookie,
  getSessionUser,
  json,
  sessionCookie,
} from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return user ? json({ user }) : json({ error: '未登录' }, 401);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
  } | null;
  const username = body?.username?.trim().normalize('NFC') ?? '';
  if (!/^[\p{L}\p{N}_-]{1,12}$/u.test(username)) {
    return json(
      { error: '账户名需为 1–12 个中文、字母、数字、下划线或短横线' },
      400,
    );
  }

  const db = await getDb();
  const now = Date.now();
  await db
    .prepare('DELETE FROM sessions WHERE expires_at <= ?')
    .bind(now)
    .run();

  let user = await db
    .prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE')
    .bind(username)
    .first<{ id: string; username: string }>();
  if (!user) {
    user = { id: crypto.randomUUID(), username };
    await db
      .prepare(
        'INSERT INTO users (id, username, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
      )
      .bind(user.id, user.username, now, now)
      .run();
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    '-',
    '',
  );
  await db
    .prepare(
      'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(token, user.id, now, now + 30 * 24 * 60 * 60 * 1000)
    .run();
  return json({ user }, 200, { 'Set-Cookie': sessionCookie(token) });
}

export async function DELETE() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
