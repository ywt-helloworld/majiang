export type SeasonInfo = {
  id: string;
  label: string;
  startAt: number;
  endAt: number;
  isCurrent: boolean;
};

const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;
const ANCHOR_TOTAL_MONTH = 2026 * 12 + 7;
const SEASON_DAY = 8;
const MAX_LISTED_SEASONS = 24;

function seasonIndexAt(timestamp: number) {
  const local = new Date(timestamp + SHANGHAI_OFFSET);
  const totalMonth = local.getUTCFullYear() * 12 + local.getUTCMonth();
  let index = Math.floor((totalMonth - ANCHOR_TOTAL_MONTH) / 2);
  const candidate = seasonFromIndex(index, timestamp);
  if (timestamp < candidate.startAt) index -= 1;
  else if (timestamp >= candidate.endAt) index += 1;
  return index;
}

function seasonFromIndex(index: number, now: number): SeasonInfo {
  const totalMonth = ANCHOR_TOTAL_MONTH + index * 2;
  const year = Math.floor(totalMonth / 12);
  const monthIndex = totalMonth - year * 12;
  const endTotalMonth = totalMonth + 2;
  const endYear = Math.floor(endTotalMonth / 12);
  const endMonthIndex = endTotalMonth - endYear * 12;
  const startAt = Date.UTC(year, monthIndex, SEASON_DAY) - SHANGHAI_OFFSET;
  const endAt = Date.UTC(endYear, endMonthIndex, SEASON_DAY) - SHANGHAI_OFFSET;
  return {
    id: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    label: `${year}.${String(monthIndex + 1).padStart(2, '0')} 赛季`,
    startAt,
    endAt,
    isCurrent: now >= startAt && now < endAt,
  };
}

export function getSeasonAt(timestamp: number, now = Date.now()) {
  return seasonFromIndex(seasonIndexAt(timestamp), now);
}

export function getSeasonById(id: string, now = Date.now()) {
  const match = /^(\d{4})-(\d{2})$/.exec(id);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const difference = year * 12 + monthIndex - ANCHOR_TOTAL_MONTH;
  if (difference % 2 !== 0) return null;
  const season = seasonFromIndex(difference / 2, now);
  return season.id === id ? season : null;
}

export function listSeasons(
  earliestTimestamp: number | null,
  now = Date.now(),
) {
  const currentIndex = seasonIndexAt(now);
  const earliestIndex = seasonIndexAt(
    earliestTimestamp === null ? now : Math.min(earliestTimestamp, now),
  );
  const lastIndex = Math.max(
    earliestIndex,
    currentIndex - MAX_LISTED_SEASONS + 1,
  );
  const seasons: SeasonInfo[] = [];
  for (let index = currentIndex; index >= lastIndex; index -= 1)
    seasons.push(seasonFromIndex(index, now));
  return seasons;
}
