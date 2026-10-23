import { ImageResponse } from 'next/og';
import { getSettings } from '../lib/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const settings = await getSettings();
  // A local, font-independent fallback; articles with covers share their own image.
  const name = /^[\x20-\x7e]{1,50}$/.test(settings.name) ? settings.name : 'Personal Journal';
  return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:72,background:'linear-gradient(135deg, #f1f7fa, #ffffff)',color:'#233747'}}>
    <div style={{display:'flex',alignItems:'center',gap:24}}><div style={{display:'flex',alignItems:'center',justifyContent:'center',width:80,height:80,borderRadius:22,background:'#659eb9',color:'white',fontSize:52}}>J.</div><span style={{fontSize:32}}>{name}</span></div>
    <div style={{display:'flex',flexDirection:'column',gap:24}}><span style={{fontSize:22,letterSpacing:8,color:'#659eb9'}}>A PERSONAL JOURNAL</span><div style={{display:'flex',flexDirection:'column',fontSize:68,lineHeight:1.2}}><span>Notes, ideas &amp;</span><span>everyday discoveries.</span></div></div>
    <span style={{fontSize:22,color:'#718391'}}>Read. Think. Write. Repeat.</span>
  </div>, {width:1200,height:630,headers:{'Cache-Control':'public, max-age=3600'}});
}
