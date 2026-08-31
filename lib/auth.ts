import { getDb } from '@/lib/db';

export type SessionUser = { id: string; username: string };

const COOKIE_NAME = 'riichi_session';

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export async function getSessionUser(
  request: Request,
): Promise<SessionUser | null> {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const db = await getDb();
  const now = Date.now();
  const user = await db
    .prepare(
      `SELECT u.id, u.username
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    )
    .bind(token, now)
    .first<SessionUser>();
  if (user) {
    await db
      .prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
      .bind(now, user.id)
      .run();
  }
  return user ?? null;
}

export function sessionCookie(token: string) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers });
}

export async function requireUser(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return { user: null, response: json({ error: '请先登录' }, 401) };
  return { user, response: null };
}
