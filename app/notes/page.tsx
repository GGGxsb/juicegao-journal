import PublicPage, { type PublicSearchParams } from '../components/public-page';
export const dynamic = 'force-dynamic';
export default function Notes({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="notes" searchParams={searchParams} />; }
