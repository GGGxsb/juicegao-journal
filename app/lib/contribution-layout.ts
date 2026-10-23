import type { ContributionDay } from './github-contribution-types';

/** Preserve GitHub's UTC date keys and pad only the incomplete boundary weeks. */
export function contributionLayout(days: ContributionDay[]) {
  if (!days.length) return { weeks: 0, cells: [], months: [] };
  const first = new Date(`${days[0].date}T00:00:00Z`), last = new Date(`${days[days.length - 1].date}T00:00:00Z`);
  const start = new Date(first); start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const weeks = Math.ceil(((last.getTime() - start.getTime()) / 86_400_000 + 1) / 7);
  const counts = new Map(days.map(day => [day.date, day]));
  const cells = Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, day: counts.get(key) ?? null, week: Math.floor(index / 7) };
  });
  const months = Array.from({ length: weeks }, (_, week) => {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + week * 7);
    return { week, label: date.getUTCDate() <= 7 ? `${date.getUTCMonth() + 1}月` : '' };
  });
  return { weeks, cells, months };
}
