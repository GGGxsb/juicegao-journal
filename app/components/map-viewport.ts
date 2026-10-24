'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {RefObject} from 'react';

export type MapView = {x: number; y: number; k: number};
export type MapPoint = {x: number; y: number};
export type MapViewBox = readonly [number, number, number, number];
export type MapBounds = {minX: number; minY: number; maxX: number; maxY: number};
export type ViewConstraints = {minScale?: number; maxScale?: number; paddingRatio?: number};
export type MoveOptions = {animate?: boolean};

const INITIAL_VIEW: MapView = {x: 0, y: 0, k: 1};
const ANIMATION_MS = 160;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** The transform is in the outer SVG's coordinates: screen = map * k + offset. */
export function constrainView(view: MapView, box: MapViewBox, options: ViewConstraints = {}): MapView {
  const [left, top, width, height] = box;
  const minScale = Number.isFinite(options.minScale) ? Math.max(.1, options.minScale!) : 1;
  const maxScale = Number.isFinite(options.maxScale) ? Math.max(minScale, options.maxScale!) : 12;
  const paddingRatio = Number.isFinite(options.paddingRatio) ? clamp(options.paddingRatio!, 0, .5) : .12;
  const k = clamp(Number.isFinite(view.k) ? view.k : minScale, minScale, maxScale);
  const x = Number.isFinite(view.x) ? view.x : (left + width / 2) * (1 - k);
  const y = Number.isFinite(view.y) ? view.y : (top + height / 2) * (1 - k);
  const paddingX = width * paddingRatio;
  const paddingY = height * paddingRatio;
  return {
    k,
    x: clamp(x, (left + width) * (1 - k) - paddingX, left * (1 - k) + paddingX),
    y: clamp(y, (top + height) * (1 - k) - paddingY, top * (1 - k) + paddingY),
  };
}

/** A fixed SVG point stays above the same map coordinate, except at the pan limits. */
export function zoomAtPoint(view: MapView, factor: number, anchor: MapPoint, box: MapViewBox, options: ViewConstraints = {}): MapView {
  if (!Number.isFinite(factor) || factor <= 0) return constrainView(view, box, options);
  const safeView = constrainView(view, box, options);
  const k = constrainView({...safeView, k: safeView.k * factor}, box, options).k;
  const ratio = k / safeView.k;
  return constrainView({k, x: anchor.x - (anchor.x - safeView.x) * ratio, y: anchor.y - (anchor.y - safeView.y) * ratio}, box, options);
}

/** Accumulate scale on the destination, while anchoring to the map the visitor sees now. */
export function zoomDestination(current: MapView, target: MapView, factor: number, anchor: MapPoint, box: MapViewBox, options: ViewConstraints = {}): MapView {
  if (!Number.isFinite(factor) || factor <= 0) return constrainView(target, box, options);
  const safeCurrent = constrainView(current, box, options);
  const k = constrainView({...target, k: target.k * factor}, box, options).k;
  return zoomAtPoint(safeCurrent, k / safeCurrent.k, anchor, box, options);
}

/** WheelEvent deltaMode 0 = px, 1 = lines, 2 = pages; cap isolated device spikes. */
export function normalizeWheelDelta(deltaY: number, deltaMode = 0, pageHeight = 800): number {
  if (!Number.isFinite(deltaY)) return 0;
  const page = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 800;
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? page : 1);
  return clamp(pixels, -160, 160);
}

/** Map-coordinate bounds for viewport culling; padding is also in map coordinates. */
export function visibleMapBounds(view: MapView, box: MapViewBox, padding = 0): MapBounds {
  const k = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
  const overscan = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return {
    minX: (box[0] - view.x) / k - overscan,
    minY: (box[1] - view.y) / k - overscan,
    maxX: (box[0] + box[2] - view.x) / k + overscan,
    maxY: (box[1] + box[3] - view.y) / k + overscan,
  };
}

/** Fit a province's map-coordinate bounds with an inset on each side of the viewport. */
export function fitBounds(bounds: readonly [number, number, number, number], box: MapViewBox, paddingFraction = .16, options: ViewConstraints = {}): MapView {
  if (!bounds.every(Number.isFinite) || bounds[2] < bounds[0] || bounds[3] < bounds[1]) return constrainView(INITIAL_VIEW, box, options);
  const padding = Number.isFinite(paddingFraction) ? clamp(paddingFraction, 0, .45) : .16;
  const k = Math.min(box[2] * (1 - 2 * padding) / Math.max(1, bounds[2] - bounds[0]), box[3] * (1 - 2 * padding) / Math.max(1, bounds[3] - bounds[1]));
  const scale = constrainView({x: 0, y: 0, k}, box, options).k;
  return constrainView({k: scale, x: box[0] + box[2] / 2 - (bounds[0] + bounds[2]) / 2 * scale, y: box[1] + box[3] / 2 - (bounds[1] + bounds[3]) / 2 * scale}, box, options);
}

