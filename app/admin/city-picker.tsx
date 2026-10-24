'use client';

import { useEffect, useId, useState } from 'react';
import './city-picker.css';

type City = { id: string; name: string; province: string };

export default function CityPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [cities, setCities] = useState<City[]>([]);
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch('/data/china-city-index.json', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('城市列表暂时无法加载'); return response.json(); })
      .then((items: unknown) => {
        if (!Array.isArray(items) || !items.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.province === 'string')) throw new Error('无效的城市列表');
        setCities(items as City[]);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [retry]);
  const term = query.trim().toLocaleLowerCase();
  const results = term ? cities.filter(city => !value.includes(city.id) && `${city.name} ${city.province}`.toLocaleLowerCase().includes(term)).slice(0, 10) : [];
  return <div className="admin-field city-picker">
    <label htmlFor={id}>关联城市 <em>可选</em></label>
    {value.length > 0 && <ul className="city-picker-selected" aria-label="已选城市">{value.map(key => {
      const city = cities.find(item => item.id === key);
      return <li key={key}><span>{city?.name ?? key}</span><button type="button" aria-label={`移除${city?.name ?? key}`} onClick={() => onChange(value.filter(item => item !== key))}>×</button></li>;
    })}</ul>}
    <input id={id} value={query} onChange={event => setQuery(event.target.value)} maxLength={60} placeholder={value.length >= 32 ? '最多关联 32 个城市' : '搜索城市'} disabled={value.length >= 32 || (!cities.length && !failed)} autoComplete="off" />
    {term && results.length > 0 && <ul className="city-picker-results" aria-label="选择搜索到的城市">{results.map(city => <li key={city.id}><button type="button" onClick={() => { onChange([...value, city.id]); setQuery(''); }}><span>{city.name}</span><small>{city.province}</small><span aria-hidden="true">＋</span></button></li>)}</ul>}
    {term && cities.length > 0 && results.length === 0 && <small role="status">没有找到未选择的城市，请换个关键词。</small>}
    {failed && <small role="alert">城市列表暂时无法加载。<button type="button" className="city-picker-retry" onClick={() => setRetry(item => item + 1)}>重试</button></small>}
  </div>;
}
