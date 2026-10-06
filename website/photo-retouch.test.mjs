import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {defaults,validateSettings,renderPixels,autoEnhance} from './public/retouch-engine.mjs';
import {renderRetouch} from './photo-retouch.mjs';
import {renderRetouchInWorker} from './photo-retouch-worker.mjs';
const pixels=(width,height,values)=>({width,height,data:Uint8ClampedArray.from(values.flatMap(v=>[v,v,v,255]))});

await test('Retouch geometry rotates the real pixels, crops the selected region and straightens without empty margins',()=>{
 const image=pixels(3,2,[10,20,30,40,50,60]),original=image.data.slice();
 assert.deepEqual(renderPixels(image,defaults).data,original);
 const rotated=renderPixels(image,{rotation:90});assert.equal(rotated.width,2);assert.equal(rotated.height,3);assert.deepEqual([...rotated.data].filter((_,i)=>i%4===0),[40,10,50,20,60,30]);
 const reverse=renderPixels(image,{rotation:270});assert.deepEqual([...reverse.data].filter((_,i)=>i%4===0),[30,60,20,50,10,40]);
 const grid=pixels(4,4,Array.from({length:16},(_,i)=>i*10)),cropped=renderPixels(grid,{cropRect:{x:.25,y:.25,width:.5,height:.5}});assert.deepEqual([...cropped.data].filter((_,i)=>i%4===0),[50,60,90,100]);
 for(const angle of [-15,15])assert.ok([...renderPixels(grid,{straighten:angle}).data].filter((_,i)=>i%4===3).every(value=>value===255));
 assert.deepEqual(image.data,original);
 for(const bad of [{exposure:3},{contrast:51},{sharpness:-1},{rotation:45},{straighten:16},{crop:'9:16'},{cropRect:{x:.9,y:0,width:.5,height:1}},{temperature:null}])assert.throws(()=>validateSettings(bad),{status:400});
});

await test('Free adjustments and conservative enhancement correct sampled light/colour without changing source pixels',()=>{
 const neutral=pixels(20,20,Array(400).fill(80)),before=neutral.data.slice(),auto=autoEnhance(neutral);assert.ok(auto.exposure>0&&auto.exposure<=.6);assert.equal(auto.temperature,0);assert.equal(auto.tint,0);
 assert.ok(renderPixels(neutral,auto).data[0]>neutral.data[0]);assert.deepEqual(neutral.data,before);
 const colour={width:1,height:1,data:Uint8ClampedArray.from([100,80,60,255])},gray=renderPixels(colour,{saturation:0});assert.equal(gray.data[0],gray.data[1]);assert.equal(gray.data[1],gray.data[2]);
 assert.ok(renderPixels(colour,{temperature:30}).data[0]>colour.data[0]);assert.ok(renderPixels(colour,{temperature:30}).data[2]<colour.data[2]);
 const edges=pixels(2,1,[0,255]);assert.deepEqual(renderPixels(edges,{shadows:100,highlights:-100}).data,edges.data);
 const tinted={width:20,height:20,data:Uint8ClampedArray.from(Array(400).fill([100,100,120,255]).flat())},balance=autoEnhance(tinted);assert.ok(balance.temperature>0);assert.ok(balance.temperature<=15);
});

await test('Server exports use the shared preview engine after EXIF orientation and preserve the encoded source',async()=>{
 const source=await sharp({create:{width:120,height:80,channels:3,background:'#57656d'}}).jpeg().withMetadata({orientation:6}).toBuffer(),original=source.slice();
 const result=await renderRetouch(source,{exposure:.4,contrast:12,shadows:20,highlights:-15,temperature:8,tint:-3,sharpness:10,crop:'1:1',cropRect:{x:.1,y:.1,width:.8,height:.8}});
 const meta=await sharp(result.data).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,64);assert.equal(meta.height,64);assert.deepEqual(source,original);
 const {data:raw,info}=await sharp(source).autoOrient().ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const expected=renderPixels({data:raw,width:info.width,height:info.height},result.settings),decoded=await sharp(result.data).ensureAlpha().raw().toBuffer();
 assert.equal(expected.width,meta.width);assert.equal(expected.height,meta.height);assert.ok(Math.abs(decoded[0]-expected.data[0])<6);assert.ok(Math.abs(decoded[1]-expected.data[1])<6);assert.ok(Math.abs(decoded[2]-expected.data[2])<6);
});

await test('Full-size retouches leave the HTTP event loop available and return identical worker output',async()=>{
 const source=await sharp({create:{width:1800,height:1200,channels:3,background:'#687482'}}).png().toBuffer(),original=source.slice(),settings={exposure:.2,shadows:15,sharpness:20,straighten:3};
 let ticks=0;const interval=setInterval(()=>ticks++,5);
 try{const result=await renderRetouchInWorker(source,settings);assert.ok(ticks>5);assert.deepEqual(result.data,(await renderRetouch(source,settings)).data);assert.deepEqual(source,original);}
 finally{clearInterval(interval);}
 await assert.rejects(renderRetouchInWorker(Buffer.from('invalid image'),{}),{status:400});
 const grayscale=await sharp(Buffer.alloc(200,90),{raw:{width:20,height:10,channels:1}}).toColourspace('b-w').png().toBuffer();
 const monochrome=await renderRetouchInWorker(grayscale,{exposure:.2});assert.equal(monochrome.width,20);assert.equal(monochrome.height,10);assert.equal((await sharp(monochrome.data).metadata()).format,'webp');
});
