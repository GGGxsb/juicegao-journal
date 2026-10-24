'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {ArrowRight, ChevronDown, LoaderCircle, Minus, Plus, RotateCcw, Search, X} from 'lucide-react';
import type {MapPost} from '../lib/types';
import {postHref} from '../lib/post-links';
import {fitBounds, useMapViewport, visibleMapBounds} from './map-viewport';
import type {MapView} from './map-viewport';
import {useMapDetails} from './use-map-details';
import type {CityMetadata, MapOverview, Province} from './use-map-details';
import './city-map.css';

type SavedView = {cityId: string; provinceId?: string; transform: MapView; listScroll?: number};
type Tooltip = {id: string; kind: 'city' | 'province'; x: number; y: number};
const STORAGE_KEY = 'journal-city-map-v1';
const provinceLabel = (name: string) => name.replace(/特别行政区$|壮族自治区$|回族自治区$|维吾尔自治区$|自治区$|省$|市$/g, '');
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai'}).replaceAll('/', '.');
};

// Keep labels at a steady screen size, with space for their neighbours.
function spaceLabels<T extends {id: string; name: string; center: [number, number]}>(items: T[], view: MapView, unitScale: number, fontSize: number, max: number): T[] {
  const placed: {x: number; y: number; halfWidth: number}[] = [];
  return items.filter(item => {
    if (placed.length >= max) return false;
    const x = item.center[0] * view.k / unitScale;
    const y = item.center[1] * view.k / unitScale;
    const halfWidth = item.name.length * fontSize / 2 + 5;
    if (placed.some(label => Math.abs(label.y - y) < fontSize + 8 && Math.abs(label.x - x) < label.halfWidth + halfWidth)) return false;
    placed.push({x, y, halfWidth});
    return true;
  });
}

