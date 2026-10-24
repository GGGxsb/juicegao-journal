import assert from 'node:assert/strict';
import {register} from 'tsx/esm/api';

const unregister = register();
const {constrainView, zoomAtPoint, zoomDestination, normalizeWheelDelta, visibleMapBounds, fitBounds, interpolateView, createViewportMotion} = await import('../app/components/map-viewport.ts');
const box = [0, 0, 1000, 800];
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} vs ${expected}`);
const mapPoint = (view, point) => ({x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k});
let checks = 0;
function passed(label) { console.log(`PASS ${label}`); checks++; }

try {
  const from = {x: -300, y: -220, k: 2};
  const anchor = {x: 410, y: 275};
  const underCursor = mapPoint(from, anchor);
  const zoomed = zoomAtPoint(from, 1.7, anchor, box);
  for (const progress of [0, .05, .25, .5, .9, 1]) {
    const point = mapPoint(interpolateView(from, zoomed, progress), anchor);
    near(point.x, underCursor.x, 'anchored x throughout animation');
    near(point.y, underCursor.y, 'anchored y throughout animation');
  }
  const roundTrip = zoomAtPoint(zoomed, 1 / 1.7, anchor, box);
  for (const key of ['x', 'y', 'k']) near(roundTrip[key], from[key], `zoom round trip ${key}`);
  passed('Cursor anchor remains fixed throughout every animation frame and zoom round trip');

  assert.equal(normalizeWheelDelta(3, 1), 48);
  assert.equal(normalizeWheelDelta(.1, 2, 900), 90);
  assert.equal(normalizeWheelDelta(-1, 2, 700), -160);
  assert.equal(normalizeWheelDelta(10000), 160);
  assert.equal(normalizeWheelDelta(-10000), -160);
  assert.equal(normalizeWheelDelta(Number.NaN), 0);
  assert.equal(normalizeWheelDelta(12), 12);
  passed('Pixel, line and page devices preserve direction and cap large wheel spikes');

  const nonzeroBox = [100, 50, 1000, 800];
  assert.deepEqual(constrainView({x: 999999, y: -999999, k: 99}, nonzeroBox), {x: -980, y: -9446, k: 12});
  const malformed = constrainView({x: Number.NaN, y: Number.POSITIVE_INFINITY, k: 0}, box);
  assert.deepEqual(malformed, {x: 0, y: 0, k: 1});
  const capped = zoomAtPoint({x: -4000, y: -3000, k: 10}, 100, {x: 500, y: 400}, box);
  assert.equal(capped.k, 12);
  assert.equal(zoomAtPoint(capped, 0, anchor, box).k, 12);
  passed('Zoom and panning stay finite and inside limits, including a nonzero viewBox origin');

  const bounds = visibleMapBounds({x: -300, y: -200, k: 2}, nonzeroBox, 15);
  assert.deepEqual(bounds, {minX: 185, minY: 110, maxX: 715, maxY: 540});
  const corners = visibleMapBounds(from, box);
  near(corners.minX * from.k + from.x, box[0], 'inverse left');
  near(corners.maxY * from.k + from.y, box[1] + box[3], 'inverse bottom');
  passed('Visible map bounds invert the SVG transform correctly and include loading overscan');

  const fitted = fitBounds([300, 250, 500, 350], nonzeroBox);
  near(fitted.k, 3.4, 'fit scale includes 16% inset on each side');
  near(400 * fitted.k + fitted.x, nonzeroBox[0] + nonzeroBox[2] / 2, 'fit horizontal center');
  near(300 * fitted.k + fitted.y, nonzeroBox[1] + nonzeroBox[3] / 2, 'fit vertical center');
  assert.equal(fitBounds([400, 300, 400, 300], box).k, 12, 'Point bounds still respect max zoom.');
  assert.deepEqual(fitBounds([500, 300, 400, 300], box), {x: 0, y: 0, k: 1});
  passed('Province focus fits bounds, respects viewport origin and inset, and caps degenerate bounds');

  let now = 0;
  let frameId = 0;
  let reduceMotion = false;
  const frames = new Map();
  const rendered = [];
  const motion = createViewportMotion(from, value => rendered.push(value), {
    now: () => now,
    requestFrame: callback => {frames.set(++frameId, callback); return frameId;},
    cancelFrame: id => frames.delete(id),
    reduceMotion: () => reduceMotion,
  });
  const advance = time => {
    now = time;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
  };
  for (let i = 0; i < 30; i++) {
    motion.moveTo(zoomDestination(motion.getView(), motion.getTarget(), 1.025, anchor, box));
    if (i % 4 === 0) advance(now + 8);
  }
  near(motion.getTarget().k, from.k * 1.025 ** 30, 'all wheel deltas accumulated');
  assert.equal(frames.size, 1, 'A burst should only schedule one pending frame.');
  advance(now + 80);
  assert.ok(motion.getView().k > from.k && motion.getView().k < motion.getTarget().k, 'Camera should move before completing.');
  advance(now + 160);
  near(motion.getView().k, from.k * 1.025 ** 30, 'animation reaches complete burst destination');
  for (const view of rendered) {
    const point = mapPoint(view, anchor);
    near(point.x, underCursor.x, 'burst x anchor');
    near(point.y, underCursor.y, 'burst y anchor');
  }
  assert.equal(frames.size, 0);
  passed('High frequency wheel events all accumulate without anchor drift or duplicate frame loops');

  motion.moveTo(zoomDestination(motion.getView(), motion.getTarget(), 1.2, anchor, box));
  advance(now + 30);
  const movedCursor = {x: 650, y: 430};
  const beforeMovedCursor = mapPoint(motion.getView(), movedCursor);
  const pendingScale = motion.getTarget().k;
  motion.moveTo(zoomDestination(motion.getView(), motion.getTarget(), 1.1, movedCursor, box));
  near(motion.getTarget().k, pendingScale * 1.1, 'changing cursor retains pending scale');
  advance(now + 60);
  const afterMovedCursor = mapPoint(motion.getView(), movedCursor);
  near(beforeMovedCursor.x, afterMovedCursor.x, 'new cursor x anchor');
  near(beforeMovedCursor.y, afterMovedCursor.y, 'new cursor y anchor');
  passed('Moving the cursor during unfinished zoom preserves the visible point and accumulated scale');

  motion.moveTo({x: -1200, y: -900, k: 5});
  advance(now + 40);
  const dragStart = motion.cancel();
  assert.deepEqual(dragStart, motion.getView());
  assert.equal(frames.size, 0, 'Pointer down must cancel the unfinished zoom.');
  const dragged = {...dragStart, x: dragStart.x + 40, y: dragStart.y - 20};
  motion.moveTo(dragged, {animate: false});
  advance(now + 500);
  assert.deepEqual(motion.getView(), dragged, 'Old animation must never reclaim a dragged position.');
  assert.deepEqual(motion.getTarget(), dragged);
  passed('Dragging begins at the rendered position and cancels pending zoom immediately');

  reduceMotion = true;
  motion.moveTo({x: 0, y: 0, k: 1});
  assert.deepEqual(motion.getView(), {x: 0, y: 0, k: 1});
  assert.equal(frames.size, 0, 'Reduced motion must not schedule animation.');
  reduceMotion = false;
  motion.moveTo({x: -500, y: -400, k: 3});
  assert.equal(frames.size, 1);
  const beforeCleanup = rendered.length;
  motion.cancel();
  advance(now + 500);
  assert.equal(rendered.length, beforeCleanup, 'Cleanup must cancel all future publications.');
  passed('Reduced motion is immediate and cleanup removes every scheduled frame');

  console.log(`Verified ${checks} map viewport behaviors.`);
} finally {
  unregister();
}
