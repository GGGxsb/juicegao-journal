'use client';
// React adaptation of Axi-Theme article components (Apache-2.0); see docs/article-components.md.
import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type ReactElement, type KeyboardEvent, type CSSProperties } from 'react';
import { Info, Lightbulb, TriangleAlert, CircleAlert, Code2, Star, GitFork, Scale } from 'lucide-react';
import './article-components.css';

type ChildProps = {children?:ReactNode;alt?:string;src?:string;node?:{tagName?:string;properties?:Record<string,unknown>};[key:string]:unknown};
function childInfo(child: ReactElement<ChildProps>, key:string): string {
  return String(child.props.node?.properties?.[key] ?? child.props[key] ?? '');
}

function Disclosure({title,initialOpen,children}: {title:string;initialOpen:boolean;children:ReactNode}) {
  const [open,setOpen] = useState(initialOpen), id=useId();
  return <section className={`rich-disclosure${open?' is-open':''}`}>
    <button type="button" className="rich-disclosure-trigger" id={`${id}-trigger`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><span>{title||'展开阅读'}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line className="rich-disclosure-line" x1="5" y1="12" x2="19" y2="12"/><polyline className="rich-disclosure-chevron" points="12 5 19 12 12 19"/></svg></button>
    <div className="rich-disclosure-grid" id={id} role="region" aria-labelledby={`${id}-trigger`} aria-hidden={!open} inert={!open}><div><div className="rich-disclosure-content">{children}</div></div></div>
  </section>;
}

const tabStoragePrefix='journal-synced-tabs__', tabSyncEvent='journal:tabs-change';
function Tabs({title,syncKey,children}: {title:string;syncKey:string;children:ReactNode}) {
  const panels=Children.toArray(children).filter((child):child is ReactElement<ChildProps> => isValidElement<ChildProps>(child)&&childInfo(child,'data-article-kind')==='tab');
  const labels=panels.map((panel,index)=>childInfo(panel,'data-article-title')||`选项 ${index+1}`);
  const labelsKey=JSON.stringify(labels);
  const [activeLabel,setActiveLabel]=useState<string|null>(null), id=useId(), buttons=useRef<(HTMLButtonElement|null)[]>([]);
  const section=useRef<HTMLElement>(null), previousTop=useRef<number|null>(null);
  const active=Math.max(0,labels.indexOf(activeLabel??''));
  useEffect(()=>{
    if(!syncKey)return;
    const storageKey=tabStoragePrefix+syncKey;
    const apply=(label:string|null)=>{if(label&&labels.includes(label))setActiveLabel(label);};
    try{apply(localStorage.getItem(storageKey));}catch{/* Private storage must not disable tabs. */}
    const sync=(event:Event)=>{const detail=(event as CustomEvent<{key:string;label:string}>).detail;if(detail?.key===syncKey)apply(detail.label);};
    const storage=(event:StorageEvent)=>{if(event.key===storageKey)apply(event.newValue);};
    window.addEventListener(tabSyncEvent,sync);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener(tabSyncEvent,sync);window.removeEventListener('storage',storage);};
  // Labels, rather than array positions, match differently ordered tab groups.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[syncKey,labelsKey]);
  useLayoutEffect(()=>{
    if(previousTop.current!==null&&section.current){const delta=section.current.getBoundingClientRect().top-previousTop.current;if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});previousTop.current=null;}
  },[active]);
  function select(index:number){
    const label=labels[index];if(!label)return;
    previousTop.current=section.current?.getBoundingClientRect().top??null;
    setActiveLabel(label);
    if(syncKey){try{localStorage.setItem(tabStoragePrefix+syncKey,label);}catch{/* Selection still works without persistence. */}window.dispatchEvent(new CustomEvent(tabSyncEvent,{detail:{key:syncKey,label}}));}
  }
  function keyboard(event:KeyboardEvent,index:number) {
    const next=event.key==='ArrowRight'?(index+1)%panels.length:event.key==='ArrowLeft'?(index-1+panels.length)%panels.length:event.key==='Home'?0:event.key==='End'?panels.length-1:null;
    if(next===null)return; event.preventDefault();select(next);buttons.current[next]?.focus();
  }
  if(!panels.length)return <div className="rich-tabs">{children}</div>;
  return <section ref={section} className="rich-tabs" data-sync-key={syncKey||undefined}><div className="rich-tab-list" role="tablist" aria-label={title||'内容切换'}>{panels.map((panel,index)=><button key={index} ref={element=>{buttons.current[index]=element;}} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active===index} tabIndex={active===index?0:-1} onKeyDown={event=>keyboard(event,index)} onClick={()=>select(index)}>{labels[index]}</button>)}</div>
    {panels.map((panel,index)=><div className="rich-tab-panel" key={index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active!==index} tabIndex={0}>{panel.props.children}</div>)}
  </section>;
}

