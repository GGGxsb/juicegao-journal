import PublicPage, { type PublicSearchParams } from '../components/public-page';
import { pageMetadata } from '../lib/seo';
export const generateMetadata = () => pageMetadata('/about', '关于');
export const dynamic = 'force-dynamic';
export default function About({ searchParams }: { searchParams: PublicSearchParams }) { return <PublicPage view="about" searchParams={searchParams} />; }
