'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Search,Sun,Moon,ChevronDown,ArrowLeft,ArrowRight,MapPin,Mail,Menu,X,UserRound,Check,Copy,Code2} from 'lucide-react';
import type {Post,SiteSettings,Pagination,PostStatistics,PostCollection,HomeOverview,ArticleNavigation as ArticleNavigationData} from '../lib/types';
import {Markdown,getMarkdownHeadings} from './markdown';
import {PageNavigation} from './pagination';
import ArticleFeedback from './article-feedback';
import HomeContent from './home-content';
import PostList from './post-list';
import ArticleReader from './article-reader';
import { ArticleNavigation } from './article-navigation';
import { postHref } from '../lib/post-links';
import './site-navigation.css';

type View='home'|'articles'|'notes'|'archive'|'about'|'article'|'tags'|'collections';
type JournalProps={settings:SiteSettings;posts:Post[];view:View;article?:Post;pagination?:Pagination;stats?:PostStatistics;categories?:string[];selectedCategory?:string;selectedTag?:string;searchQuery?:string;home?:HomeOverview;navigation?:ArticleNavigationData;children?:ReactNode};
const formatDate=(value:string)=>new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai'}).replaceAll('/','-');
const readingTime=(content:string)=>Math.max(1,Math.ceil(content.replace(/\s/g,'').length/400));
export default function Journal({settings,posts,view,article,pagination,stats,categories=[],selectedCategory='全部',selectedTag='',searchQuery='',home,navigation,children}:JournalProps){
  const [dark,setDark]=useState(false),[searchOpen,setSearchOpen]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[query,setQuery]=useState(''),[copied,setCopied]=useState(false);
  const [searchPage,setSearchPage]=useState(1),[results,setResults]=useState<PostCollection|null>(null),[searchLoading,setSearchLoading]=useState(false),[searchError,setSearchError]=useState('');
  const input=useRef<HTMLInputElement>(null),dialog=useRef<HTMLElement>(null);
  useEffect(()=>{const saved=localStorage.getItem('journal-theme');const value=saved?saved==='dark':matchMedia('(prefers-color-scheme: dark)').matches;setDark(value);document.documentElement.dataset.theme=value?'dark':'light'},[]);
  useEffect(()=>{function keys(event:KeyboardEvent){if(event.key==='Escape'){setSearchOpen(false);setMobileOpen(false)}if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();setSearchOpen(value=>!value)}}document.addEventListener('keydown',keys);return()=>document.removeEventListener('keydown',keys)},[]);
  useEffect(()=>{
    if(!searchOpen)return;
    const before=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';input.current?.focus();
    function trap(event:KeyboardEvent){if(event.key!=='Tab')return;const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('input,button:not([disabled]),a[href]')??[]).filter(element=>element.getClientRects().length>0);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
    document.addEventListener('keydown',trap);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',trap);before?.focus()};
  },[searchOpen]);
  useEffect(()=>{
    if(!searchOpen)return;
    setResults(null);setSearchError('');
    if(!query.trim()){setSearchLoading(false);return}
    const controller=new AbortController();setSearchLoading(true);
    const timer=setTimeout(async()=>{try{const params=new URLSearchParams({q:query.trim(),page:String(searchPage),pageSize:'10'});const response=await fetch(`/api/posts?${params}`,{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'搜索失败，请稍后重试。');if(!controller.signal.aborted){setResults(data);if(data.pagination.page!==searchPage)setSearchPage(data.pagination.page)}}catch(cause){if(!controller.signal.aborted)setSearchError(cause instanceof Error?cause.message:'搜索失败，请重试。')}finally{if(!controller.signal.aborted)setSearchLoading(false)}},250);
    return()=>{clearTimeout(timer);controller.abort()};
  },[searchOpen,query,searchPage]);
  function search(value:string){setQuery(value);setSearchPage(1)}
  function toggleTheme(){setDark(!dark);document.documentElement.dataset.theme=!dark?'dark':'light';localStorage.setItem('journal-theme',!dark?'dark':'light')}
  const name=settings.name||'JuiceGao',bio=settings.bio==='记录、探索，保持好奇。'?'':settings.bio,description=settings.description==='一个记录技术、生活与灵感的个人空间。'?'':settings.description;
  const years=Array.from(new Set(posts.map(post=>new Date(post.publishedAt).getFullYear())));
  function pageHref(page:number){const params=new URLSearchParams();if(selectedCategory!=='全部'&&selectedCategory)params.set('category',selectedCategory);if(selectedTag)params.set('tag',selectedTag);if(searchQuery)params.set('q',searchQuery);if(pagination&&pagination.pageSize!==15)params.set('pageSize',String(pagination.pageSize));if(page>1)params.set('page',String(page));const route=view==='notes'?'/notes':view==='archive'?'/archive':'/articles';return route+(params.size?`?${params}`:'')}
  function categoryHref(category:string){const params=new URLSearchParams();if(category!=='全部')params.set('category',category);if(selectedTag)params.set('tag',selectedTag);if(searchQuery)params.set('q',searchQuery);return '/articles'+(params.size?`?${params}`:'')}
  const profile=<section className="profile"><div className="profile-avatar">{settings.avatar?<img src={settings.avatar} alt={name}/>:<UserRound size={58} strokeWidth={1}/>}</div><div className="profile-details"><h1>{name}</h1><div className="profile-labels">{settings.location&&<span><MapPin size={15}/>{settings.location}</span>}{settings.github&&<a href={settings.github} target="_blank" rel="noreferrer"><Code2 size={15}/>Github</a>}{settings.email&&<a href={`mailto:${settings.email}`}><Mail size={15}/>Email</a>}</div></div></section>;
  const postList=<PostList posts={posts}/>;
  const count=pagination&&<p className="listing-count">{searchQuery&&<>“{searchQuery}” · </>}共 {pagination.total} 篇{pagination.totalPages>1&&<> · 第 {pagination.page} / {pagination.totalPages} 页</>}</p>;
  const pageNavigation=pagination&&<PageNavigation pagination={pagination} hrefForPage={pageHref} label={view==='archive'?'归档分页':'内容分页'}/>;
  return <div className="journal">
    <header className="site-header"><a href="/" className="site-name">{name}'s Blog</a><nav className={mobileOpen?'main-nav is-open':'main-nav'} aria-label="主导航"><details className="blog-menu"><summary className={view==='articles'||view==='article'||view==='tags'||view==='collections'?'active':''}>博客 <ChevronDown size={14}/></summary><div className="blog-dropdown"><a href="/articles" className="blog-directory-link">全部文章</a><a href="/tags" className="blog-directory-link">标签</a><a href="/collections" className="blog-directory-link">合集</a>{categories.map(category=><a key={category} href={categoryHref(category)}>{category}</a>)}</div></details><a className={view==='notes'?'active':''} href="/notes">随记</a><a className={view==='archive'?'active':''} href="/archive">归档</a><a className={view==='about'?'active':''} href="/about">关于</a></nav><div className="header-actions"><button className="search-trigger" onClick={()=>setSearchOpen(true)} aria-label="搜索"><Search size={16}/><span>搜索</span></button><button className="icon-button" onClick={toggleTheme} aria-label={dark?'切换浅色模式':'切换深色模式'}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><button className="icon-button mobile-toggle" onClick={()=>setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-label="菜单">{mobileOpen?<X size={20}/>:<Menu size={20}/>}</button></div></header>
    <main id="main-content">
      {view==='home'&&<>{profile}<HomeContent settings={settings} bio={bio} description={description} stats={stats} home={home}/></>}
      {(view==='articles'||view==='notes')&&<section className="listing-page"><h1>{view==='articles'?'博客':'随记'}</h1>{view==='articles'&&categories.length>0&&<nav className="category-tabs" aria-label="分类">{['全部',...categories].map(category=><a key={category} className={category===selectedCategory?'selected':''} href={categoryHref(category)} aria-current={category===selectedCategory?'page':undefined}>{category}</a>)}</nav>}<div className="listing-tools"><span>{selectedTag?`标签：${selectedTag}`:"按主题浏览记录"}</span><nav aria-label="内容导航"><a href="/tags">所有标签</a><a href="/collections">文章合集</a></nav></div>{count}{postList}{pageNavigation}</section>}
      {view==='archive'&&<section className="listing-page archive-page"><h1>归档</h1>{selectedTag&&<p className="tag-filter-label">标签：{selectedTag}<a href="/tags">所有标签</a></p>}{count}{years.length?years.map(year=><section key={year} className="archive-year"><h2>{year}</h2>{posts.filter(post=>new Date(post.publishedAt).getFullYear()===year).map(post=><a href={postHref(post)} key={post.id}><time>{formatDate(post.publishedAt).slice(5)}</time><span>{post.title}</span></a>)}</section>):<p className="empty-state">暂无内容</p>}{pageNavigation}</section>}
      {view==='about'&&<section className="about-page">{profile}<div className="about-content"><h2>关于我</h2><p>{bio||'学习经历，生活随谈。'}</p>{description&&<div className="home-copy"><Markdown content={description}/></div>}{settings.education?.trim()&&<><h2>学习经历</h2><div className="home-copy"><Markdown content={settings.education}/></div></>}</div></section>}
      {(view==='tags'||view==='collections')&&children}
      {view==='article'&&article&&<article className="reading-layout">
        <div className="article-main" data-article-main>
          <a className="back-link" href={article.kind==='note'?'/notes':'/articles'}><ArrowLeft size={15}/>返回</a>
          <h1>{article.title}</h1>
          <div className="article-meta"><time>{formatDate(article.publishedAt)}</time><span>{article.category}</span><span>{readingTime(article.content)} 分钟</span></div>
          {article.coverImage&&<img className="article-cover" src={article.coverImage} alt={article.title}/>}
          <div data-article-body><Markdown content={article.content}/></div>
          <div className="article-tags">{article.tags.map(tag=><a key={tag} href={`/tags/${encodeURIComponent(tag)}`}>#{tag}</a>)}</div>
          <button className="copy-link" onClick={async()=>{try{await navigator.clipboard.writeText(location.href);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'已复制':'复制链接'}</button>
          {navigation&&<ArticleNavigation navigation={navigation}/>}
          <ArticleFeedback postId={article.id}/>
        </div>
        <ArticleReader postId={article.id} headings={getMarkdownHeadings(article.content)}/>
      </article>}
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} {name}</span><a href="/admin">管理</a></footer>
    {searchOpen&&<div className="search-backdrop" onClick={()=>setSearchOpen(false)}><section className="search-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label="搜索" onClick={event=>event.stopPropagation()}><div className="search-input-row"><Search size={19}/><input ref={input} value={query} onChange={event=>search(event.target.value)} placeholder="搜索" aria-label="搜索关键词" maxLength={200}/><button aria-label="关闭搜索" onClick={()=>setSearchOpen(false)}><X size={19}/></button></div><div className="search-results" aria-busy={searchLoading}>{searchLoading?<p className="empty-state" role="status">正在搜索…</p>:searchError?<p className="feedback-error" role="alert">{searchError}</p>:!query.trim()?<p className="empty-state">输入关键词搜索</p>:results?.posts.length?results.posts.map(post=><a key={post.id} href={postHref(post)}><strong>{post.title}</strong><time>{formatDate(post.publishedAt)}</time></a>):<p className="empty-state">暂无结果</p>}</div>{results&&<div className="search-pagination"><span>共 {results.pagination.total} 条结果</span><PageNavigation pagination={results.pagination} onPageChange={setSearchPage} label="搜索结果分页"/></div>}</section></div>}
  </div>;
}
