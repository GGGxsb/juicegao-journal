'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, List, X, ZoomOut } from 'lucide-react';
import type { MarkdownHeading } from './markdown';
import { observeReadingProgress } from './reader-progress';
import './article-reader.css';

type ReaderOverlay = { kind: 'toc' } | { kind: 'image'; src: string; alt: string };

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

/** The reading tools use the article body as their boundary, excluding comments. */
export default function ArticleReader({ postId, headings }: { postId: string; headings: MarkdownHeading[] }) {
  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '');
  const [pastTop, setPastTop] = useState(false);
  const [overlay, setOverlay] = useState<ReaderOverlay | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const desktopList = useRef<HTMLOListElement>(null);
  const mobileList = useRef<HTMLOListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigationFocus = useRef<HTMLElement | null>(null);
  const navigationFrame = useRef(0);
  const headingIds = headings.map(heading => heading.id).join('\u0000');
  const minimumLevel = headings.length ? Math.min(...headings.map(heading => heading.level)) : 1;
  const tocId = `reader-toc-${postId}`;

  useEffect(() => {
    setMounted(true);
    return () => cancelAnimationFrame(navigationFrame.current);
  }, []);

  useEffect(() => { setOverlay(null); }, [postId]);

  useEffect(() => {
    const body = document.querySelector<HTMLElement>('[data-article-body]');
    const main = body?.closest<HTMLElement>('[data-article-main]');
    if (!body || !main) return;
    const ids = headingIds ? headingIds.split('\u0000') : [];
    const sections = ids.map(id => body.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)).filter((element): element is HTMLElement => Boolean(element));
    const originalImages = new Map<HTMLImageElement, { attributes: Record<string, string | null>; enhanced: boolean }>();

    const enhanceImages = () => {
      for (const image of main.querySelectorAll<HTMLImageElement>('.article-cover, [data-article-body] img:not([data-reader-skip])')) {
        if (originalImages.has(image)) continue;
        const names = ['tabindex', 'role', 'aria-label', 'aria-haspopup'];
        originalImages.set(image, {
          attributes: Object.fromEntries(names.map(name => [name, image.getAttribute(name)])),
          enhanced: image.classList.contains('reader-zoomable'),
        });
        image.classList.add('reader-zoomable');
        image.setAttribute('tabindex', '0');
        image.setAttribute('role', 'button');
        image.setAttribute('aria-haspopup', 'dialog');
        image.setAttribute('aria-label', `放大图片：${image.alt.trim() || '文章图片'}`);
      }
    };
    const openImage = (event: Event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !originalImages.has(image)) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
      }
      if (event instanceof globalThis.MouseEvent && (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)) return;
      if (image.complete && image.naturalWidth === 0) return;
      event.preventDefault();
      returnFocus.current = image;
      setOverlay({ kind: 'image', src: image.currentSrc || image.src, alt: image.alt.trim() || '文章图片' });
    };
    enhanceImages();
    const progressObserver = observeReadingProgress(body, main, sections, state => {
      setProgress(state.progress); setPastTop(state.pastTop); setActiveId(state.activeId);
    });
    main.addEventListener('click', openImage);
    main.addEventListener('keydown', openImage);
    const imagesObserver = new MutationObserver(() => { enhanceImages(); progressObserver.invalidate(); });
    imagesObserver.observe(body, { childList: true, subtree: true });
    return () => {
      progressObserver.disconnect();
      main.removeEventListener('click', openImage);
      main.removeEventListener('keydown', openImage);
      imagesObserver.disconnect();
      for (const [image, original] of originalImages) {
        if (!original.enhanced) image.classList.remove('reader-zoomable');
        for (const [name, value] of Object.entries(original.attributes)) {
          if (value === null) image.removeAttribute(name);
          else image.setAttribute(name, value);
        }
      }
    };
  }, [postId, headingIds]);

  useEffect(() => {
    for (const list of [desktopList.current, mobileList.current]) {
      const active = list?.querySelector<HTMLElement>('[aria-current="location"]');
      if (!list || !active) continue;
      const activeBounds = active.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      if (activeBounds.top < listBounds.top || activeBounds.bottom > listBounds.bottom) {
        // Scroll only the TOC, so automatic highlighting never moves the article.
        list.scrollTop += activeBounds.top - listBounds.top - list.clientHeight / 2 + active.clientHeight / 2;
      }
    }
  }, [activeId, overlay]);

  useEffect(() => {
    const element = dialog.current;
    if (!overlay || !element) return;
    const previousFocus = returnFocus.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const html = document.documentElement;
    const body = document.body;
    const originalHtmlOverflow = html.style.overflow;
    const originalBodyOverflow = body.style.overflow;
    const originalPadding = body.style.paddingRight;
    const scrollbar = Math.max(0, window.innerWidth - html.clientWidth);
    if (scrollbar) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      html.style.overflow = originalHtmlOverflow;
      body.style.overflow = originalBodyOverflow;
      body.style.paddingRight = originalPadding;
      const focusTarget = navigationFocus.current ?? previousFocus;
      if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
      navigationFocus.current = null;
      returnFocus.current = null;
    };
  }, [overlay]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = document.querySelector<HTMLElement>('[data-article-body]')?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    event.preventDefault();
    if (overlay) {
      // Close the native modal immediately so the destination can receive focus.
      // The effect cleanup also chooses this target, regardless of paint timing.
      navigationFocus.current = target;
      dialog.current?.close();
    }
    setOverlay(null);
    cancelAnimationFrame(navigationFrame.current);
    navigationFrame.current = requestAnimationFrame(() => {
      const hash = `#${encodeURIComponent(id)}`;
      if (location.hash !== hash) history.pushState(null, '', hash);
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      // Move keyboard reading to the requested section without a second scroll.
      const hadTabIndex = target.hasAttribute('tabindex');
      if (!hadTabIndex) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (!hadTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      setActiveId(id);
    });
  }

  function toc(mobile: boolean) {
    return <nav className="reader-toc" aria-label={mobile ? '移动端文章目录' : '文章目录'}>
      <ol ref={mobile ? mobileList : desktopList} className="reader-toc-list">
        {headings.map(heading => <li key={heading.id} style={{ paddingInlineStart: `${Math.min(heading.level - minimumLevel, 4) * 12}px` }}>
          <a href={`#${encodeURIComponent(heading.id)}`} aria-current={activeId === heading.id ? 'location' : undefined} onClick={event => navigate(event, heading.id)}>{heading.text}</a>
        </li>)}
      </ol>
    </nav>;
  }

  function dismissBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    if (overlay?.kind === 'image') { setOverlay(null); return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOverlay(null);
  }

  return <>
    <div className="reader-page-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
    <aside className="reader-sidebar" aria-label="阅读工具">
      <div className="reader-sidebar-heading"><span>{headings.length ? '文章目录' : '阅读工具'}</span>{headings.length > 0 && <span className="reader-section-count">{headings.length}</span>}</div>
      {headings.length > 0 && toc(false)}
      <div className="reader-progress-caption"><span>阅读进度</span><span>{progress}%</span></div>
      <div className="reader-progress-track" role="progressbar" aria-label="文章阅读进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
    </aside>
    <div className={`reader-floating-tools${pastTop ? ' is-scrolled' : ''}`} role="group" aria-label="文章阅读操作">
      {headings.length > 0 && <button className="reader-mobile-toc" type="button" aria-label="打开文章目录" aria-haspopup="dialog" aria-expanded={overlay?.kind === 'toc'} aria-controls={tocId} onClick={event => { returnFocus.current = event.currentTarget; setOverlay({ kind: 'toc' }); }}><List size={19} aria-hidden="true" /><span>目录</span></button>}
      <button className="reader-back-top" type="button" aria-label={`返回顶部，阅读进度 ${progress}%`} onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}><ArrowUp size={18} aria-hidden="true" /><span>{progress}%</span></button>
    </div>
    {mounted && overlay && createPortal(<dialog ref={dialog} id={overlay.kind === 'toc' ? tocId : undefined} className={`reader-dialog ${overlay.kind === 'toc' ? 'reader-toc-dialog' : 'reader-image-dialog'}`} aria-label={overlay.kind === 'toc' ? '文章目录' : '图片预览'} onCancel={event => { event.preventDefault(); setOverlay(null); }} onClick={dismissBackdrop}>
      {overlay.kind === 'toc' ? <>
        <div className="reader-dialog-heading"><h2>文章目录</h2><button ref={closeButton} type="button" aria-label="关闭文章目录" onClick={() => setOverlay(null)}><X size={20} aria-hidden="true" /></button></div>
        <div className="reader-dialog-progress">已读 {progress}%<span>{headings.length} 个章节</span></div>
        {toc(true)}
      </> : <>
        <button ref={closeButton} className="reader-image-close" type="button" aria-label="关闭图片预览" onClick={() => setOverlay(null)}><X size={22} aria-hidden="true" /></button>
        <div className="reader-image-stage" onClick={event => { if (event.target === event.currentTarget) setOverlay(null); }}>
          <button className="reader-image-dismiss" type="button" aria-label="缩小图片并关闭预览" onClick={() => setOverlay(null)}><img src={overlay.src} alt={overlay.alt} /><span className="reader-image-hint"><ZoomOut size={15} aria-hidden="true" />点击图片或按 Esc 关闭</span></button>
        </div>
        <p className="reader-image-caption">{overlay.alt}</p>
      </>}
    </dialog>, document.body)}
  </>;
}
