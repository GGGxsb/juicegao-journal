import PublicPage, { type PublicSearchParams } from '../components/public-page';
export const dynamic = 'force-dynamic';
export default function Articles({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="articles" searchParams={searchParams} />; }
