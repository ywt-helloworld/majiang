import { json, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ensureCurrentSeason, getSeasonById } from '@/lib/season';
import { getLeaderboard, getYakumanLeaderboard } from '@/lib/stats';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const db = await getDb();
  const requested = new URL(request.url).searchParams.get('season');
  const season =
    requested === 'all'
      ? null
      : requested
        ? await getSeasonById(db, requested)
        : await ensureCurrentSeason(db);
  if (requested !== 'all' && !season)
    return json({ error: '赛季编号无效' }, 400);
  return json({
    seasonId: season?.id ?? 'all',
    leaderboard: await getLeaderboard(db, season),
    yakumanLeaderboard: await getYakumanLeaderboard(db, season),
  });
}