function Gallery({title,gap,aspectRatio,children}: {title:string;gap:number;aspectRatio:number;children:ReactNode}) {
  const images:ReactElement<ChildProps>[]=[];
  const [ratios,setRatios]=useState<Record<string,number>>({});
  const gallery=useRef<HTMLDivElement>(null);
  function collect(nodes:ReactNode) { Children.forEach(nodes,child=>{
    if(!isValidElement<ChildProps>(child))return;
    if(child.type==='img'||child.props.node?.tagName==='img')images.push(child);
    else if(child.props.children)collect(child.props.children);
  }); }
  collect(children);
  const sources=JSON.stringify(images.map(image=>image.props.src||''));
  useEffect(()=>{
    // SSR/cached images may finish before React installs its load listener.
    const measured:Record<string,number>={};
    gallery.current?.querySelectorAll('img').forEach(image=>{if(image.complete&&image.naturalWidth&&image.naturalHeight)measured[image.getAttribute('src')||'']=image.naturalWidth/image.naturalHeight;});
    if(Object.keys(measured).length)setRatios(previous=>Object.entries(measured).every(([src,ratio])=>previous[src]===ratio)?previous:{...previous,...measured});
  },[sources]);
  return <section className="rich-gallery-section" aria-label={title||'图片组'}>{title&&<div className="rich-component-title">{title}</div>}<div ref={gallery} className="rich-gallery" style={{gap}} onLoadCapture={event=>{const image=event.target;if(!(image instanceof HTMLImageElement)||!image.naturalWidth||!image.naturalHeight)return;const ratio=image.naturalWidth/image.naturalHeight;setRatios(previous=>previous[image.getAttribute('src')||'']===ratio?previous:{...previous,[image.getAttribute('src')||'']:ratio});}}>{images.length?images.map((image,index)=>{const ratio=aspectRatio||ratios[image.props.src||'']||1;return <figure key={index} style={{flex:`${ratio} 1 0%`,'--image-ratio':ratio} as CSSProperties}>{image}{image.props.alt&&<figcaption>{image.props.alt}</figcaption>}</figure>;}):children}</div></section>;
}

