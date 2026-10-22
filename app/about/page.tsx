import PublicPage, { type PublicSearchParams } from '../components/public-page';
export const dynamic = 'force-dynamic';
export default function About({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="about" searchParams={searchParams} />; }
