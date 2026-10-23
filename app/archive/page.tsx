import PublicPage, { type PublicSearchParams } from '../components/public-page';
import { listingMetadata } from '../lib/seo';
export const generateMetadata = ({searchParams}:{searchParams:PublicSearchParams}) => listingMetadata('/archive', '归档',searchParams);
export const dynamic = 'force-dynamic';
export default function Archive({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="archive" searchParams={searchParams} />; }
