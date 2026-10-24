'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {visibleMapBounds} from './map-viewport';
import type {MapView} from './map-viewport';

type BoundsTuple = [number, number, number, number];
export type CityMetadata = {id: string; name: string; province: string; provinceId: string; center: [number, number]};
export type CityDetail = CityMetadata & {path: string; bounds: BoundsTuple};
export type Province = {id: string; name: string; path: string; center: [number, number]; bounds: BoundsTuple; cityIds: string[]; detailUrl: string};
export type MapOverview = {
  viewBox: BoundsTuple;
  provinces: Province[];
  cities: CityMetadata[];
  outlines: {path: string; name?: string}[];
  source: string;
  inset?: {label: string; labelPosition: [number, number]; box?: BoundsTuple};
};
export type CityChunk = {provinceId: string; cities: CityDetail[]};

/** Center-first ordering makes the place under the cursor arrive before edge provinces. */
export function neededProvinceIds(data: MapOverview | null, view: MapView, overscan = 25): string[] {
  if (!data) return [];
  const visible = visibleMapBounds(view, data.viewBox, overscan);
  const centerX = (visible.minX + visible.maxX) / 2;
  const centerY = (visible.minY + visible.maxY) / 2;
  return data.provinces.filter(province => province.bounds[2] >= visible.minX && province.bounds[0] <= visible.maxX && province.bounds[3] >= visible.minY && province.bounds[1] <= visible.maxY)
    .sort((a, b) => Math.hypot(a.center[0] - centerX, a.center[1] - centerY) - Math.hypot(b.center[0] - centerX, b.center[1] - centerY))
    .map(province => province.id);
}

function parseChunk(value: unknown, province: Province): CityChunk {
  if (!value || typeof value !== 'object') throw new Error('Invalid map detail');
  const candidate = value as Partial<CityChunk>;
  const tuple = (items: unknown, length: number): items is number[] => Array.isArray(items) && items.length === length && items.every(Number.isFinite);
  if (candidate.provinceId !== province.id || !Array.isArray(candidate.cities) || candidate.cities.length !== province.cityIds.length) throw new Error('Invalid map detail');
  const expected = new Set(province.cityIds);
  for (const city of candidate.cities) {
    if (!city || typeof city.id !== 'string' || !expected.delete(city.id) || city.provinceId !== province.id || typeof city.name !== 'string' || typeof city.province !== 'string' || typeof city.path !== 'string' || !city.path || !tuple(city.center, 2) || !tuple(city.bounds, 4) || city.bounds[0] > city.bounds[2] || city.bounds[1] > city.bounds[3]) throw new Error('Invalid map detail');
  }
  return candidate as CityChunk;
}

export function useMapDetails(data: MapOverview | null, view: MapView, enabled: boolean) {
  const [chunks, setChunks] = useState<Record<string, CityChunk>>({});
  const [, setRevision] = useState(0);
  const cache = useRef<Record<string, CityChunk>>({});
  const failures = useRef(new Set<string>());
  const requests = useRef(new Map<string, AbortController>());
  const epoch = useRef(0);
  const alive = useRef(false);
  const settledKey = useRef('');
  const needed = neededProvinceIds(data, view);
  const key = `${view.x}:${view.y}:${view.k}:${enabled}`;
  const desired = useRef({data, enabled, ids: needed, key});
  desired.current = {data, enabled, ids: needed, key};
  const pumpRef = useRef<() => void>(() => {});

  const pump = useCallback(() => {
    const selection = desired.current;
    if (!alive.current || !selection.enabled || !selection.data || settledKey.current !== selection.key) return;
    const provinces = new Map(selection.data.provinces.map(province => [province.id, province]));
    while (requests.current.size < 3) {
      const id = selection.ids.find(candidate => !cache.current[candidate] && !failures.current.has(candidate) && !requests.current.has(candidate));
      const province = id ? provinces.get(id) : undefined;
      if (!id || !province) break;
      const controller = new AbortController();
      const requestEpoch = epoch.current;
      requests.current.set(id, controller);
      fetch(province.detailUrl, {signal: controller.signal}).then(response => {
        if (!response.ok) throw new Error('Map detail unavailable');
        return response.json();
      }).then(value => {
        if (!alive.current || epoch.current !== requestEpoch) return;
        const chunk = parseChunk(value, province);
        cache.current = {...cache.current, [id]: chunk};
        setChunks(cache.current);
      }).catch(error => {
        if (!alive.current || epoch.current !== requestEpoch || controller.signal.aborted || error?.name === 'AbortError') return;
        failures.current.add(id);
      }).finally(() => {
        if (!alive.current || epoch.current !== requestEpoch) return;
        requests.current.delete(id);
        setRevision(value => value + 1);
        pumpRef.current();
      });
    }
  }, []);
  pumpRef.current = pump;

  useEffect(() => {
    alive.current = true;
    epoch.current++;
    settledKey.current = '';
    cache.current = {};
    failures.current.clear();
    setChunks({});
    return () => {
      alive.current = false;
      epoch.current++;
      settledKey.current = '';
      for (const controller of requests.current.values()) controller.abort();
      requests.current.clear();
    };
  }, [data]);

  useEffect(() => {
    if (!data || !enabled) {settledKey.current = ''; return;}
    // A view update invalidates the queued work without aborting useful downloads.
    const timer = window.setTimeout(() => {settledKey.current = key; pump();}, 80);
    return () => window.clearTimeout(timer);
  }, [data, enabled, key, pump]);

  const retry = useCallback(() => {
    failures.current.clear();
    setRevision(value => value + 1);
    pump();
  }, [pump]);
  const pending = Boolean(data && enabled && needed.some(id => !chunks[id] && !failures.current.has(id)));
  const failed = Boolean(data && enabled && needed.some(id => failures.current.has(id)));
  return {chunks, pending, failed, retry};
}
