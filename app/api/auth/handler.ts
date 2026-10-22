import {assertSafeLoginTransport} from '@/app/lib/request-security';
import {apiRoute,json,readBodyBytes,requireSameOrigin} from '@/app/lib/server';
import {setupAdmin,loginAdmin,logoutAdmin,changeAdminPassword} from '@/app/lib/admin-auth';
import {ApiError} from '@/app/lib/errors';
export async function authHandler(request:Request,action:'setup'|'login'|'logout'|'password') {
  return apiRoute(async()=>{
    requireSameOrigin(request);
    assertSafeLoginTransport(request);
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ApiError(415,'请以 JSON 格式提交。');
    const bytes=await readBodyBytes(request,16*1024);let input:unknown;
    try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'提交内容格式错误。');}
    if(action==='logout'){const result=await logoutAdmin(request);const response=json({ok:true});response.headers.append('Set-Cookie',result.cookie);return response;}
    const result=await (action==='setup'?setupAdmin(request,input):action==='login'?loginAdmin(request,input):changeAdminPassword(request,input));
    const response=json({session:result.session},action==='setup'?201:200);response.headers.append('Set-Cookie',result.cookie);return response;
  });
}
