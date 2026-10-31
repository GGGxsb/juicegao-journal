type ReadingState = { progress: number; activeId: string; pastTop: boolean };

/** Cache document geometry until the article changes size; scrolling only uses numbers. */
export function observeReadingProgress(body: HTMLElement, main: HTMLElement, sections: HTMLElement[], update: (state: ReadingState) => void) {
  let frame = 0, dirty = true, disposed = false, top = 0, height = 0;
  let offsets: number[] = [];
  let previous: ReadingState | undefined;
  const measure = () => {
    frame = 0;
    const y = window.scrollY, viewport = window.innerHeight;
    if (dirty) {
      const bounds = body.getBoundingClientRect();
      top = bounds.top + y; height = bounds.height;
      offsets = sections.map(section => section.getBoundingClientRect().top + y);
      dirty = false;
    }
    const line = Math.min(160, Math.max(64, viewport * .2));
    const start = Math.max(0, top - line), finish = top + height - viewport + 24;
    const progress = finish <= start
      ? (top + height - y <= viewport - 24 ? 100 : 0)
      : Math.round(Math.min(1, Math.max(0, (y - start) / (finish - start))) * 100);
    // Find the last heading above the reading line without measuring every heading again.
    let low = 0, high = offsets.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (offsets[middle] <= y + line + 8) low = middle + 1;
      else high = middle;
    }
    const index = top + height - y <= viewport && progress === 100 ? sections.length - 1 : Math.max(0, low - 1);
    const next = { progress, activeId: sections[index]?.id ?? '', pastTop: y > 180 };
    if (!previous || next.progress !== previous.progress || next.activeId !== previous.activeId || next.pastTop !== previous.pastTop) {
      previous = next; update(next);
    }
  };
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
  const invalidate = () => { dirty = true; schedule(); };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate);
  observer?.observe(body); observer?.observe(main);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidate, { passive: true });
  main.addEventListener('load', invalidate, true);
  body.ownerDocument.fonts?.ready.then(invalidate);
  measure();
  return {
    invalidate,
    disconnect() {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', invalidate);
      main.removeEventListener('load', invalidate, true);
    },
  };
}
