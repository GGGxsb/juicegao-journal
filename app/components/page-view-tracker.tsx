'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import type {RecordedPageView} from '../lib/analytics-types';

// Reuse a pending request across Strict Mode effects. Do not abort a completed
// view on navigation: its response may be establishing the HttpOnly identity.
const pending=new Map<string,Promise<RecordedPageView>>();
function record(path:string) {
  const existing=pending.get(path);
  if(existing) return existing;
  const send=async()=>{
    const response=await fetch('/api/analytics',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,
      headers:{'Content-Type':'application/json'},body:JSON.stringify({path})});
    if(!response.ok) throw new Error('Page analytics unavailable');
    return await response.json() as RecordedPageView;
  };
  // Tabs share this lock and cookies, including the first ever visit.
  const promise=Promise.resolve(navigator.locks?navigator.locks.request('journal-page-analytics',send):send())
    .finally(()=>pending.delete(path));
  pending.set(path,promise);
  return promise;
}

export default function PageViewTracker({onRecorded}:{onRecorded:(result:RecordedPageView)=>void}) {
  const path=usePathname();
  useEffect(()=>{
    let active=true,started=false;
    const track=()=>{
      if(started||document.visibilityState!=='visible') return;
      started=true;
      void record(path).then(result=>{if(active) onRecorded(result);}).catch(()=>{});
    };
    track();
    document.addEventListener('visibilitychange',track);
    return()=>{active=false;document.removeEventListener('visibilitychange',track);};
  },[path,onRecorded]);
  return null;
}
