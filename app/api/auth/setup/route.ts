import {authHandler} from '../handler';
export const dynamic='force-dynamic';
export function POST(request:Request){return authHandler(request,'setup');}
