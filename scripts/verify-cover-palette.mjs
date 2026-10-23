import assert from 'node:assert/strict';
import {register} from 'tsx/esm/api';
const unregister=register();
try{
  const {dominantCoverColor}=await import('../app/lib/cover-palette.ts');
  const pixels=(...groups)=>new Uint8ClampedArray(groups.flatMap(([color,count])=>Array.from({length:count},()=>color).flat()));
  assert.equal(dominantCoverColor(pixels([[255,255,255,255],100],[[0,0,0,255],100],[[250,0,0,0],100],[[20,100,210,255],30])),'#1464d2');
  assert.equal(dominantCoverColor(pixels([[90,90,90,255],100])),'#5a5a5a');
  assert.equal(dominantCoverColor(new Uint8ClampedArray()),null);
  assert.equal(dominantCoverColor(pixels([[255,255,255,255],100])),null);
  assert.equal(dominantCoverColor(pixels([[30,150,80,255],100],[[240,50,60,255],1])),'#1e9650');
  console.log('PASS population palette ignores transparent/blank borders, handles monochrome images and resists isolated bright pixels');
}finally{unregister();}
