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
export default function CardCover({ src, className='' }: { src: string; className?:string }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = image.current;
    if (element) sample(element);
    return () => { if (element) applyColor(element, null); };
  }, [src]);
  return <img ref={image} onLoad={event => sample(event.currentTarget)} className={`card-cover${className?` ${className}`:''}`} src={src} alt="" width={1200} height={630} loading="lazy" decoding="async" aria-hidden="true" />;
}
