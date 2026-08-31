import { env } from 'cloudflare:workers';

import { getDb } from '@/lib/db';

export type SessionUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

const COOKIE_NAME = 'riichi_session';

type AdminEnvironment = {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
};

export function getAdminCredentials() {
  const runtime = env as unknown as AdminEnvironment;
  const username = runtime.ADMIN_USERNAME?.trim().normalize('NFC') ?? '';
  const password = runtime.ADMIN_PASSWORD ?? '';
  return username && password ? { username, password } : null;
}

async function passwordMatches(received: string, expected: string) {
  const encoder = new TextEncoder();
  const [receivedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const receivedBytes = new Uint8Array(receivedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = receivedBytes.length ^ expectedBytes.length;
  for (let index = 0; index < receivedBytes.length; index += 1)
    difference |= receivedBytes[index] ^ (expectedBytes[index] ?? 0);
  return difference === 0;
}

export async function verifyAdminLogin(username: string, password: string) {
  const credentials = getAdminCredentials();
  if (!credentials) return false;
  return (
    username.localeCompare(credentials.username, undefined, {
      sensitivity: 'accent',
    }) === 0 && (await passwordMatches(password, credentials.password))
  );
}

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
      `SELECT u.id, u.username,
            CASE WHEN a.token IS NULL THEN 0 ELSE 1 END AS isAdmin
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN admin_sessions a ON a.token = s.token
     WHERE s.token = ? AND s.expires_at > ?`,
    )
    .bind(token, now)
    .first<{ id: string; username: string; isAdmin: number }>();
  if (user) {
    await db
      .prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
      .bind(now, user.id)
      .run();
  }
  return user ? { ...user, isAdmin: Boolean(user.isAdmin) } : null;
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

export async function requireAdmin(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user || !auth.user.isAdmin)
    return {
      user: null,
      response:
        auth.response ?? json({ error: '只有管理员可以执行此操作' }, 403),
    };
  return { user: auth.user, response: null };
}
