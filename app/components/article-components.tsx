'use client';
import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type ReactElement, type KeyboardEvent } from 'react';
import { ChevronDown, Info, Lightbulb, TriangleAlert, CircleAlert, Code2, ArrowUpRight, Star } from 'lucide-react';
import './article-components.css';

type ChildProps = {children?:ReactNode;alt?:string;src?:string;node?:{tagName?:string;properties?:Record<string,unknown>};[key:string]:unknown};
function childInfo(child: ReactElement<ChildProps>, key:string): string {
  return String(child.props.node?.properties?.[key] ?? child.props[key] ?? '');
}

function Disclosure({title,initialOpen,children}: {title:string;initialOpen:boolean;children:ReactNode}) {
  const [open,setOpen] = useState(initialOpen), id=useId();
  return <section className={`rich-disclosure${open?' is-open':''}`}>
    <button type="button" className="rich-disclosure-trigger" id={`${id}-trigger`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><span>{title||'展开阅读'}</span><ChevronDown size={18}/></button>
    <div className="rich-disclosure-grid" id={id} role="region" aria-labelledby={`${id}-trigger`} aria-hidden={!open} inert={!open}><div><div className="rich-disclosure-content">{children}</div></div></div>
  </section>;
}

function Tabs({title,children}: {title:string;children:ReactNode}) {
  const panels=Children.toArray(children).filter((child):child is ReactElement<ChildProps> => isValidElement<ChildProps>(child)&&childInfo(child,'data-article-kind')==='tab');
  const [active,setActive]=useState(0), id=useId(), buttons=useRef<(HTMLButtonElement|null)[]>([]);
  function keyboard(event:KeyboardEvent,index:number) {
    const next=event.key==='ArrowRight'?(index+1)%panels.length:event.key==='ArrowLeft'?(index-1+panels.length)%panels.length:event.key==='Home'?0:event.key==='End'?panels.length-1:null;
    if(next===null)return; event.preventDefault();setActive(next);buttons.current[next]?.focus();
  }
  if(!panels.length)return <div className="rich-tabs">{children}</div>;
  return <section className="rich-tabs"><div className="rich-tab-list" role="tablist" aria-label={title||'内容切换'}>{panels.map((panel,index)=><button key={index} ref={element=>{buttons.current[index]=element;}} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active===index} tabIndex={active===index?0:-1} onKeyDown={event=>keyboard(event,index)} onClick={()=>setActive(index)}>{childInfo(panel,'data-article-title')||`选项 ${index+1}`}</button>)}</div>
    {panels.map((panel,index)=><div className="rich-tab-panel" key={index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active!==index} tabIndex={0}>{panel.props.children}</div>)}
  </section>;
}

function Gallery({title,children}: {title:string;children:ReactNode}) {
  const images:ReactElement<ChildProps>[]=[];
  function collect(nodes:ReactNode) { Children.forEach(nodes,child=>{
    if(!isValidElement<ChildProps>(child))return;
    if(child.type==='img'||child.props.node?.tagName==='img')images.push(child);
    else if(child.props.children)collect(child.props.children);
  }); }
  collect(children);
  return <section className="rich-gallery-section" aria-label={title||'图片组'}>{title&&<div className="rich-component-title">{title}</div>}<div className="rich-gallery">{images.length?images.map((image,index)=><figure key={index}>{image}{image.props.alt&&<figcaption>{image.props.alt}</figcaption>}</figure>):children}</div></section>;
}

type Repository={description:string;stars:number;language:string|null;archived:boolean};
const cards = new Map<string,Repository>();
function GithubCard({repo,description}: {repo:string;description:string}) {
  const ref=useRef<HTMLAnchorElement>(null),[data,setData]=useState<Repository|null>(null);
  const valid=/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(repo)&&!repo.endsWith('/.')&&!repo.endsWith('/..');
  useEffect(()=>{
    if(!valid)return;
    const cached=cards.get(repo);if(cached){setData(cached);return;}
    const controller=new AbortController();let started=false;
    const load=()=>{if(started)return;started=true;fetch(`/api/github-card?${new URLSearchParams({repo})}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const result=await response.json() as Repository;if(!controller.signal.aborted){cards.set(repo,result);setData(result);}
    }).catch(()=>{});};
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}},{rootMargin:'150px'});
    if(ref.current)observer.observe(ref.current);
    return()=>{controller.abort();observer.disconnect();};
  },[repo,valid]);
  if(!valid)return <div className="rich-invalid-card">GitHub 仓库格式：owner/repository</div>;
  return <a ref={ref} className="rich-github-card" href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer"><div className="rich-github-heading"><Code2 size={22}/><strong>{repo}</strong><ArrowUpRight size={18}/></div><p>{data?.description||description||'查看源码、文档与项目动态。'}</p><div className="rich-github-meta"><span>GitHub</span>{data?.language&&<span><i/>{data.language}</span>}{data&&<span><Star size={13}/>{data.stars.toLocaleString()}</span>}{data?.archived&&<span>已归档</span>}</div></a>;
}

export default function ArticleComponent({kind,title,repo,description,initialOpen,children}: {kind:string;title:string;repo:string;description:string;initialOpen:boolean;children:ReactNode}) {
  if(['note','tip','info','warning','danger'].includes(kind)) {
    const Icon=kind==='tip'?Lightbulb:kind==='warning'?TriangleAlert:kind==='danger'?CircleAlert:Info;
    const defaults:Record<string,string>={note:'提示',tip:'小建议',info:'说明',warning:'注意',danger:'重要提醒'};
    return <aside className={`rich-callout tone-${kind}`}><div className="rich-callout-heading"><Icon size={18}/><strong>{title||defaults[kind]}</strong></div><div>{children}</div></aside>;
  }
  if(kind==='details')return <Disclosure title={title} initialOpen={initialOpen}>{children}</Disclosure>;
  if(kind==='tabs')return <Tabs title={title}>{children}</Tabs>;
  if(kind==='steps')return <section className="rich-steps" aria-label={title||'步骤说明'}>{title&&<div className="rich-component-title">{title}</div>}{children}</section>;
  if(kind==='step')return <div className="rich-step"><div className="rich-step-heading">{title||'步骤'}</div><div>{children}</div></div>;
  if(kind==='gallery')return <Gallery title={title}>{children}</Gallery>;
  if(kind==='github')return <GithubCard repo={repo} description={description}/>;
  return <div>{children}</div>;
}
