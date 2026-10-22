import PublicPage, { type PublicSearchParams } from './components/public-page';
export const dynamic = 'force-dynamic';
export default function Home({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="home" searchParams={searchParams} />; }
