import {
  clearSessionCookie,
  getAdminCredentials,
  getSessionUser,
  json,
  sessionCookie,
  verifyAdminLogin,
} from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return user ? json({ user }) : json({ error: '未登录' }, 401);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    adminLogin?: boolean;
    adminPassword?: string;
  } | null;
  const username = body?.username?.trim().normalize('NFC') ?? '';
  if (!/^[\p{L}\p{N}_-]{1,12}$/u.test(username)) {
    return json(
      { error: '账户名需为 1–12 个中文、字母、数字、下划线或短横线' },
      400,
    );
  }

  const adminCredentials = getAdminCredentials();
  const adminLogin = body?.adminLogin === true;
  const reservedAdminName =
    adminCredentials &&
    username.localeCompare(adminCredentials.username, undefined, {
      sensitivity: 'accent',
    }) === 0;
  if (adminLogin) {
    if (!adminCredentials) return json({ error: '管理者账号尚未配置' }, 503);
    if (
      !reservedAdminName ||
      !(await verifyAdminLogin(username, body?.adminPassword ?? ''))
    )
      return json({ error: '管理员账号或密码错误' }, 403);
  } else if (reservedAdminName) {
    return json({ error: '该账号请从管理者入口登录' }, 403);
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
  const statements = [
    db
      .prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .bind(token, user.id, now, now + 30 * 24 * 60 * 60 * 1000),
  ];
  if (adminLogin)
    statements.push(
      db
        .prepare('INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)')
        .bind(token, now),
    );
  await db.batch(statements);
  return json({ user: { ...user, isAdmin: adminLogin } }, 200, {
    'Set-Cookie': sessionCookie(token),
  });
}

export async function DELETE() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
