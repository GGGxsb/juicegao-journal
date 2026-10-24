import {getTrafficTotals,recordPageView} from '@/app/lib/analytics';
import {apiRoute,ApiError,json,readBodyBytes,requireSameOrigin} from '@/app/lib/server';

export const dynamic='force-dynamic';

export async function GET() {
  return apiRoute(async()=>json(await getTrafficTotals()));
}

export async function POST(request:Request) {
  return apiRoute(async()=>{
    requireSameOrigin(request);
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415,'请以 JSON 格式提交。');
    let input:unknown;
    const bytes=await readBodyBytes(request,2048);
    try {input=JSON.parse(new TextDecoder().decode(bytes));} catch {throw new ApiError(400,'提交内容不是有效的 JSON。');}
    const {data,cookie}=await recordPageView(request,input);
    const response=json(data);
    if(cookie) response.headers.append('Set-Cookie',cookie);
    return response;
  });
}
