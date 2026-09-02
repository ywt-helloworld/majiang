import { getAdminCredentials, json, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (auth.user.isAdmin)
    return json({ error: '管理员账号名固定，不能修改' }, 403);

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

  const adminCredentials = getAdminCredentials();
  if (
    adminCredentials &&
    username.localeCompare(adminCredentials.username, undefined, {
      sensitivity: 'accent',
    }) === 0
  )
    return json({ error: '该名称为管理员账号，不能使用' }, 403);

  const db = await getDb();
  const duplicate = await db
    .prepare(
      'SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?',
    )
    .bind(username, auth.user.id)
    .first<{ id: string }>();
  if (duplicate) return json({ error: '该账户名已被使用' }, 409);

  await db
    .prepare('UPDATE users SET username = ?, last_seen_at = ? WHERE id = ?')
    .bind(username, Date.now(), auth.user.id)
    .run();
  return json({ user: { ...auth.user, username } });
}
