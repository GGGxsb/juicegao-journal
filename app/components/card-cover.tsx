'use client';
import { useEffect, useRef } from 'react';
import { dominantCoverColor } from '../lib/cover-palette';
import './card-cover.css';

const paletteCache = new Map<string, string | null>();
function applyColor(element: HTMLImageElement, color: string | null) {
  const card = element.closest<HTMLElement>('[data-cover-card]');
  if (!card) return;
  card.classList.toggle('has-cover-color', Boolean(color));
  if (color) card.style.setProperty('--cover-color', color);
  else card.style.removeProperty('--cover-color');
}
function sample(element: HTMLImageElement) {
  if (!element.complete || !element.naturalWidth) return;
  const src = element.currentSrc || element.src;
  if (paletteCache.has(src)) { applyColor(element, paletteCache.get(src) ?? null); return; }
  let color: string | null = null;
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) {
      context.drawImage(element, 0, 0, 32, 32);
      color = dominantCoverColor(context.getImageData(0, 0, 32, 32).data);
    }
  } catch { /* Cross-origin images stay visible and use the default site palette. */ }
  if (paletteCache.size >= 128) paletteCache.delete(paletteCache.keys().next().value!);
  paletteCache.set(src, color); applyColor(element, color);
}
function measureCover(element: HTMLImageElement, container: HTMLSpanElement, side: boolean, width = container.clientWidth) {
  if (!element.naturalWidth) return;
  const height = width * element.naturalHeight / element.naturalWidth;
  // Read the limit before changing styles. Height-only resize notifications are ignored below.
  const limit = side ? parseFloat(getComputedStyle(container).getPropertyValue('--cover-limit')) || 520 : 0;
  const set = (target: HTMLElement, property: string, value: string) => {
    if (target.style.getPropertyValue(property) !== value) target.style.setProperty(property, value);
  };
  set(container, '--cover-natural-height', `${height}px`);
  if (side) {
    const card = container.closest<HTMLElement>('[data-cover-card]');
    if (card) set(card, '--post-cover-height', `${Math.min(height, limit)}px`);
  }
}

export default function CardCover({ src, className='', expandable=false }: { src: string; className?:string; expandable?:boolean | 'side' }) {
  const image = useRef<HTMLImageElement>(null);
  const frame = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = image.current;
    const container = frame.current;
    let lastWidth = -1;
    const measure = (width: number) => {
      if (!element?.naturalWidth || !container) return;
      if (Math.abs(lastWidth - width) < .5) return;
      lastWidth = width;
      measureCover(element, container, expandable === 'side', width);
    };
    if (container) container.hidden = Boolean(element?.complete && !element.naturalWidth);
    if (element) sample(element);
    if (container) measure(container.clientWidth);
    const observer = container ? new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    }) : null;
    if (container) observer?.observe(container);
    return () => {
      observer?.disconnect();
      if (element) applyColor(element, null);
      if (expandable === 'side') container?.closest<HTMLElement>('[data-cover-card]')?.style.removeProperty('--post-cover-height');
    };
  }, [src, expandable]);
  const cover = <img ref={image} onLoad={event => {
    sample(event.currentTarget);
    if (frame.current) {
      frame.current.hidden = false;
      measureCover(event.currentTarget, frame.current, expandable === 'side');
    }
  }} onError={() => {
    if (frame.current) {
      frame.current.hidden = true;
      if (expandable === 'side') frame.current.closest<HTMLElement>('[data-cover-card]')?.style.removeProperty('--post-cover-height');
    }
  }} className={`card-cover${className?` ${className}`:''}`} src={src} alt="" width={1200} height={630} loading="lazy" decoding="async" aria-hidden="true" />;
  return expandable ? <span className={`article-cover-reveal${expandable === 'side' ? ' article-cover-side' : ''}`} ref={frame}>{cover}</span> : cover;
}
