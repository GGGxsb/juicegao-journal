import PublicPage, { type PublicSearchParams } from '../components/public-page';
import { listingMetadata } from '../lib/seo';
export const generateMetadata = ({searchParams}:{searchParams:PublicSearchParams}) => listingMetadata('/articles', '博客',searchParams);
export const dynamic = 'force-dynamic';
export default function Articles({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="articles" searchParams={searchParams} />; }
