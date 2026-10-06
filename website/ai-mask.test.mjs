import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateAIMask,maskedSource} from './ai-mask.mjs';
import {createMaskHistory} from './public/mask-history.mjs';

async function mask(width=80,height=60){const raw=Buffer.alloc(width*height);for(let y=20;y<Math.min(40,height);y++)for(let x=20;x<Math.min(45,width);x++)raw[y*width+x]=255;return {base64:(await sharp(raw,{raw:{width,height,channels:1}}).png().toBuffer()).toString('base64'),width,height};}
test('Masks preserve the selected pixels and canonicalize PNG encodings for idempotency',async()=>{
 const source=await mask(),validated=await validateAIMask(source);
 assert.equal(validated.convention,'white-edit-black-keep');const decoded=await sharp(Buffer.from(validated.base64,'base64')).greyscale().raw().toBuffer();
 assert.equal(decoded[25*80+25],255);assert.equal(decoded[0],0);
 const other=await sharp(Buffer.from(source.base64,'base64')).png({compressionLevel:1}).toBuffer();
 assert.equal((await validateAIMask({...source,base64:other.toString('base64')})).digest,validated.digest);
});
test('Unreadable, transparent, coloured, empty, mismatched and excessive masks are rejected',async()=>{
 const source=await mask();const empty=await sharp({create:{width:80,height:60,channels:3,background:'#000'}}).png().toBuffer();
 const colour=await sharp({create:{width:80,height:60,channels:3,background:'#00f'}}).png().toBuffer();
 const alpha=await sharp({create:{width:80,height:60,channels:4,background:{r:255,g:255,b:255,alpha:.5}}}).png().toBuffer();
 for(const value of [null,{...source,width:81},{...source,width:9000},{...source,unknown:true},{...source,base64:'aGVsbG8='},{...source,base64:source.base64.slice(0,30)},{...source,base64:empty.toString('base64')},{...source,base64:colour.toString('base64')},{...source,base64:alpha.toString('base64')},{...source,base64:'A'.repeat(2800001)}])await assert.rejects(validateAIMask(value),{status:400});
});
test('Source image orientation matches the mask, and mismatches fail before calling the image provider',async()=>{
 const source=await sharp({create:{width:80,height:60,channels:3,background:'#8a97a4'}}).jpeg().withMetadata({orientation:6}).toBuffer(),original=Buffer.from(source);
 const result=await maskedSource(source,await validateAIMask(await mask(60,80))),meta=await sharp(result).metadata();assert.equal(meta.width,60);assert.equal(meta.height,80);assert.deepEqual(source,original);
 await assert.rejects(maskedSource(source,await validateAIMask(await mask(80,60))));await assert.rejects(maskedSource(Buffer.from('not-image'),await mask()));
});
test('Mask history keeps strokes independent, cancels reset and discards redo after a new brush stroke',()=>{
 const history=createMaskHistory(),paint={mode:'paint',size:.06,points:[{x:.2,y:.3},{x:.6,y:.4}]};
 history.add(paint);paint.points[0].x=.9;assert.equal(history.strokes[0].points[0].x,.2);
 history.add({mode:'erase',size:.02,points:[{x:.3,y:.3}]});history.reset();assert.equal(history.strokes.length,0);history.undo();assert.equal(history.strokes.length,2);history.undo();assert.equal(history.strokes.length,1);history.redo();assert.equal(history.strokes.length,2);
 history.undo();history.add({mode:'paint',size:.03,points:[{x:.7,y:.7}]});assert.equal(history.canRedo,false);
 assert.throws(()=>history.add({mode:'paint',size:.03,points:[{x:2,y:.2}]}));
});

