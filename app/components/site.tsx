'use client';
import {useEffect,useRef,useState} from 'react';
import {Search,Sun,Moon,ChevronDown,ArrowLeft,ArrowRight,MapPin,Mail,Menu,X,UserRound,Check,Copy,Code2} from 'lucide-react';
import type {Post,SiteSettings} from '../lib/types';
import {Markdown,getMarkdownHeadings} from './markdown';

type View='home'|'articles'|'notes'|'archive'|'about'|'article';
const formatDate=(value:string)=>new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai'}).replaceAll('/','-');
const readingTime=(content:string)=>Math.max(1,Math.ceil(content.replace(/\s/g,'').length/400));

export default function Journal({settings,posts,view,article}:{settings:SiteSettings;posts:Post[];view:View;article?:Post}) {
  const [dark,setDark]=useState(false),[searchOpen,setSearchOpen]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[query,setQuery]=useState(''),[category,setCategory]=useState('全部'),[copied,setCopied]=useState(false);
  const input=useRef<HTMLInputElement>(null),dialog=useRef<HTMLElement>(null);
  useEffect(()=>{
    const saved=localStorage.getItem('journal-theme');
    const value=saved?saved==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(value);document.documentElement.dataset.theme=value?'dark':'light';
    const selected=new URLSearchParams(location.search).get('category');if(selected)setCategory(selected);
  },[]);
  useEffect(()=>{function keys(e:KeyboardEvent){if(e.key==='Escape'){setSearchOpen(false);setMobileOpen(false)}if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setSearchOpen(v=>!v)}}document.addEventListener('keydown',keys);return()=>document.removeEventListener('keydown',keys)},[]);
  useEffect(()=>{
    if(!searchOpen)return;
    const before=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';input.current?.focus();
    function trap(e:KeyboardEvent){if(e.key!=='Tab')return;const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('input,button,a[href]')??[]).filter(el=>el.getClientRects().length>0);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
    document.addEventListener('keydown',trap);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',trap);before?.focus()};
  },[searchOpen]);
  const toggleTheme=()=>{setDark(!dark);document.documentElement.dataset.theme=!dark?'dark':'light';localStorage.setItem('journal-theme',!dark?'dark':'light')};
  const name=settings.name||'JuiceGao';
  const bio=settings.bio==='记录、探索，保持好奇。'?'':settings.bio;
  const description=settings.description==='一个记录技术、生活与灵感的个人空间。'?'':settings.description;
  const categories=Array.from(new Set(posts.filter(p=>p.kind==='article').map(p=>p.category))).filter(Boolean);
  const selected=posts.filter(p=>(view==='notes'?p.kind==='note':view==='articles'?p.kind==='article':true)&&(category==='全部'||p.category===category));
  const results=posts.filter(p=>[p.title,p.content,p.excerpt,p.category,...p.tags].join(' ').toLowerCase().includes(query.toLowerCase()));
  const totalWords=posts.reduce((sum,p)=>sum+p.content.replace(/\s/g,'').length,0);
  const years=Array.from(new Set(posts.map(p=>new Date(p.publishedAt).getFullYear())));
  const profile=<section className="profile"><div className="profile-avatar">{settings.avatar?<img src={settings.avatar} alt={name}/>:<UserRound size={58} strokeWidth={1}/>}</div><div className="profile-details"><h1>{name}</h1><div className="profile-labels">{settings.location&&<span><MapPin size={15}/>{settings.location}</span>}{settings.github&&<a href={settings.github} target="_blank" rel="noreferrer"><Code2 size={15}/>Github</a>}{settings.email&&<a href={`mailto:${settings.email}`}><Mail size={15}/>Email</a>}</div></div></section>;
  const postList=(items:Post[])=>items.length?<div className="post-list">{items.map(p=><article className="post-item" key={p.id}><a href={`/posts/${encodeURIComponent(p.slug)}`}><h2>{p.title}</h2>{p.excerpt&&<p>{p.excerpt}</p>}<div className="post-meta"><time dateTime={p.publishedAt}>{formatDate(p.publishedAt)}</time><span>{p.category}</span><span>{readingTime(p.content)} 分钟</span></div></a></article>)}</div>:<p className="empty-state">暂无内容</p>;
  return <div className="journal">
    <header className="site-header"><a href="/" className="site-name">{name}'s Blog</a><nav className={mobileOpen?'main-nav is-open':'main-nav'} aria-label="主导航"><details className="blog-menu"><summary className={view==='articles'||view==='article'?'active':''}>博客 <ChevronDown size={14}/></summary><div className="blog-dropdown"><a href="/articles">全部</a>{categories.map(c=><a key={c} href={`/articles?category=${encodeURIComponent(c)}`}>{c}</a>)}</div></details><a className={view==='notes'?'active':''} href="/notes">随记</a><a className={view==='archive'?'active':''} href="/archive">归档</a><a className={view==='about'?'active':''} href="/about">关于</a></nav><div className="header-actions"><button className="search-trigger" onClick={()=>setSearchOpen(true)} aria-label="搜索"><Search size={16}/><span>搜索</span></button><button className="icon-button" onClick={toggleTheme} aria-label={dark?'切换浅色模式':'切换深色模式'}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><button className="icon-button mobile-toggle" onClick={()=>setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-label="菜单">{mobileOpen?<X size={20}/>:<Menu size={20}/>}</button></div></header>
    <main id="main-content">
      {view==='home'&&<>{profile}<div className="home-sections">{(bio||description)&&<section className="home-section"><h2>About</h2>{bio&&<p>{bio}</p>}{description&&<p className="profile-description">{description}</p>}<a href="/about" className="more-link">More about me <ArrowRight size={15}/></a></section>}<section className="home-section"><h2>Statistics</h2><div className="statistics"><div><strong>{posts.filter(p=>p.kind==='article').length}</strong><span>文章</span></div><div><strong>{posts.filter(p=>p.kind==='note').length}</strong><span>随记</span></div><div><strong>{totalWords.toLocaleString()}</strong><span>字数</span></div></div></section></div></>}
      {(view==='articles'||view==='notes')&&<section className="listing-page"><h1>{view==='articles'?'博客':'随记'}</h1>{view==='articles'&&categories.length>0&&<div className="category-tabs" aria-label="分类">{['全部',...categories].map(c=><button key={c} className={c===category?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>}{postList(selected)}</section>}
      {view==='archive'&&<section className="listing-page archive-page"><h1>归档</h1>{years.length?years.map(year=><section key={year} className="archive-year"><h2>{year}</h2>{posts.filter(p=>new Date(p.publishedAt).getFullYear()===year).map(p=><a href={`/posts/${encodeURIComponent(p.slug)}`} key={p.id}><time>{formatDate(p.publishedAt).slice(5)}</time><span>{p.title}</span></a>)}</section>):<p className="empty-state">暂无内容</p>}</section>}
      {view==='about'&&<section className="about-page">{profile}{(bio||description)&&<div className="about-content"><h2>About</h2>{bio&&<p>{bio}</p>}{description&&<p className="profile-description">{description}</p>}</div>}</section>}
      {view==='article'&&article&&<article className="reading-layout"><div className="article-main"><a className="back-link" href={article.kind==='note'?'/notes':'/articles'}><ArrowLeft size={15}/>返回</a><h1>{article.title}</h1><div className="article-meta"><time>{formatDate(article.publishedAt)}</time><span>{article.category}</span><span>{readingTime(article.content)} 分钟</span></div>{article.coverImage&&<img className="article-cover" src={article.coverImage} alt={article.title}/>}<Markdown content={article.content}/><div className="article-tags">{article.tags.map(tag=><button key={tag} onClick={()=>{setQuery(tag);setSearchOpen(true)}}>#{tag}</button>)}</div><button className="copy-link" onClick={async()=>{try{await navigator.clipboard.writeText(location.href);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'已复制':'复制链接'}</button></div>{getMarkdownHeadings(article.content).length>0&&<aside className="article-toc"><span>目录</span>{getMarkdownHeadings(article.content).map(h=><a key={h.id} href={`#${h.id}`} style={{paddingLeft:(h.level-1)*8}}>{h.text}</a>)}</aside>}</article>}
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} {name}</span><a href="/admin">管理</a></footer>
    {searchOpen&&<div className="search-backdrop" onClick={()=>setSearchOpen(false)}><section className="search-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label="搜索" onClick={e=>e.stopPropagation()}><div className="search-input-row"><Search size={19}/><input ref={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索" aria-label="搜索关键词"/><button aria-label="关闭搜索" onClick={()=>setSearchOpen(false)}><X size={19}/></button></div><div className="search-results">{results.length?results.map(p=><a key={p.id} href={`/posts/${encodeURIComponent(p.slug)}`}><strong>{p.title}</strong><time>{formatDate(p.publishedAt)}</time></a>):<p className="empty-state">暂无结果</p>}</div></section></div>}
  </div>;
}
