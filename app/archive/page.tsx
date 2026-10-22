import PublicPage, { type PublicSearchParams } from '../components/public-page';
export const dynamic = 'force-dynamic';
export default function Archive({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="archive" searchParams={searchParams} />; }