const directory=await mkdtemp(path.join(os.tmpdir(),'pt-masked-http-'));
for(const key of ['DATABASE_URL','SHARED_WORKSPACE_ID','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','MEDIA_STORAGE','NODE_ENV'])delete process.env[key];
process.env.DATA_DIR=directory;process.env.ADMIN_TOKEN='isolated-mask-key';process.env.AI_ENDPOINT='https://mask-fixture.example.test/edit';process.env.AI_SUPPORTS_MASK='1';
const nativeFetch=globalThis.fetch;let providerCalls=0,lastPayload,hold,release,failProvider=false;
globalThis.fetch=async(url,options)=>{
 if(url!==process.env.AI_ENDPOINT)return nativeFetch(url,options);
 providerCalls++;lastPayload=JSON.parse(options.body);assert.equal(lastPayload.mask_convention,'white-edit-black-keep');assert.equal(lastPayload.image_url,undefined);
 const source=await sharp(Buffer.from(lastPayload.image_base64,'base64')).metadata();assert.equal(source.width,lastPayload.mask_width);assert.equal(source.height,lastPayload.mask_height);
 if(hold)await new Promise(resolve=>release=resolve);
 if(failProvider)return new Response('Provider failed',{status:503});
 return new Response(JSON.stringify({image_url:'https://example.test/masked-result.png'}),{headers:{'Content-Type':'application/json'}});
};
const {server}=await import('./server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
async function request(endpoint,body,agent=true,cookie=''){const response=await nativeFetch(origin+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(agent?{Authorization:'Bearer '+process.env.ADMIN_TOKEN}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function until(predicate){for(let i=0;i<150;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('Timed out waiting for masked job');}
async function property(){const photo=await sharp({create:{width:80,height:60,channels:3,background:'#9aadc4'}}).png().toBuffer();const media=await request('/api/agent/upload',{type:'image/png',base64:photo.toString('base64')});const result=await request('/api/agent/publish',{title:'Isolated masked fixture',credits:4,rooms:[{id:'salon',name:'Salon',photos:[media.data.url]}]});return {...result.data,photo:media.data.url,bytes:photo};}
const payload=async(p,key)=>({slug:p.slug,room:'salon',photo:p.photo,action:'Supprimer un objet',mask:await mask(),async:true,idempotencyKey:key});
try{
 await test('HTTP mask jobs keep the original, survive navigation, charge once and hide the private mask',async()=>{
  const p=await property(),input=await payload(p,'masked-http-intent-001'),before=providerCalls;hold=true;
  const first=await request('/api/agent/generate',input);assert.equal(first.status,202);await until(()=>Boolean(release));
  const duplicate=await request('/api/agent/generate',input);assert.equal(duplicate.data.job.id,first.data.job.id);assert.equal(providerCalls,before+1);assert.equal(first.data.job.mask,undefined);assert.equal(first.data.job.input,undefined);
  const conflict=await request('/api/agent/generate',{...input,prompt:'Different intention'});assert.equal(conflict.status,409);
  const db=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));const job=db.jobs.find(j=>j.id===first.data.job.id);assert.equal(job.input.mask.digest,(await validateAIMask(input.mask)).digest);assert.equal(job.creditsReserved,1);
  const sourcePixels=await sharp(Buffer.from(lastPayload.mask_base64,'base64')).greyscale().raw().toBuffer();assert.equal(sourcePixels[25*80+25],255);assert.equal(sourcePixels[0],0);
  release();release=null;hold=false;let completed;await until(async()=>{completed=(await request('/api/agent/jobs?id='+first.data.job.id)).data.jobs[0];return completed.status==='completed';});
  assert.equal(completed.creditsCharged,1);assert.equal(completed.result.original,p.photo);assert.equal(completed.result.image,'https://example.test/masked-result.png');assert.equal(completed.credits,3);assert.equal(JSON.stringify(completed).includes('base64'),false);
  const newBuyer=await request('/api/open?slug='+p.slug,{},false);assert.equal(newBuyer.status,200);assert.ok(!newBuyer.cookie.includes('undefined'));assert.equal(newBuyer.data.aiAllowance.limit,2);assert.deepEqual(newBuyer.data.variants,[]);assert.equal((await request('/api/jobs?slug='+p.slug,undefined,false,'pt_session_'+p.slug+'=undefined')).status,401);
  assert.deepEqual(await readFile(path.join(directory,p.photo)),p.bytes);
  const finishedAgain=await request('/api/agent/generate',input);assert.equal(finishedAgain.data.job.id,first.data.job.id);assert.equal(providerCalls,before+1);
 });
 await test('Malformed masks and unsupported providers do not reserve credits; buyer masks and unknown photos are refused',async()=>{
  const p=await property(),input=await payload(p,'masked-invalid-intent-01'),before=providerCalls;
  assert.equal((await request('/api/agent/generate',input,false)).status,401);
  assert.equal((await request('/api/agent/generate',{...input,mask:{...input.mask,width:81}})).status,400);
  process.env.AI_SUPPORTS_MASK='0';assert.equal((await request('/api/agent/generate',input)).status,503);process.env.AI_SUPPORTS_MASK='1';
  assert.equal((await request('/api/agent/generate',{...input,photo:'/media/'+'X'.repeat(32)+'.png'})).status,400);
  assert.equal((await request('/api/agent/generate',{...input,photo:'https://example.test/external.jpg'})).status,400);
  const buyer=await request('/api/open?slug='+p.slug,{},false);assert.equal(buyer.status,200,JSON.stringify(buyer.data));assert.ok(buyer.cookie,JSON.stringify(buyer.data));const denied=await request('/api/generate?slug='+p.slug,input,false,buyer.cookie);assert.equal(denied.status,400,JSON.stringify(denied.data));
  assert.equal(providerCalls,before);const saved=(await request('/api/agent/properties')).data.find(x=>x.slug===p.slug);assert.equal(saved.credits,4);
 });
 await test('Dimension mismatch skips the paid provider, while provider errors refund their reservation once',async()=>{
  const p=await property(),before=providerCalls;
  let submitted=await request('/api/agent/generate',{...await payload(p,'masked-size-error-001'),mask:await mask(81,60)});assert.equal(submitted.status,202);
  let job;await until(async()=>{job=(await request('/api/agent/jobs?id='+submitted.data.job.id)).data.jobs[0];return job.status==='failed';});assert.equal(providerCalls,before);assert.equal(job.credits,4);assert.equal(job.creditsRefunded,1);
  failProvider=true;submitted=await request('/api/agent/generate',await payload(p,'masked-provider-fail-01'));assert.equal(submitted.status,202);
  await until(async()=>{job=(await request('/api/agent/jobs?id='+submitted.data.job.id)).data.jobs[0];return job.status==='failed';});assert.equal(providerCalls,before+1);assert.equal(job.credits,4);assert.equal(job.creditsCharged,0);assert.equal(job.creditsRefunded,1);
  const again=await request('/api/agent/generate',await payload(p,'masked-provider-fail-01'));assert.equal(again.data.job.id,submitted.data.job.id);assert.equal(providerCalls,before+1);failProvider=false;
 });
}finally{hold=false;release?.();await new Promise(resolve=>server.close(resolve));globalThis.fetch=nativeFetch;await rm(directory,{recursive:true,force:true});}
