import PublicPage, { type PublicSearchParams } from '../components/public-page';
import { listingMetadata } from '../lib/seo';
export const generateMetadata = ({searchParams}:{searchParams:PublicSearchParams}) => listingMetadata('/notes', '随记',searchParams);
export const dynamic = 'force-dynamic';
export default function Notes({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="notes" searchParams={searchParams} />; }