type Repository={description:string;stars:number;forks:number;license:string|null;avatarUrl:string|null;language:string|null;archived:boolean};
const cards = new Map<string,Repository>();
function GithubCard({repo:repoRaw,description}: {repo:string;description:string}) {
  const repo=repoRaw.replace(/^https:\/\/github\.com\//i,'').replace(/\/$/,'');
  const ref=useRef<HTMLAnchorElement>(null),[loaded,setLoaded]=useState<{repo:string;data:Repository}|null>(null),[loading,setLoading]=useState(false),[avatarFailed,setAvatarFailed]=useState(false);
  const data=loaded?.repo===repo?loaded.data:null;
  const valid=/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(repo)&&!repo.endsWith('/.')&&!repo.endsWith('/..');
  useEffect(()=>{
    if(!valid)return;
    setLoading(false);setAvatarFailed(false);
    const cached=cards.get(repo);if(cached){setLoaded({repo,data:cached});return;}
    const controller=new AbortController();let started=false;
    const load=()=>{if(started)return;started=true;setLoading(true);fetch(`/api/github-card?${new URLSearchParams({repo})}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const result=await response.json() as Repository;if(!controller.signal.aborted){cards.set(repo,result);setLoaded({repo,data:result});}
    }).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});};
    if(typeof IntersectionObserver==='undefined'){load();return()=>controller.abort();}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}},{rootMargin:'150px'});
    if(ref.current)observer.observe(ref.current);
    return()=>{controller.abort();observer.disconnect();};
  },[repo,valid]);
  if(!valid)return <div className="rich-invalid-card">GitHub 仓库格式：owner/repository</div>;
  const [owner,name]=repo.split('/');
  const avatar=data?.avatarUrl&&/^https:\/\/avatars\.githubusercontent\.com\//i.test(data.avatarUrl)?data.avatarUrl:null;
  const number=(value:number)=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number.isFinite(value)?value:0);
  return <a ref={ref} className={`rich-github-card${loading?' is-loading':''}`} href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer" aria-busy={loading}><div className="rich-github-heading"><span className="rich-github-avatar">{avatar&&!avatarFailed?<img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" data-reader-skip="true" onError={()=>setAvatarFailed(true)}/>:<Code2 size={22}/>}</span><span className="rich-github-name"><span>{owner}</span><span aria-hidden="true">/</span><strong>{name}</strong></span><Code2 className="rich-github-mark" size={21}/></div><p>{data?.description||description||'查看源码、文档与项目动态。'}</p><div className="rich-github-meta"><span aria-label={data?`${data.stars} 个 Star`:'Star 数据待加载'}><Star size={18}/>{data?number(data.stars):'—'}</span><span aria-label={data?`${data.forks} 个 Fork`:'Fork 数据待加载'}><GitFork size={18}/>{data?number(data.forks):'—'}</span>{data?.license&&<span><Scale size={18}/>{data.license}</span>}<span className="rich-github-language">{data?.language||'GitHub'}</span>{data?.archived&&<span>已归档</span>}</div></a>;
}

export default function ArticleComponent({kind,title,repo,description,initialOpen,syncKey='',galleryGap=12,galleryRatio=0,children}: {kind:string;title:string;repo:string;description:string;initialOpen:boolean;syncKey?:string;galleryGap?:number;galleryRatio?:number;children:ReactNode}) {
  if(['note','tip','info','warning','danger'].includes(kind)) {
    const Icon=kind==='tip'?Lightbulb:kind==='warning'?TriangleAlert:kind==='danger'?CircleAlert:Info;
    const defaults:Record<string,string>={note:'提示',tip:'小建议',info:'说明',warning:'注意',danger:'重要提醒'};
    return <aside className={`rich-callout tone-${kind}`} aria-label={title||defaults[kind]}><div className="rich-callout-heading"><Icon size={18}/><strong>{title||defaults[kind]}</strong></div><div>{children}</div></aside>;
  }
  if(kind==='details')return <Disclosure title={title} initialOpen={initialOpen}>{children}</Disclosure>;
  if(kind==='tabs')return <Tabs title={title} syncKey={syncKey}>{children}</Tabs>;
  if(kind==='steps')return <section className="rich-steps" aria-label={title||'步骤说明'}>{title&&<div className="rich-component-title">{title}</div>}{children}</section>;
  if(kind==='step')return <div className="rich-step"><div className="rich-step-heading">{title||'步骤'}</div><div>{children}</div></div>;
  if(kind==='gallery')return <Gallery title={title} gap={galleryGap} aspectRatio={galleryRatio}>{children}</Gallery>;
  if(kind==='github')return <GithubCard repo={repo} description={description}/>;
  return <div>{children}</div>;
}
