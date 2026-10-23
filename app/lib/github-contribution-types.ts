export interface ContributionDay { date: string; count: number; level: number }
export interface ContributionCalendar { total: number; days: ContributionDay[] }
export type GithubContributions =
  | { status: 'disabled' }
  | { status: 'unavailable'; username: string }
  | { status: 'ready'; username: string; calendar: ContributionCalendar; updatedAt: string; stale: boolean };
