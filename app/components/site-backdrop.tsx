import { resumeImageUrl } from '../lib/resume-image';
import './site-backdrop.css';

export default function SiteBackdrop({ src }: { src: string }) {
  const image = resumeImageUrl(src);
  return <div className="site-backdrop" aria-hidden="true">
    {image && <img src={image} alt="" decoding="async" fetchPriority="low"/>}
  </div>;
}
