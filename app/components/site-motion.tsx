'use client';
import { useEffect } from 'react';

/** Progressive enhancement: content is visible even before hydration or without JS. */
export default function SiteMotion() {
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet<Element>(), animations = new Set<Animation>();
    const selector = '.journal .home-section,.journal .post-item,.journal .collection-directory>a,.journal .tag-directory>a,.journal .article-navigation';
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (preference.matches) return;
        const animation = entry.target.animate([
          { opacity: .45, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      });
    }, { threshold: .06 });
    const scan = () => document.querySelectorAll(selector).forEach(element => {
      if (seen.has(element)) return;
      seen.add(element); observer.observe(element);
    });
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(document.body, { childList: true, subtree: true });
    const reduce = () => { if (preference.matches) animations.forEach(animation => animation.cancel()); };
    preference.addEventListener('change', reduce);
    return () => { observer.disconnect(); mutations.disconnect(); animations.forEach(animation => animation.cancel()); preference.removeEventListener('change', reduce); };
  }, []);
  return null;
}
