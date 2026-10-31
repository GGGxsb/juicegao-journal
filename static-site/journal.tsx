'use client';
import {useEffect,useState} from 'react';
import Journal from './components/site';
import CityMap from './components/city-map';
import {TagsContent} from './components/navigation-pages';
import {snapshot,collection,paginate} from './runtime';

export default function StaticJournal({view,id}:{view:'home'|'about'|'articles'|'tags'|'map'|'article';id?:string}){
  const [query,setQuery]=useState('');
  useEffect(()=>{setQuery(window.location.search);},[]);
  const params=new URLSearchParams(query),posts=collection(params),article=snapshot.posts.find(post=>post.id===id);
  const related=snapshot.posts.filter(post=>post.category===article?.category),index=related.findIndex(post=>post.id===id);
  const tags=new Map<string,number>();for(const post of snapshot.posts)for(const tag of new Set(post.tags))tags.set(tag,(tags.get(tag)||0)+1);
  const tagPage=paginate([...tags].sort((a,b)=>a[0].localeCompare(b[0],'zh-CN')).map(([tag,postCount])=>({tag,postCount})),params);
  return <Journal settings={snapshot.settings} view={view} posts={view==='articles'?posts.posts:[]} pagination={view==='articles'?posts.pagination:undefined} stats={snapshot.stats} home={view==='home'?snapshot.home:undefined}
    article={article} selectedCategory={params.get('category')||'全部'} selectedTag={params.get('tag')||''} searchQuery={params.get('q')||''} returnToMap={params.get('from')==='map'}
    navigation={article?{previous:related[index+1]||null,next:related[index-1]||null}:undefined}>
    {view==='map'&&<CityMap posts={snapshot.posts}/>}{view==='tags'&&<TagsContent tags={tagPage.items} pagination={tagPage.pagination}/>}
  </Journal>;
}
