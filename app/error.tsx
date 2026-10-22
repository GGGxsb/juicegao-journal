'use client';
export default function ErrorPage({reset}:{reset:()=>void}) { return <main className="error-page"><span>稍等一下</span><h1>页面暂时没有加载出来</h1><p>可以重新试试，或稍后回来。</p><button onClick={reset}>重新加载</button></main>; }
