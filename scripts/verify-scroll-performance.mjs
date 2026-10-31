/** Exercise the real scroll handlers with counted layout reads and a deterministic frame clock. */
import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';

const unregister = register();
const originals = Object.fromEntries(['window', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const frames = new Map(), resizeObservers = new Set();
let frameId = 0;
const viewport = Object.assign(new EventTarget(), { scrollY: 0, innerHeight: 900 });
const preference = Object.assign(new EventTarget(), { matches: false });
Object.assign(globalThis, {
  window: viewport,
  requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
  cancelAnimationFrame(id) { frames.delete(id); },
  ResizeObserver: class {
    constructor(callback) { this.callback = callback; resizeObservers.add(this); }
    observe() {}
    disconnect() { resizeObservers.delete(this); }
  },
});
const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); };
const scroll = y => { viewport.scrollY = y; viewport.dispatchEvent(new Event('scroll')); flush(); };
const cleanups = [];
try {
  const { observeHeaderScroll } = await import('../app/components/header-scroll.ts');
  const writes = [];
  const header = { dataset: new Proxy({}, { set(target, key, value) { writes.push([key, value]); target[key] = value; return true; } }) };
  const stopHeader = observeHeaderScroll(header, preference); cleanups.push(stopHeader);
  assert.deepEqual({ ...header.dataset }, { scrolled: 'false', show: 'true' });
  for (let y = 21; y <= 500; y += 3) scroll(y);
  assert.equal(writes.length, 3, 'Steady scrolling only changes the scrolled attribute once.');
  scroll(700); assert.equal(header.dataset.show, 'false');
  scroll(699); scroll(700); scroll(698);
  assert.equal(header.dataset.show, 'false', 'Tiny direction changes must not flicker the header.');
  scroll(690); assert.equal(header.dataset.show, 'true');
  scroll(692); assert.equal(header.dataset.show, 'true');
  scroll(701); assert.equal(header.dataset.show, 'false');
  preference.matches = true; preference.dispatchEvent(new Event('change')); flush();
  assert.equal(header.dataset.show, 'true');
  preference.matches = false; scroll(0);
  assert.equal(header.dataset.scrolled, 'false');
  for (let i = 0; i < 12; i++) viewport.dispatchEvent(new Event('scroll'));
  assert.equal(frames.size, 1, 'Events within one frame share one callback.');
  stopHeader(); assert.equal(frames.size, 0);
  const writeCount = writes.length; scroll(900); assert.equal(writes.length, writeCount);
  console.log('PASS navigation changes attributes only at state transitions, ignores jitter, respects reduced motion and removes its listener.');

  const { observeReadingProgress } = await import('../app/components/reader-progress.ts');
  viewport.scrollY = 0;
  let layoutReads = 0, bodyTop = 500, bodyHeight = 18000;
  const fontReady = Promise.withResolvers();
  const body = { ownerDocument: { fonts: { ready: fontReady.promise } }, getBoundingClientRect() { layoutReads++; return { top: bodyTop - viewport.scrollY, height: bodyHeight }; } };
  const main = new EventTarget();
  let headingShift = 0;
  const sections = Array.from({ length: 500 }, (_, index) => ({ id: `heading-${index}`, getBoundingClientRect() { layoutReads++; return { top: bodyTop + index * 35 + headingShift - viewport.scrollY }; } }));
  const states = [];
  const progress = observeReadingProgress(body, main, sections, state => states.push(state));
  cleanups.push(() => progress.disconnect());
  const expected = () => {
    const y = viewport.scrollY, height = viewport.innerHeight, line = Math.min(160, Math.max(64, height * .2));
    const start = Math.max(0, bodyTop - line), finish = bodyTop + bodyHeight - height + 24;
    const percentage = finish <= start ? (bodyTop + bodyHeight - y <= height - 24 ? 100 : 0) : Math.round(Math.min(1, Math.max(0, (y - start) / (finish - start))) * 100);
    let current = sections[0]?.id ?? '';
    for (let i = 0; i < sections.length; i++) {
      if (bodyTop + i * 35 + headingShift > y + line + 8) break;
      current = sections[i].id;
    }
    if (bodyTop + bodyHeight - y <= height && percentage === 100 && sections.length) current = sections.at(-1).id;
    return { progress: percentage, activeId: current, pastTop: y > 180 };
  };
  for (let y = 0; y < 20000; y += 97) { scroll(y); assert.deepEqual(states.at(-1), expected()); }
  for (let y = 19000; y >= 0; y -= 131) { scroll(y); assert.deepEqual(states.at(-1), expected()); }
  assert.equal(layoutReads, 501, 'Scrolling in either direction must not remeasure the body or any heading.');
  const unchanged = states.length; scroll(viewport.scrollY); assert.equal(states.length, unchanged, 'Identical state must not schedule React updates.');
  console.log('PASS 500-heading article: hundreds of scroll frames reuse 501 initial layout reads; progress and active headings match the original behavior in both directions.');

  bodyTop += 80; bodyHeight += 200; scroll(5000);
  main.dispatchEvent(new Event('load')); flush();
  assert.equal(layoutReads, 1002); assert.deepEqual(states.at(-1), expected());
  headingShift += 200;
  for (const observer of resizeObservers) observer.callback();
  flush(); assert.equal(layoutReads, 1503); assert.deepEqual(states.at(-1), expected());
  viewport.innerHeight = 600; viewport.dispatchEvent(new Event('resize')); flush();
  assert.equal(layoutReads, 2004); assert.deepEqual(states.at(-1), expected());
  headingShift -= 60; fontReady.resolve(); await fontReady.promise; await Promise.resolve(); flush();
  assert.equal(layoutReads, 2505); assert.deepEqual(states.at(-1), expected());
  bodyTop += 90; progress.invalidate(); flush();
  assert.equal(layoutReads, 3006); assert.deepEqual(states.at(-1), expected());
  console.log('PASS image loads, element resizing, viewport changes, font readiness and article mutations invalidate cached geometry.');

  progress.invalidate(); progress.disconnect();
  assert.equal(frames.size, 0); const readCount = layoutReads;
  scroll(10000); main.dispatchEvent(new Event('load')); flush();
  assert.equal(layoutReads, readCount); assert.equal(resizeObservers.size, 0);
  viewport.scrollY = 0; bodyTop = 100; bodyHeight = 80;
  const short = observeReadingProgress(body, main, [], state => states.push(state)); cleanups.push(() => short.disconnect());
  assert.deepEqual(states.at(-1), { progress: 100, activeId: '', pastTop: false });
  short.disconnect(); await Promise.resolve(); assert.equal(frames.size, 0);
  console.log('PASS short articles without headings and pending-frame cleanup.');
} finally {
  cleanups.forEach(cleanup => cleanup());
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
  unregister();
}
