'use client';
import { useEffect } from 'react';

// Adapted for React from Axi-Theme's BaseLayout, Header and global.css.
// Source mapping and license: docs/axi-theme-reference.md.
export default function SiteMotion() {
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>(), particles = new Set<HTMLElement>();
    const seen = new WeakSet<Element>();
    const selector = '.journal .profile,.journal .listing-page>h1,.journal .home-section,.journal .post-item,.journal .tag-directory>a,.journal .article-main>h1,.journal .article-meta,.journal .reader-sidebar';
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
    scan(document);
    const mutations = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element && !node.classList.contains('axi-click-particle')) scan(node);
    })));
    mutations.observe(document.body, { childList: true, subtree: true });

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

    // The navigation narrows after 20px, hides below 600px, and returns on upward scroll.
    let previousY = window.scrollY, frame = 0;
    const measure = () => {
      frame = 0;
      const y = window.scrollY, header = document.querySelector<HTMLElement>('.site-header-shell');
      if (header) {
        header.dataset.scrolled = String(y > 20);
        header.dataset.show = String(preference.matches || y < 600 || y < previousY || (y === previousY && header.dataset.show !== 'false'));
      }
      const glow = document.querySelector<HTMLElement>('.article-cover-glow');
      if (glow) glow.style.opacity = String(preference.matches ? .3 : y >= innerHeight / 3 ? .15 : y >= innerHeight * 2 / 9 ? .3 : y >= innerHeight / 9 ? .45 : .6);
      previousY = y;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    const reduce = () => {
      if (preference.matches) animations.forEach(animation => animation.cancel());
      measure();
    };
    preference.addEventListener('change', reduce);
    return () => {
      observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame);
      document.removeEventListener('click', burst); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
      animations.forEach(animation => animation.cancel()); particles.forEach(dot => dot.remove());
      preference.removeEventListener('change', reduce);
    };
  }, []);
  return null;
}
