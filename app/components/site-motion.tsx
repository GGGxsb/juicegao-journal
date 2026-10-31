'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { observeHeaderScroll } from './header-scroll';

// Adapted for React from Axi-Theme's BaseLayout, Header and global.css.
// Source mapping and license: docs/axi-theme-reference.md.
export default function SiteMotion() {
  const pathname = usePathname();
  useEffect(() => {
    const journal = document.querySelector<HTMLElement>('.journal');
    if (!journal) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>(), particles = new Set<HTMLElement>();
    const seen = new WeakSet<Element>();
    const selector = '.journal .profile:not(.home-profile),.journal .listing-page>h1,.journal .home-section,.journal .post-item,.journal .tag-directory>a,.journal .article-main>h1,.journal .article-meta,.journal .reader-sidebar';
    const observer = new IntersectionObserver(entries => {
      let index = 0;
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (preference.matches) return;
        const animation = entry.target.animate([
          { opacity: 0, transform: 'translateY(32px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 300, delay: Math.min(50 + index++ * 50, 150), easing: 'ease-out', fill: 'backwards' });
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      });
    }, { threshold: .06 });
    const scan = (root: ParentNode) => {
      const elements = [...root.querySelectorAll(selector)];
      if (root instanceof Element && root.matches(selector)) elements.push(root);
      elements.forEach(element => {
        if (seen.has(element)) return;
        seen.add(element); observer.observe(element);
      });
    };
    scan(journal);

    // Axi's 10 radial particles + 4 scattered particles, lasting 1.1 seconds.
    const colors = ['#ffb3ba','#a8d8ff','#ffe66d','#d4a5ff','#a8e6a8','#ffcc99','#b3deff','#f5c2c7','#c3e6c3','#ffe8b3'];
    const darkColors = ['#ff6b8a','#4fc3f7','#ffd54f','#ba68c8','#81c784','#ffb74d','#64b5f6','#f48fb1','#a5d6a7','#ffe082'];
    const burst = (event: MouseEvent) => {
      if (preference.matches || event.detail === 0 || event.button !== 0 || !(event.target instanceof Element)) return;
      if (!event.target.closest('.journal') || event.target.closest('input,textarea,select,[contenteditable=true],.search-dialog,.sponsor-card')) return;
      const palette = document.documentElement.dataset.theme === 'dark' ? darkColors : colors;
      for (let i = 0; i < 14 && particles.size < 84; i++) {
        const angle = i < 10 ? Math.PI * 2 * i / 10 : Math.random() * Math.PI * 2;
        const distance = 18 + Math.random() * (i < 10 ? 8 : 10);
        const dx = Math.cos(angle) * distance, dy = Math.sin(angle) * distance;
        const dot = document.createElement('span'), size = 8 + Math.random() * 6;
        dot.className = 'axi-click-particle'; dot.setAttribute('aria-hidden','true');
        Object.assign(dot.style, { left: `${event.clientX}px`, top: `${event.clientY}px`, width: `${size}px`, height: `${size}px`, background: palette[i % 10] });
        document.body.append(dot); particles.add(dot);
        const animation = dot.animate([
          { opacity: 1, transform: 'translate(-50%,-50%) scale(.4)', offset: 0 },
          { opacity: 1, transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1.3)`, offset: .15 },
          { opacity: .8, transform: `translate(calc(-50% + ${dx*2.5}px),calc(-50% + ${dy*2.5}px)) scale(1)`, offset: .6 },
          { opacity: 0, transform: `translate(calc(-50% + ${dx*3.5}px),calc(-50% + ${dy*3.5}px)) scale(.3)` },
        ], { duration: 1100, delay: i * 12, easing: 'ease-out' });
        animations.add(animation);
        const remove = () => { animations.delete(animation); particles.delete(dot); dot.remove(); };
        animation.finished.then(remove, remove);
      }
    };
    document.addEventListener('click', burst);

    const header = journal.querySelector<HTMLElement>('.site-header-shell');
    const stopHeader = header ? observeHeaderScroll(header, preference) : undefined;
    const reduce = () => {
      if (preference.matches) animations.forEach(animation => animation.cancel());
    };
    preference.addEventListener('change', reduce);
    return () => {
      observer.disconnect(); stopHeader?.();
      document.removeEventListener('click', burst);
      animations.forEach(animation => animation.cancel()); particles.forEach(dot => dot.remove());
      preference.removeEventListener('change', reduce);
    };
  }, [pathname]);
  return null;
}
