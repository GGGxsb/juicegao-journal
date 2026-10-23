/** A small population-weighted palette; transparent borders and near-white/black pixels do not dominate. */
export function dominantCoverColor(pixels: Uint8ClampedArray): string | null {
  const buckets = new Map<number,{weight:number;r:number;g:number;b:number}>();
  for(let i=0;i+3<pixels.length;i+=4) {
    const [r,g,b,a]=pixels.subarray(i,i+4), high=Math.max(r,g,b), low=Math.min(r,g,b);
    if(a<128||high<20||low>240)continue;
    const weight=(a/255)*(.7+(high-low)/255*.6),key=(r>>5)*64+(g>>5)*8+(b>>5);
    const bucket=buckets.get(key)??{weight:0,r:0,g:0,b:0};
    bucket.weight+=weight;bucket.r+=r*weight;bucket.g+=g*weight;bucket.b+=b*weight;buckets.set(key,bucket);
  }
  let winner:{weight:number;r:number;g:number;b:number}|undefined;
  for(const bucket of buckets.values())if(!winner||bucket.weight>winner.weight)winner=bucket;
  return winner?'#'+[winner.r,winner.g,winner.b].map(value=>Math.round(value/winner!.weight).toString(16).padStart(2,'0')).join(''):null;
}
