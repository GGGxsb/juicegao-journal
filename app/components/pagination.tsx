'use client';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {Pagination} from '../lib/types';

export function PageNavigation({pagination,hrefForPage,onPageChange,label='分页'}:{pagination:Pagination;hrefForPage?:(page:number)=>string;onPageChange?:(page:number)=>void;label?:string}) {
  const {page,totalPages}=pagination;
  if(totalPages<=1)return null;
  const pages=Array.from(new Set([1,totalPages,page-1,page,page+1].filter(value=>value>=1&&value<=totalPages))).sort((a,b)=>a-b);
  function control(target:number,text:React.ReactNode,description:string,disabled=false,current=false){
    if(disabled)return <span className="page-control is-disabled" aria-disabled="true">{text}</span>;
    if(hrefForPage)return <a className={`page-control${current?' is-current':''}`} href={hrefForPage(target)} aria-label={description} aria-current={current?'page':undefined}>{text}</a>;
    return <button className={`page-control${current?' is-current':''}`} type="button" onClick={()=>onPageChange?.(target)} aria-label={description} aria-current={current?'page':undefined}>{text}</button>;
  }
  return <nav className="page-navigation" aria-label={label}>
    {control(page-1,<ChevronLeft size={16}/>, '上一页',page<=1)}
    {pages.map((value,index)=><span className="page-slot" key={value}>{index>0&&value-pages[index-1]>1&&<span className="page-ellipsis" aria-hidden="true">…</span>}{control(value,value,`第 ${value} 页`,false,value===page)}</span>)}
    {control(page+1,<ChevronRight size={16}/>, '下一页',page>=totalPages)}
  </nav>;
}
