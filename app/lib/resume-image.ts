/** Public card images may use local media or HTTPS without embedded credentials. */
export function resumeImageUrl(value:unknown):string|undefined {
  if(typeof value!=='string'||!value||value.length>2048||/[\u0000-\u0020\u007f\\]/.test(value)) return undefined;
  if(value.startsWith('/')) return value.startsWith('//')?undefined:value;
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&url.hostname&&!url.username&&!url.password?value:undefined;
  } catch {return undefined;}
}
