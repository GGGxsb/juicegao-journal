/** Only change the header at a threshold or a deliberate change of scroll direction. */
export function observeHeaderScroll(header: HTMLElement, preference: MediaQueryList) {
  let previousY = Math.max(0, window.scrollY), directionY = previousY, direction = 0, frame = 0;
  let shown = true;
  const attribute = (name: string, value: boolean) => {
    const next = String(value);
    if (header.dataset[name] !== next) header.dataset[name] = next;
  };
  const measure = () => {
    frame = 0;
    const y = Math.max(0, window.scrollY), delta = y - previousY;
    const nextDirection = Math.sign(delta);
    if (nextDirection && nextDirection !== direction) { direction = nextDirection; directionY = previousY; }
    if (preference.matches || y < 600) shown = true;
    else if (Math.abs(y - directionY) >= 8) shown = direction < 0;
    attribute('scrolled', y > 20);
    attribute('show', shown);
    previousY = y;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
  measure();
  window.addEventListener('scroll', schedule, { passive: true });
  preference.addEventListener('change', schedule);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    preference.removeEventListener('change', schedule);
  };
}