export default function CityMap({posts}: {posts: MapPost[]}) {
  const [data, setData] = useState<MapOverview | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [dragging, setDragging] = useState(false);
  const [detailMode, setDetailMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [restored, setRestored] = useState(false);
  const [unitScale, setUnitScale] = useState(1.5);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedView = useRef<SavedView | null>(null);
  const drag = useRef<{id: number; clientX: number; clientY: number; pointX: number; pointY: number; view: MapView; moved: boolean; cityId: string; provinceId: string} | null>(null);
  const {view, viewRef, zoom, moveTo, reset, cancelAnimation, pointFromClient} = useMapViewport(data?.viewBox, svgRef, {onInteraction: () => setTooltip(null), isDragging: () => Boolean(drag.current)});
  const {chunks, pending: detailsPending, failed: detailsFailed, retry: retryDetails} = useMapDetails(data, view, detailMode);

  const cityArticles = useMemo(() => {
    const result = new Map<string, MapPost[]>();
    for (const post of posts) for (const id of new Set(post.cityIds || [])) result.set(id, [...(result.get(id) || []), post]);
    for (const items of result.values()) items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return result;
  }, [posts]);
  const citiesById = useMemo(() => new Map(data?.cities.map(city => [city.id, city]) || []), [data]);
  const provincesById = useMemo(() => new Map(data?.provinces.map(province => [province.id, province]) || []), [data]);
  const provinceArticles = useMemo(() => {
    const result = new Map<string, MapPost[]>();
    for (const province of data?.provinces || []) {
      const unique = new Map(province.cityIds.flatMap(id => (cityArticles.get(id) || []).map(post => [post.id, post] as const)));
      result.set(province.id, [...unique.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
    }
    return result;
  }, [data, cityArticles]);
  const selectedCity = citiesById.get(selectedId);
  const selectedProvince = provincesById.get(selectedProvinceId);
  const focusedProvinceId = selectedCity?.provinceId || selectedProvinceId;
  const selectedPosts = (selectedCity ? cityArticles.get(selectedId) : provinceArticles.get(selectedProvinceId)) || [];
  const mappedCities = useMemo(() => data?.cities.filter(city => cityArticles.has(city.id)) || [], [data, cityArticles]);
  const mappedArticleCount = useMemo(() => new Set(mappedCities.flatMap(city => (cityArticles.get(city.id) || []).map(post => post.id))).size, [mappedCities, cityArticles]);
  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!data) return [];
    const found = term ? data.cities.filter(city => `${city.name} ${city.province} ${city.id}`.toLowerCase().includes(term)) : [...mappedCities, ...data.cities.filter(city => !cityArticles.has(city.id))];
    return found.slice(0, 30);
  }, [data, query, mappedCities, cityArticles]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/china-map-overview.json', {signal: controller.signal}).then(response => {
      if (!response.ok) throw new Error('Map unavailable');
      return response.json();
    }).then((value: MapOverview) => {
      if (!value || !Array.isArray(value.cities) || !Array.isArray(value.provinces) || !value.provinces.length || !Array.isArray(value.viewBox) || value.viewBox.length !== 4 || !value.viewBox.every(Number.isFinite)) throw new Error('Invalid map');
      setData({...value, outlines: value.outlines || []}); setLoadState('ready');
    }).catch(error => {if (error.name !== 'AbortError') setLoadState('error');});
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as SavedView | null;
      if (value && typeof value.cityId === 'string' && value.transform && [value.transform.x, value.transform.y, value.transform.k].every(Number.isFinite) && value.transform.k >= 1 && value.transform.k <= 12) savedView.current = value;
    } catch { /* Browsing still works when storage is unavailable. */ }
  }, []);
  useEffect(() => {
    if (!data || restored) return;
    const saved = savedView.current;
    const first = data.cities.find(city => cityArticles.has(city.id));
    const provinceId = saved?.provinceId && provincesById.has(saved.provinceId) ? saved.provinceId : '';
    setSelectedId(saved ? citiesById.has(saved.cityId) ? saved.cityId : '' : first?.id || '');
    setSelectedProvinceId(provinceId);
    if (saved) moveTo(saved.transform, {animate: false});
    setRestored(true);
  }, [data, restored, cityArticles, citiesById, provincesById, moveTo]);
  useEffect(() => {
    if (!restored) return;
    const frame = requestAnimationFrame(() => {if (listRef.current && savedView.current?.listScroll) listRef.current.scrollTop = savedView.current.listScroll;});
    return () => cancelAnimationFrame(frame);
  }, [restored]);

  const persist = useCallback((listScroll?: number) => {
    if (!restored) return;
    try {sessionStorage.setItem(STORAGE_KEY, JSON.stringify({cityId: selectedId, provinceId: selectedProvinceId, transform: viewRef.current, listScroll: listScroll ?? listRef.current?.scrollTop ?? 0}));} catch { /* Optional state persistence. */ }
  }, [restored, selectedId, selectedProvinceId, viewRef]);
  useEffect(() => {
    const timer = window.setTimeout(() => persist(), 200);
    return () => window.clearTimeout(timer);
  }, [persist, view]);

  // Different entry/exit scales prevent layer flicker near the threshold.
  useEffect(() => {setDetailMode(current => view.k >= 3 ? true : view.k <= 2.5 ? false : current);}, [view.k]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !data) return;
    const update = () => {
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / data.viewBox[2], rect.height / data.viewBox[3]);
      if (scale > 0) setUnitScale(1 / scale);
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(svg);
    return () => observer.disconnect();
  }, [data]);
  useEffect(() => {
    const onOutside = (event: globalThis.PointerEvent) => {if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);};
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, []);
  useEffect(() => {
    if (!searchOpen) return;
    const city = searchResults[activeResult];
    const item = city ? document.getElementById(`city-result-${city.id}`) : null;
    const container = item?.parentElement;
    if (item && container) {
      if (item.offsetTop < container.scrollTop) container.scrollTop = item.offsetTop;
      else if (item.offsetTop + item.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = item.offsetTop + item.offsetHeight - container.clientHeight;
    }
  }, [activeResult, searchOpen, searchResults]);

  const openSelection = () => {
    setPanelOpen(true); setTooltip(null); setSearchOpen(false); setQuery('');
    if (listRef.current) listRef.current.scrollTop = 0;
  };
  const clearSelection = () => {
    setSelectedId(''); setSelectedProvinceId(''); setTooltip(null); setSearchOpen(false);
    if (listRef.current) listRef.current.scrollTop = 0;
    try {sessionStorage.setItem(STORAGE_KEY, JSON.stringify({cityId:'',provinceId:'',transform:viewRef.current,listScroll:0}));} catch { /* Optional state persistence. */ }
    const focused = document.activeElement;
    if (focused instanceof SVGElement && svgRef.current?.contains(focused)) focused.blur();
  };
  const chooseCity = (id: string, focusMap = false) => {
    const city = citiesById.get(id);
    if (!city || !data) return;
    setSelectedId(id); setSelectedProvinceId(''); openSelection();
    if (focusMap) {
      const k = Math.max(viewRef.current.k, 4);
      moveTo({k, x: data.viewBox[0] + data.viewBox[2] / 2 - city.center[0] * k, y: data.viewBox[1] + data.viewBox[3] / 2 - city.center[1] * k});
    }
  };
  const chooseProvince = (id: string) => {
    const province = provincesById.get(id);
    if (!province || !data) return;
    setSelectedId(''); setSelectedProvinceId(id); openSelection();
    moveTo(fitBounds(province.bounds, data.viewBox));
  };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const target = event.target as Element;
    drag.current = {id: event.pointerId, clientX: event.clientX, clientY: event.clientY, pointX: point.x, pointY: point.y, view: cancelAnimation(), moved: false, cityId: target.closest('[data-city-id]')?.getAttribute('data-city-id') || '', provinceId: target.closest('[data-province-id]')?.getAttribute('data-province-id') || ''};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (current && current.id === event.pointerId) {
      const point = pointFromClient(event.clientX, event.clientY);
      if (!point) return;
      if (Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY) > 5) current.moved = true;
      if (current.moved) {
        setDragging(true); setTooltip(null);
        moveTo({...current.view, x: current.view.x + point.x - current.pointX, y: current.view.y + point.y - current.pointY}, {animate: false});
      }
      return;
    }
    if (event.pointerType === 'touch') return;
    const target = event.target as Element;
    const cityId = target.closest('[data-city-id]')?.getAttribute('data-city-id');
    const provinceId = target.closest('[data-province-id]')?.getAttribute('data-province-id');
    const rect = stageRef.current?.getBoundingClientRect();
    if ((cityId || provinceId) && rect) setTooltip({id: cityId || provinceId!, kind: cityId ? 'city' : 'province', x: Math.max(90, Math.min(rect.width - 90, event.clientX - rect.left)), y: Math.max(44, event.clientY - rect.top)});
    else setTooltip(null);
  };
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current.moved) {
      if (current.cityId) chooseCity(current.cityId);
      else if (current.provinceId) chooseProvince(current.provinceId);
      else clearSelection();
    }
  };

  const detailedProvinceIds = useMemo(() => new Set(detailMode ? Object.keys(chunks) : []), [chunks, detailMode]);
  const mapBounds = data ? visibleMapBounds(view, data.viewBox) : null;
  const inView = (center: [number, number]) => Boolean(mapBounds && center[0] >= mapBounds.minX && center[0] <= mapBounds.maxX && center[1] >= mapBounds.minY && center[1] <= mapBounds.maxY);
  const labelScale = unitScale / view.k;
  const provinceLabels = spaceLabels((data?.provinces || []).filter(province => inView(province.center)).map(province => ({...province, name: provinceLabel(province.name)})), view, unitScale, 12, 34);
  const cityLabels = spaceLabels(Object.values(chunks).flatMap(chunk => chunk.cities).filter(city => city.id !== selectedId && inView(city.center)).sort((a, b) => Number(cityArticles.has(b.id)) - Number(cityArticles.has(a.id))), view, unitScale, 11, 40);
  const tooltipRegion: CityMetadata | Province | undefined = tooltip ? (tooltip.kind === 'city' ? citiesById.get(tooltip.id) : provincesById.get(tooltip.id)) : undefined;
  const tooltipCount = tooltip ? (tooltip.kind === 'city' ? cityArticles : provinceArticles).get(tooltip.id)?.length || 0 : 0;

  return <section className="city-map-page" aria-labelledby="city-map-title">
    <div className="city-map-intro"><h1 id="city-map-title">城市地图</h1><div className="city-map-stat"><strong>{mappedCities.length}</strong><span>座城市</span><i aria-hidden="true"/><strong>{mappedArticleCount}</strong><span>篇文章</span></div></div>
    <div className="city-map-toolbar">
      <div className="city-map-search" ref={searchRef}><Search size={17} aria-hidden="true"/><input role="combobox" aria-label="搜索城市" aria-autocomplete="list" aria-expanded={searchOpen && loadState === 'ready'} aria-controls="city-search-results" aria-activedescendant={searchOpen && searchResults[activeResult] ? `city-result-${searchResults[activeResult].id}` : undefined} placeholder={loadState === 'loading' ? '地图加载中…' : '搜索城市'} value={query} disabled={loadState !== 'ready'} onFocus={() => {setSearchOpen(true); setActiveResult(0);}} onChange={event => {setQuery(event.target.value); setActiveResult(0); setSearchOpen(true);}} onKeyDown={event => {
        if (event.key === 'Escape') {setSearchOpen(false); return;}
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); setSearchOpen(true); setActiveResult(index => Math.max(0, Math.min(searchResults.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));}
        if (event.key === 'Enter' && searchResults[activeResult]) {event.preventDefault(); chooseCity(searchResults[activeResult].id, true);}
      }}/>{query && <button aria-label="清空城市搜索" onClick={() => {setQuery(''); setActiveResult(0);}}><X size={15}/></button>}
        {searchOpen && loadState === 'ready' && <div id="city-search-results" className="city-map-search-results" role="listbox" aria-label="城市搜索结果">{searchResults.length ? searchResults.map((city, index) => <button id={`city-result-${city.id}`} key={city.id} role="option" aria-selected={activeResult === index} className={activeResult === index ? 'is-active' : ''} tabIndex={-1} onPointerDown={event => event.preventDefault()} onClick={() => chooseCity(city.id, true)}><span>{city.name}<small>{city.province}</small></span><span>{cityArticles.get(city.id)?.length || 0} 篇</span></button>) : <p>未找到城市</p>}</div>}
      </div>
    </div>
    <div className="city-map-workspace">
      <div className="city-map-canvas-wrap">
        <a href="#city-article-list" className="city-map-skip">跳至文章列表</a>
        <div className={`city-map-stage${dragging ? ' is-dragging' : ''}`} data-detail={detailMode} ref={stageRef}>
          {loadState === 'loading' && <div className="city-map-load" role="status"><span className="city-map-loading-dot"/><p>加载地图…</p></div>}
          {loadState === 'error' && <div className="city-map-load" role="status"><p>地图加载失败</p><button onClick={() => {setLoadState('loading'); setAttempt(value => value + 1);}}>重新加载</button></div>}
          {data && loadState === 'ready' && <svg ref={svgRef} viewBox={data.viewBox.join(' ')} className="city-map-svg" aria-label="中国地图，滚轮缩放，拖动移动，点击省份或城市查看文章" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => {drag.current = null; setDragging(false); setTooltip(null);}} onLostPointerCapture={() => {drag.current = null; setDragging(false);}} onPointerLeave={() => {if (!drag.current) setTooltip(null);}}>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {data.provinces.map(province => {const count = provinceArticles.get(province.id)?.length || 0; const detailed = detailedProvinceIds.has(province.id); return <path key={province.id} d={province.path} data-province-id={province.id} role="button" tabIndex={detailed ? -1 : 0} aria-hidden={detailed || undefined} aria-label={`${province.name}，${count} 篇文章`} aria-pressed={focusedProvinceId === province.id} className={`city-map-province${count ? ' has-posts' : ''}${focusedProvinceId === province.id ? ' is-selected' : ''}${detailed ? ' is-detailed' : ''}`} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); chooseProvince(province.id);}}}/>;})}
              {Object.values(chunks).map(chunk => <g key={chunk.provinceId} className={`city-map-detail-layer${detailMode ? ' is-visible' : ''}${selectedProvinceId === chunk.provinceId ? ' is-province-selected' : ''}`} aria-hidden={!detailMode || undefined}>{chunk.cities.map(city => {const count = cityArticles.get(city.id)?.length || 0; return <path key={city.id} d={city.path} data-city-id={city.id} role="button" tabIndex={detailMode ? 0 : -1} aria-label={`${city.province} ${city.name}，${count} 篇文章`} aria-pressed={selectedId === city.id} className={`city-map-city${count ? ' has-posts' : ''}${selectedId === city.id ? ' is-selected' : ''}`} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); chooseCity(city.id);}}}/>;})}</g>)}
              <g className={`city-map-province-borders${detailMode ? ' is-visible' : ''}`} aria-hidden="true">
                {data.provinces.map(province => <path key={province.id} d={province.path} vectorEffect="non-scaling-stroke"/>)}
              </g>
              {data.outlines.map((outline, index) => <path key={index} d={outline.path} className="city-map-outline" vectorEffect="non-scaling-stroke" aria-hidden="true"/>)}
              {data.inset && <text x={data.inset.labelPosition[0]} y={data.inset.labelPosition[1]} textAnchor="middle" className="city-map-inset-label" aria-hidden="true">{data.inset.label}</text>}
              {provinceLabels.map(province => <text key={`province-label-${province.id}`} transform={`translate(${province.center[0]} ${province.center[1]}) scale(${labelScale})`} className={`city-map-province-label${detailedProvinceIds.has(province.id) ? ' is-detailed' : ''}`} aria-hidden="true">{province.name}</text>)}
              <g className={`city-map-detail-layer${detailMode ? ' is-visible' : ''}`} style={{pointerEvents: 'none'}} aria-hidden="true">{cityLabels.map(city => <text key={`city-label-${city.id}`} transform={`translate(${city.center[0]} ${city.center[1]}) scale(${labelScale})`} className="city-map-city-label">{city.name}</text>)}</g>
              {mappedCities.filter(city => detailMode && detailedProvinceIds.has(city.provinceId)).map(city => <circle key={`dot-${city.id}`} cx={city.center[0]} cy={city.center[1]} r={2.6 * labelScale} className="city-map-marker" aria-hidden="true"/>)}
              {selectedCity && <g transform={`translate(${selectedCity.center[0]} ${selectedCity.center[1]}) scale(${labelScale})`} className="city-map-selected-label" aria-hidden="true"><circle r="5"/><rect x={-Math.max(31, selectedCity.name.length * 7.5 + 10)} y="-34" width={Math.max(62, selectedCity.name.length * 15 + 20)} height="24" rx="5"/><text y="-18" textAnchor="middle">{selectedCity.name}</text></g>}
            </g>
          </svg>}
          {tooltip && tooltipRegion && <div className="city-map-tooltip" style={{left: tooltip.x, top: tooltip.y}}><strong>{tooltipRegion.name}</strong><span>{tooltipCount} 篇文章</span></div>}
          {detailMode && detailsPending && <div className="city-map-detail-loading" role="status" aria-label="加载市级边界"><LoaderCircle aria-hidden="true"/></div>}
          {detailMode && detailsFailed && !detailsPending && <button className="city-map-detail-loading is-error" aria-label="重试加载市级边界" title="重新加载" onClick={retryDetails}><RotateCcw aria-hidden="true"/></button>}
          {loadState === 'ready' && <div className="city-map-controls" aria-label="地图视角"><button aria-label="放大地图" disabled={view.k >= 12} onClick={() => zoom(1.4)}><Plus size={18}/></button><button aria-label="缩小地图" disabled={view.k <= 1} onClick={() => zoom(1 / 1.4)}><Minus size={18}/></button><span/><button aria-label="回到全国地图" title="回到全国" onClick={() => {reset(); setTooltip(null);}}><RotateCcw size={16}/></button></div>}
        </div>
        <div className="city-map-legend"><span><i className="has-posts"/>有文章</span><span><i/>暂无文章</span><span><i className="is-selected"/>当前选择</span></div>
      </div>
      <aside className={`city-map-panel${panelOpen ? ' is-open' : ''}`} aria-label="地图文章">
        <div className="city-map-panel-header"><div>{selectedCity && selectedCity.province !== selectedCity.name && <p>{selectedCity.province}</p>}<h2>{selectedCity?.name || selectedProvince?.name || '选择城市'}</h2>{(selectedCity || selectedProvince) && <span aria-live="polite">{selectedPosts.length} 篇文章</span>}</div><button className="city-map-panel-toggle" aria-label={panelOpen ? '收起文章列表' : '展开文章列表'} aria-expanded={panelOpen} aria-controls="city-article-list" onClick={() => setPanelOpen(value => !value)}><ChevronDown size={20}/></button></div>
        <div className="city-map-article-list" id="city-article-list" ref={listRef} tabIndex={-1} onScroll={event => persist(event.currentTarget.scrollTop)}>
          {selectedPosts.length ? selectedPosts.map(post => <article key={post.id} className="city-map-article"><a href={`${postHref(post)}?from=map`} onClick={() => persist()}><div className="city-map-article-meta"><time dateTime={post.publishedAt}>{dateLabel(post.publishedAt)}</time></div><h3>{post.title}<ArrowRight size={16} aria-hidden="true"/></h3>{post.excerpt && <p>{post.excerpt}</p>}</a></article>) : selectedCity || selectedProvince ? <div className="city-map-empty"><p>暂无文章</p></div> : null}
        </div>
      </aside>
    </div>
    <p className="city-map-attribution"><a href="/data/map-data-license.txt" target="_blank" rel="noreferrer">数据来源与许可</a> · <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="/data/taiwan-city-paths.json">开放数据</a></p>
  </section>;
}
