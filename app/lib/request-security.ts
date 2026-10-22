import {isIP} from 'node:net';
import {ApiError} from './errors';
export function isLoopbackHost(host:string){try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(`http://${host}`).hostname.toLowerCase())}catch{return false}}
export function requestOrigin(request:Request){
  const url=new URL(request.url),host=request.headers.get('host')||url.host;
  const forwarded=process.env.TRUST_PROXY==='true'?request.headers.get('x-forwarded-proto'):null;
  const scheme=forwarded==='https'||forwarded==='http'?forwarded:url.protocol.slice(0,-1);
  let origin:string;try{origin=new URL(`${scheme}://${host}`).origin}catch{throw new ApiError(403,'访问地址无效。')}
  if(process.env.APP_ORIGIN&&!isLoopbackHost(host)){
    let configured:string;try{configured=new URL(process.env.APP_ORIGIN).origin}catch{throw new ApiError(503,'网站访问地址配置错误。')}
    if(origin!==configured)throw new ApiError(403,'请通过网站配置的地址访问。');
  }
  return origin;
}
export function assertSafeLoginTransport(request:Request){const origin=new URL(requestOrigin(request));if(origin.protocol!=='https:'&&!isLoopbackHost(origin.host))throw new ApiError(403,'请通过 HTTPS 或 SSH 隧道访问后台。');}
export function clientAddress(request:Request){const supplied=process.env.TRUST_PROXY==='true'?request.headers.get('x-real-ip'):null;return supplied&&isIP(supplied)?supplied:isLoopbackHost(request.headers.get('host')||new URL(request.url).host)?'loopback':'unknown';}
