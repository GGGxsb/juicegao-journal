'use client';

// React adaptation of Axi-Theme's projects sponsorship (Apache-2.0).
// Source and modifications: docs/axi-theme-reference.md.
import { useState } from 'react';
import { resumeImageUrl } from '../lib/resume-image';
import SponsorIcon from './sponsor-icon';
import './sponsor.css';

function SponsorCard({ method, src, label }: { method: 'wechat' | 'alipay'; src: string; label: string }) {
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  return <figure className="sponsor-method">
    <button type="button" className={`sponsor-card${revealed ? ' is-revealed' : ''}`} aria-label={`${label}赞助二维码，点击切换显示`} aria-pressed={revealed} disabled={failed} onClick={() => setRevealed(value => !value)}>
      <img src={src} alt={`${label}赞助二维码`} width={240} height={240} loading="lazy" decoding="async" onError={() => setFailed(true)} hidden={failed}/>
      {failed ? <span className="sponsor-image-error" role="status">二维码暂时无法显示</span> : <span className="sponsor-logo" aria-hidden="true"><SponsorIcon method={method}/></span>}
    </button>
    <figcaption>{label}</figcaption>
  </figure>;
}

export default function Sponsor({ wechat, alipay }: { wechat?: string; alipay?: string }) {
  const methods = [
    { method: 'wechat' as const, label: '微信', src: resumeImageUrl(wechat) },
    { method: 'alipay' as const, label: '支付宝', src: resumeImageUrl(alipay) },
  ].filter((item): item is typeof item & {src: string} => Boolean(item.src));
  if (!methods.length) return null;
  return <section className="about-sponsor" aria-labelledby="sponsor-heading" id="sponsor">
    <h2 id="sponsor-heading">Sponsor</h2>
    <div className="sponsor-methods">{methods.map(item => <SponsorCard key={`${item.method}:${item.src}`} {...item}/>)}</div>
  </section>;
}
