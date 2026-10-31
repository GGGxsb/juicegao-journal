import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,cp,rm,readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root=process.cwd(),stage=path.resolve(root,'.pages-build'),content=path.resolve(root,'.pages-content');
assert.equal(path.dirname(stage),root);assert.equal(path.basename(stage),'.pages-build');
const pointer=JSON.parse(await readFile(path.join(content,'current.json'),'utf8'));
const run=path.resolve(content,pointer.run);
assert.ok(run.startsWith(path.join(content,'runs')+path.sep),'Invalid content pointer');
const snapshot=JSON.parse(await readFile(path.join(run,'snapshot.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(run,'manifest.json'),'utf8'));
const base=(process.env.PAGES_BASE_PATH||'').replace(/\/$/,'');
assert.ok(!base||/^\/[a-zA-Z0-9_.-]+$/.test(base),'PAGES_BASE_PATH must be empty or one /repository segment');
const site=new URL(process.env.PAGES_SITE_URL||`https://example.github.io${base}/`);
assert.ok(!site.username&&!site.password&&!site.search&&!site.hash&&site.protocol==='https:','Invalid public Pages URL');
assert.notEqual(site.origin,manifest.sourceOrigin,'Pages and its sync source must use different hostnames; keep a separate origin domain.');
await rm(stage,{recursive:true,force:true});
await mkdir(path.join(stage,'app','data'),{recursive:true});
await cp(path.join(root,'app','components'),path.join(stage,'app','components'),{recursive:true});
await cp(path.join(root,'app','lib'),path.join(stage,'app','lib'),{recursive:true});
await cp(path.join(root,'public'),path.join(stage,'public'),{recursive:true});
await cp(path.join(run,'public'),path.join(stage,'public'),{recursive:true});
await cp(path.join(root,'app','globals.css'),path.join(stage,'app','globals.css'));
for(const file of ['package.json','postcss.config.mjs'])await cp(path.join(root,file),path.join(stage,file));
await writeFile(path.join(stage,'app','data','snapshot.json'),JSON.stringify(snapshot));
for(const [source,target] of [['runtime.ts','runtime.ts'],['journal.tsx','static-journal.tsx'],['feedback.tsx','components/article-feedback.tsx']])await cp(path.join(root,'static-site',source),path.join(stage,'app',target));
await writeFile(path.join(stage,'app','components','page-view-tracker.tsx'),`'use client';\nexport default function PageViewTracker(_props:{onRecorded?:(value:import('../lib/analytics-types').RecordedPageView)=>void}){return null;}\n`);
await writeFile(path.join(stage,'app','lib','post-links.ts'),`export function postHref(post:{id:string}){return '/posts/'+encodeURIComponent(post.id)+'/';}\nexport function tagHref(tag:string){return '/articles?'+new URLSearchParams({tag});}\n`);

const routes=[];
async function put(relative,text){const filename=path.join(stage,relative);await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,text);if(relative.endsWith('/page.tsx')||relative==='app/layout.tsx')routes.push(relative);}
await put('app/layout.tsx',`import {ThemeProvider} from './components/theme';
import {themeScript} from './lib/theme-script';
import SiteMotion from './components/site-motion';
import './globals.css';import './components/site-motion.css';
export const metadata={title:${JSON.stringify(snapshot.settings.name+"'s Blog")},description:${JSON.stringify(snapshot.settings.bio||snapshot.settings.description.slice(0,160))},metadataBase:new URL(${JSON.stringify(site.origin)}),icons:{icon:${JSON.stringify(base+'/favicon.svg')}}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body className="antialiased"><ThemeProvider>{children}<SiteMotion/></ThemeProvider></body></html>;}`);
for(const [route,view,title] of [['','home','首页'],['about','about','关于'],['articles','articles','博客'],['tags','tags','标签'],['map','map','地图']]){
  const prefix=route?'../':'./';
  await put(`app/${route?route+'/':''}page.tsx`,`import StaticJournal from '${prefix}static-journal';
export const metadata={title:${JSON.stringify(title+' · '+snapshot.settings.name)},alternates:{canonical:${JSON.stringify(site.origin+base+'/'+route+(route?'/':''))}}};
export default function Page(){return <StaticJournal view=${JSON.stringify(view)}/>;}`);
}
if(snapshot.posts.length)await put('app/posts/[id]/page.tsx',`import StaticJournal from '../../static-journal';import {snapshot} from '../../runtime';import {notFound} from 'next/navigation';
export const dynamicParams=false;
export function generateStaticParams(){return snapshot.posts.map(post=>({id:post.id}));}
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;const post=snapshot.posts.find(p=>p.id===id);return {title:post?.title,description:post?.excerpt,alternates:{canonical:${JSON.stringify(site.origin+base+'/posts/')}+encodeURIComponent(id)+'/'} };}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!snapshot.posts.some(p=>p.id===id))notFound();return <StaticJournal view="article" id={id}/>;}`);
await put('app/origin-redirect.tsx',`'use client';import {useEffect} from 'react';export default function Redirect({url}:{url:string}){useEffect(()=>{window.location.replace(url)},[url]);return <p><a href={url}>前往网站</a></p>;}`);
for(const route of ['admin','comment-login','notes','archive','collections']){
  const target=route==='admin'||route==='comment-login'?manifest.sourceOrigin+'/'+route:base+'/articles/';
  await put(`app/${route}/page.tsx`,`import Redirect from '../origin-redirect';export const metadata={robots:{index:false,follow:false}};export default function Page(){return <Redirect url=${JSON.stringify(target)}/>;}`);
}

// Preserve source components and styling. Only the isolated Pages build rewrites
// link/asset URLs and uses read-only snapshot requests; the server app is untouched.
async function transformDirectory(directory){
  for(const item of await readdir(directory,{withFileTypes:true})){
    const filename=path.join(directory,item.name);
    if(item.isDirectory()){await transformDirectory(filename);continue;}
    if(item.name.endsWith('.css')){
      const css=await readFile(filename,'utf8');
      await writeFile(filename,css.replace(/url\((['"]?)\/(?!\/)/g,(_match,quote)=>`url(${quote}${base}/`));continue;
    }
    if(!/\.[jt]sx?$/.test(item.name))continue;
    const original=await readFile(filename,'utf8'),source=ts.createSourceFile(filename,original,ts.ScriptTarget.Latest,true,filename.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const helpers=new Set();
    const result=ts.transform(source,[context=>node=>{
      function visit(current){
        if(ts.isJsxAttribute(current)&&['href','src'].includes(current.name.getText(source))&&current.initializer){
          const init=current.initializer,expression=ts.isStringLiteral(init)?init:ts.isJsxExpression(init)?init.expression:undefined;
          if(expression){helpers.add('siteHref');return ts.factory.updateJsxAttribute(current,current.name,ts.factory.createJsxExpression(undefined,ts.factory.createCallExpression(ts.factory.createIdentifier('siteHref'),undefined,[expression])));}
        }
        if(ts.isCallExpression(current)&&ts.isIdentifier(current.expression)&&current.expression.text==='fetch'){
          helpers.add('siteFetch');return ts.factory.updateCallExpression(current,ts.factory.createIdentifier('siteFetch'),current.typeArguments,current.arguments.map(argument=>ts.visitNode(argument,visit)));
        }
        return ts.visitEachChild(current,visit,context);
      }
      return ts.visitNode(node,visit);
    }]);
    if(helpers.size){
      let relative=path.relative(path.dirname(filename),path.join(stage,'app','runtime')).replaceAll('\\','/');if(!relative.startsWith('.'))relative='./'+relative;
      const code=ts.createPrinter().printFile(result.transformed[0]);
      const statement=`import {${[...helpers].join(',')}} from ${JSON.stringify(relative)};\n`;
      await writeFile(filename,code.replace(/^(\s*['"]use client['"];?\s*)?/,match=>match+statement));
    }
    result.dispose();
  }
}
await transformDirectory(path.join(stage,'app','components'));
const env={NEXT_PUBLIC_PAGES_BASE_PATH:base,NEXT_PUBLIC_PAGES_SOURCE_ORIGIN:manifest.sourceOrigin};
await put('next.config.mjs',`export default ${JSON.stringify({output:'export',trailingSlash:true,basePath:base,env,images:{unoptimized:true},experimental:{cpus:2}})};`);
const tsconfig=JSON.parse(await readFile(path.join(root,'tsconfig.json'),'utf8'));
tsconfig.include=['next-env.d.ts',...routes,'.next/types/**/*.ts'];tsconfig.exclude=['node_modules'];
await put('tsconfig.json',JSON.stringify(tsconfig,null,2));
await put('public/.nojekyll','');
await put('public/sync-info.json',JSON.stringify({generatedAt:manifest.generatedAt,posts:snapshot.posts.length,images:Object.keys(manifest.media).length}));
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
await put('public/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/','/about/','/articles/','/map/','/tags/',...snapshot.posts.map(p=>'/posts/'+encodeURIComponent(p.id)+'/')].map(route=>'<url><loc>'+escape(site.origin+base+route)+'</loc></url>').join('')+'</urlset>');
await put('public/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${site.origin}${base}/sitemap.xml\n`);
const result=spawnSync(process.execPath,[path.join(root,'node_modules','next','dist','bin','next'),'build',stage,'--webpack'],{cwd:root,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
if(result.status!==0)process.exit(result.status||1);
console.log('GitHub Pages output: '+path.join(stage,'out'));