export function interpolateView(from: MapView, to: MapView, progress: number): MapView {
  const t = clamp(progress, 0, 1);
  return {x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, k: from.k + (to.k - from.k) * t};
}

type MotionRuntime = {
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
  reduceMotion: () => boolean;
};

/** Kept independent of React/DOM so wheel bursts, interruptions and cleanup can be tested. */
export function createViewportMotion(initial: MapView, publish: (view: MapView) => void, runtime: MotionRuntime) {
  let current = {...initial};
  let target = current;
  let start = current;
  let startedAt = 0;
  let frame: number | null = null;

  const cancel = () => {
    if (frame !== null) runtime.cancelFrame(frame);
    frame = null;
    target = current;
    return current;
  };
  const tick = (time: number) => {
    frame = null;
    const progress = clamp((time - startedAt) / ANIMATION_MS, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    current = progress === 1 ? target : interpolateView(start, target, eased);
    publish(current);
    if (progress < 1) frame = runtime.requestFrame(tick);
  };
  const moveTo = (next: MapView, {animate = true}: MoveOptions = {}) => {
    target = {...next};
    if (!animate || runtime.reduceMotion()) {
      if (frame !== null) runtime.cancelFrame(frame);
      frame = null;
      current = target;
      publish(current);
      return;
    }
    if (current.x === target.x && current.y === target.y && current.k === target.k) {
      cancel();
      return;
    }
    start = current;
    startedAt = runtime.now();
    if (frame === null) frame = runtime.requestFrame(tick);
  };
  return {moveTo, cancel, getView: () => current, getTarget: () => target};
}

type MapViewportOptions = ViewConstraints & {onInteraction?: () => void; isDragging?: () => boolean};

export function useMapViewport(box: MapViewBox | null | undefined, svgRef: RefObject<SVGSVGElement | null>, options: MapViewportOptions = {}) {
  const [view, setView] = useState<MapView>(INITIAL_VIEW);
  const viewRef = useRef<MapView>(INITIAL_VIEW);
  const boxRef = useRef(box);
  const optionsRef = useRef(options);
  const reducedMotion = useRef(false);
  const motionRef = useRef<ReturnType<typeof createViewportMotion> | null>(null);
  boxRef.current = box;
  optionsRef.current = options;
  if (!motionRef.current) {
    motionRef.current = createViewportMotion(INITIAL_VIEW, next => {viewRef.current = next; setView(next);}, {
      requestFrame: callback => window.requestAnimationFrame(callback),
      cancelFrame: id => window.cancelAnimationFrame(id),
      now: () => performance.now(),
      reduceMotion: () => reducedMotion.current,
    });
  }
  const motion = motionRef.current;

  const moveTo = useCallback((next: MapView, moveOptions?: MoveOptions) => {
    if (boxRef.current) motion.moveTo(constrainView(next, boxRef.current, optionsRef.current), moveOptions);
  }, [motion]);
  const zoom = useCallback((factor: number, anchor?: MapPoint) => {
    const currentBox = boxRef.current;
    if (!currentBox) return;
    const point = anchor || {x: currentBox[0] + currentBox[2] / 2, y: currentBox[1] + currentBox[3] / 2};
    // Retain every pending scale step, even when the cursor moves between wheel events.
    motion.moveTo(zoomDestination(motion.getView(), motion.getTarget(), factor, point, currentBox, optionsRef.current));
  }, [motion]);
  const reset = useCallback(() => moveTo(INITIAL_VIEW), [moveTo]);
  const cancelAnimation = useCallback(() => motion.cancel(), [motion]);
  const pointFromClient = useCallback((clientX: number, clientY: number): MapPoint | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    try {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const result = point.matrixTransform(matrix.inverse());
      return {x: result.x, y: result.y};
    } catch { return null; }
  }, [svgRef]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reducedMotion.current = media.matches;
      if (media.matches) motion.moveTo(motion.getTarget(), {animate: false});
    };
    update();
    media.addEventListener('change', update);
    return () => {media.removeEventListener('change', update); motion.cancel();};
  }, [motion]);

  const enabled = Boolean(box);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !enabled) return;
    const onWheel = (event: WheelEvent) => {
      if (optionsRef.current.isDragging?.()) {event.preventDefault(); return;}
      const delta = normalizeWheelDelta(event.deltaY, event.deltaMode, svg.getBoundingClientRect().height);
      if (!delta) return;
      event.preventDefault();
      optionsRef.current.onInteraction?.();
      zoom(Math.exp(-delta * .0018), pointFromClient(event.clientX, event.clientY) || undefined);
    };
    svg.addEventListener('wheel', onWheel, {passive: false});
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef, enabled, zoom, pointFromClient]);

  return {view, viewRef, zoom, moveTo, reset, cancelAnimation, pointFromClient};
}
