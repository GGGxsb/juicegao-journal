/** Run inside the app container. Prints fixed diagnostic messages, never secrets. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const query=`query Contributions($login: String!) {
  user(login: $login) { login contributionsCollection { contributionCalendar {
    totalContributions weeks { contributionDays { date contributionCount contributionLevel } }
  } } }
}`;
const usernamePattern=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const messages={
  missing_token:'应用容器没有读到 Token。请确认修改的是部署使用的 .env，并重新创建 app 容器。',
  missing_username:'没有找到有效的 GitHub 用户名。请填写用户名，不要填写完整主页网址；或在后台设置 GitHub 主页。',
  invalid_token_format:'Token 中存在空格、引号或其他异常字符，请检查复制是否完整。',
  invalid_token:'GitHub 拒绝了 Token。它可能复制不完整、已过期、被撤销或无效。',
  rate_limited:'GitHub 返回了请求频率限制，请等待限额恢复后再试。',
  forbidden:'GitHub 拒绝访问。请检查令牌权限、组织策略，以及令牌是否仍在等待批准。',
  user_not_found:'GitHub 没有找到所配置的用户，请核对账号用户名。',
  timeout:'连接 GitHub 超时，请检查服务器到 api.github.com 的网络。',
  network_error:'服务器无法连接 GitHub，请检查 DNS、网络、防火墙或代理配置。',
  upstream_error:'GitHub 返回了异常响应，请稍后重试。',
  invalid_response:'GitHub 返回的日历格式与应用预期不同，需要检查数据解析。',
  success:'Token、用户名和 GitHub 贡献日历请求均正常。',
};
export async function diagnoseGithub({environment=process.env,fetcher=fetch,profile=''}={}) {
  const token=environment.GITHUB_CONTRIBUTIONS_TOKEN?.trim()||'';
  let username=environment.GITHUB_CONTRIBUTIONS_USERNAME?.trim()||'';
  if(!username){try{const url=new URL(profile);if(url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.port)username=/^\/([^/]+)\/?$/.exec(url.pathname)?.[1]||'';}catch{}}
  const settings={tokenPresent:Boolean(token),tokenType:token.startsWith('github_pat_')?'fine-grained':token.startsWith('ghp_')?'classic':'unknown',username:usernamePattern.test(username)?username:null};
  const report=(code,extra={})=>({...settings,code,message:messages[code],...extra});
  if(!token)return report('missing_token');
  if(!usernamePattern.test(username))return report('missing_username');
  if(/[\s\x00-\x1f\x7f'"`]/.test(token))return report('invalid_token_format');
  const start=Date.now();let response;
  try{
    response=await fetcher('https://api.github.com/graphql',{
      method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json','User-Agent':'JuiceGao-Journal'},
      body:JSON.stringify({query,variables:{login:username}}),
    });
    const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const info={httpStatus:response.status,elapsedMs:Date.now()-start,contentType:['application/json','application/graphql-response+json','text/html','text/plain'].includes(contentType)?contentType:'other'};
    const invalid=(reason,extra={})=>report('invalid_response',{...info,reason,...extra});
    if(response.status===401)return report('invalid_token',info);
    if(response.status===429||(response.status===403&&response.headers.get('x-ratelimit-remaining')==='0'))return report('rate_limited',info);
    if(response.status===403)return report('forbidden',info);
    if(!response.ok)return report('upstream_error',info);
    const reader=response.body?.getReader();if(!reader)return invalid('missing_body');
    const decoder=new TextDecoder();let raw='',size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024)return invalid('body_too_large',{bodyBytes:size});raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
    finally{await reader.cancel().catch(()=>{});}
    info.bodyBytes=size;
    let data;try{data=JSON.parse(raw);}catch{return invalid('invalid_json');}
    if(!data||typeof data!=='object'||Array.isArray(data))return invalid('invalid_json_root');
    const errorTypes=Array.isArray(data.errors)?data.errors.map(error=>error?.type||error?.extensions?.code):[];
    if(errorTypes.some(type=>type==='NOT_FOUND'))return report('user_not_found',info);
    if(errorTypes.some(type=>['FORBIDDEN','INSUFFICIENT_SCOPES','UNAUTHORIZED'].includes(type)))return report('forbidden',info);
    if(errorTypes.some(type=>type==='RATE_LIMITED'))return report('rate_limited',info);
    if(errorTypes.length)return report('upstream_error',info);
    const user=data.data?.user,calendar=user?.contributionsCollection?.contributionCalendar;
    if(user===null)return report('user_not_found',info);
    if(!user||typeof user!=='object')return invalid('missing_user',{hasData:Boolean(data.data)});
    if(typeof user.login!=='string'||user.login.toLowerCase()!==username.toLowerCase())return invalid('login_mismatch');
    if(!calendar||typeof calendar!=='object')return invalid('missing_calendar');
    if(!Number.isSafeInteger(calendar.totalContributions)||calendar.totalContributions<0)return invalid('invalid_total',{totalType:typeof calendar.totalContributions});
    if(!Array.isArray(calendar.weeks)||calendar.weeks.length>54)return invalid('invalid_weeks',{weeksIsArray:Array.isArray(calendar.weeks),...(Array.isArray(calendar.weeks)?{weekCount:calendar.weeks.length}:{})});
    info.weekCount=calendar.weeks.length;
    const levels=['NONE','FIRST_QUARTILE','SECOND_QUARTILE','THIRD_QUARTILE','FOURTH_QUARTILE'];
    let previous=null,days=0;
    for(const week of calendar.weeks){
      if(!Array.isArray(week?.contributionDays)||week.contributionDays.length>7)return invalid('invalid_week',{dayIndex:days});
      for(const day of week.contributionDays){
        const date=typeof day?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day.date)?Date.parse(`${day.date}T00:00:00Z`):NaN;
        if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==day.date)return invalid('invalid_date',{dayIndex:days,dateType:typeof day?.date});
        if(!Number.isInteger(day.contributionCount)||day.contributionCount<0)return invalid('invalid_count',{dayIndex:days,countType:typeof day.contributionCount});
        if(!levels.includes(day.contributionLevel))return invalid('invalid_level',{dayIndex:days,levelType:typeof day.contributionLevel});
        if(previous!==null&&date-previous!==86400000)return invalid('non_consecutive_dates',{dayIndex:days,previousDate:new Date(previous).toISOString().slice(0,10),date:day.date});
        previous=date;days++;
      }
    }
    if(days<1||days>54*7)return invalid('invalid_day_count',{dayCount:days});
    return report('success',{...info,elapsedMs:Date.now()-start,days,totalContributions:calendar.totalContributions});
  }catch(error){
    const timeout=['AbortError','TimeoutError'].includes(error?.name)||['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(error?.cause?.code);
    const knownCodes=['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'];
    return report(timeout?'timeout':'network_error',{elapsedMs:Date.now()-start,...(knownCodes.includes(error?.cause?.code)?{networkCode:error.cause.code}:{})});
  }
}
async function main(){
  let profile='';
  if(!process.env.GITHUB_CONTRIBUTIONS_USERNAME?.trim()){
    try{
      const {DatabaseSync}=await import('node:sqlite');
      const db=new DatabaseSync(path.join(process.env.DATA_DIR||path.join(process.cwd(),'data'),'journal.sqlite'),{readOnly:true});
      try{profile=db.prepare("SELECT github FROM site_settings WHERE id='site'").get()?.github||'';}finally{db.close();}
    }catch{ /* The diagnostic will explain when no username can be resolved. */ }
  }
  const result=await diagnoseGithub({profile});
  console.log(JSON.stringify(result,null,2));process.exitCode=result.code==='success'?0:1;
}
// Both `node scripts/...` and piping this file into `node --input-type=module` work.
if(!process.argv[1]||path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main();}catch{console.log(JSON.stringify({code:'diagnostic_error',message:'诊断未能完成，请确认在应用容器中使用 Node.js 24 运行。'}));process.exitCode=1;}
}
