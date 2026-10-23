import { apiRoute, ApiError, json } from '@/app/lib/server';
export async function GET(request:Request) {
  return apiRoute(async()=>{
    const params=new URL(request.url).searchParams,repo=params.get('repo')||'';
    if(params.getAll('repo').length!==1||!/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(repo)||repo.endsWith('/.')||repo.endsWith('/..'))throw new ApiError(400,'仓库格式应为 owner/repository。');
    // The host and endpoint are fixed: article authors cannot make arbitrary server requests.
    const response=await fetch(`https://api.github.com/repos/${repo}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'JuiceGao-Journal'},next:{revalidate:3600},signal:AbortSignal.timeout(5000)}).catch(()=>{throw new ApiError(503,'仓库信息暂时不可用。');});
    if(!response.ok)throw new ApiError(response.status===404?404:503,'仓库信息暂时不可用。');
    const data=await response.json().catch(()=>{throw new ApiError(503,'仓库信息暂时不可用。');});
    let avatarUrl:string|null=null;
    try{const avatar=new URL(data.owner?.avatar_url);if(avatar.protocol==='https:'&&avatar.hostname==='avatars.githubusercontent.com'&&!avatar.username&&!avatar.password)avatarUrl=avatar.href;}catch{}
    return json({description:typeof data.description==='string'?data.description.slice(0,500):'',stars:Number.isSafeInteger(data.stargazers_count)?data.stargazers_count:0,forks:Number.isSafeInteger(data.forks_count)?data.forks_count:0,license:typeof data.license?.spdx_id==='string'?data.license.spdx_id.slice(0,80):null,avatarUrl,language:typeof data.language==='string'?data.language.slice(0,80):null,archived:data.archived===true});
  });
}
