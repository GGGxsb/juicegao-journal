import { notFound } from 'next/navigation';
import { ApiError } from './errors';
import { parseNavigationQuery } from './navigation';

export type NavigationSearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function publicNavigationQuery(searchParams: NavigationSearchParams) {
  const search = await searchParams;
  const params = new URLSearchParams();
  for (const key of ['page', 'pageSize']) {
    const value = search[key];
    if (Array.isArray(value)) notFound();
    if (value !== undefined) params.set(key, value);
  }
  try { return parseNavigationQuery(params); }
  catch (error) {
    if (error instanceof ApiError && error.status === 400) notFound();
    throw error;
  }
}
