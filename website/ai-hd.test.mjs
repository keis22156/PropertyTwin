import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createStores} from './data-store.mjs';
import {createAIJobs} from './ai-jobs.mjs';
import {imageEditingProvider} from './image-provider.mjs';
import {providerCatalog} from './image-providers.mjs';
import {defaultRouting} from './ai-routing.mjs';
import {hdDimensions,verifyHD} from './ai-hd.mjs';
import {updateVariant} from './variant-data.mjs';

const source=await sharp({create:{width:64,height:48,channels:3,background:'#b4c5d6'}}).png().toBuffer();
const hdBytes=await sharp({create:{width:2048,height:1536,channels:3,background:'#d3c4b5'}}).png().toBuffer();
const image=bytes=>'data:image/png;base64,'+bytes.toString('base64');
const photo='/media/'+'h'.repeat(32)+'.png';
const request=(extra={})=>({room:'salon',photo,parentVariantId:'parent',action:'Rendu HD',quality:'hd',async:true,idempotencyKey:'hd-render-intention-0001',...extra});
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
async function fixture({enabled=true,concurrency=2,clock=()=>Date.now()}={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-hd-')),stores=await createStores(directory),base=stores.local;
 const p={slug:'fixture',credits:8,rooms:[{id:'salon',photos:[photo]}]},s={id:'agent',agent:true,slug:p.slug,events:[]};
 const parent={id:'parent',slug:p.slug,room:'salon',original:photo,image:image(source),agent:true,sessionId:s.id,label:'Cuisine rénovée',visualizationNonContractual:true,revision:1};
 Object.assign(base.db,{properties:[p],sessions:[s],variants:[parent]});
 const env={AI_ENDPOINT:'https://hd-fixture.test',AI_SUPPORTS_HD:enabled?'1':'0',...(enabled?{GEMINI_API_KEY:'TEST_ONLY_HD_FALLBACK'}:{})},calls=[];let result=hdBytes,rejectPrimary=false;
 const config=defaultRouting();config.routes.finalHD={primary:'http',fallback:'gemini-preview'};
 const provider=imageEditingProvider(env,{routing:{read:async()=>({config})},catalog:providerCatalog(env,{fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));if(url===env.AI_ENDPOINT&&rejectPrimary)return new Response('Fixture quota',{status:429});if(url.includes('googleapis'))return json({status:'completed',steps:[{type:'model_output',content:[{type:'image',data:hdBytes.toString('base64')}]}]});return json(typeof result==='string'?{image_url:result}:{image_base64:result.toString('base64')});}})});
 let jobs=createAIJobs({stores,provider,concurrency,clock});
 return {p,s,parent,stores,base,calls,provider,get jobs(){return jobs;},setResult:value=>result=value,rejectPrimary:()=>rejectPrimary=true,run:body=>stores.run(base,null,()=>jobs.submit(p,s,body)),restart:async()=>{jobs.close();jobs=createAIJobs({stores,provider,clock});await jobs.recover();},close:async()=>{jobs.close();await base.pending;await rm(directory,{recursive:true,force:true});}};
}

test('A known HD quota rejection uses its configured fallback with a single two-credit charge',async()=>{
 const f=await fixture();try{f.rejectPrimary();const job=await f.run(request());await f.jobs.wait(job);assert.equal(job.status,'completed');assert.equal(job.creditsCharged,2);assert.equal(job.creditsReserved,2);assert.equal(f.p.credits,6);assert.equal(f.calls.length,2);assert.equal(job.provider,'gemini');assert.equal(job.attempts[0].status,'failed');assert.equal(job.attempts[1].status,'completed');assert.equal(f.calls[1].response_format.image_size,'2K');}finally{await f.close();}
});

test('HD preserves the owned variant and warning, reserves the supplement once, persists quality/dimensions and survives replay',async()=>{
 const f=await fixture();try{
  const [job,replay]=await Promise.all([f.run(request()),f.run(request())]);assert.equal(job.id,replay.id);await f.jobs.wait(job);
  assert.equal(job.status,'completed');assert.equal(job.creditsReserved,2);assert.equal(job.creditsCharged,2);assert.equal(f.p.credits,6);assert.equal(f.calls.length,1);
  const sent=f.calls[0];assert.equal(sent.image_base64,source.toString('base64'));assert.equal(sent.quality,'hd');assert.equal(sent.action,'Rendu HD');assert.deepEqual([sent.output_width,sent.output_height],[2048,1536]);assert.match(sent.instruction,/Ne refaire aucune transformation/);assert.equal(sent.mask_base64,undefined);
  const exposed=f.jobs.expose(job);assert.equal(exposed.quality,'hd');assert.equal(exposed.result.quality,'hd');assert.deepEqual(exposed.result.dimensions,{width:2048,height:1536});assert.equal(exposed.result.parentVariantId,'parent');assert.equal(exposed.result.original,photo);assert.equal(exposed.result.visualizationNonContractual,true);assert.equal(exposed.result.label,'Cuisine rénovée · HD');assert.equal(exposed.input,undefined);assert.equal(job.actualProviderCost,null);
  updateVariant(f.parent,{revision:1,patch:{deleted:true}});assert.equal((await f.run(request())).id,job.id);assert.equal(f.calls.length,1);assert.equal(f.p.credits,6);
  const disk=await createStores(f.base.dir);assert.equal(disk.local.db.variants[1].quality,'hd');assert.deepEqual(disk.local.db.variants[1].dimensions,exposed.result.dimensions);assert.equal(disk.local.db.jobs[0].creditsCharged,2);
  await assert.rejects(f.run(request({quality:'preview',action:'Ranger'})),{status:409});
 }finally{await f.close();}
});

test('Unavailable HD, buyer requests, foreign parents, extra transformations and insufficient budgets never submit a paid call',async()=>{
 const f=await fixture({enabled:false});try{
  await assert.rejects(f.run(request()),{status:503});assert.equal((await f.provider.capabilities()).hdRendering,false);
  for(const extra of [{quality:null},{quality:'4k'},{parentVariantId:undefined},{action:'Meubler'},{prompt:'Change aussi les murs'},{options:{}},{mask:{}},{inspiration:photo},{style:'Japandi'}])await assert.rejects(f.run(request(extra)),{status:400});
  f.s.agent=false;await assert.rejects(f.run(request()),{status:400});f.s.agent=true;
  await assert.rejects(f.run(request({parentVariantId:'foreign'})),{status:404});f.parent.image='https://remote.test/variant.png';await assert.rejects(f.run(request()),{status:503});
  assert.equal(f.calls.length,0);assert.equal(f.p.credits,8);assert.equal(f.base.db.jobs.length,0);
 }finally{await f.close();}
 const allowed=await fixture();try{allowed.p.credits=1;await assert.rejects(allowed.run(request()),{status:429});assert.equal(allowed.p.credits,1);assert.equal(allowed.calls.length,0);allowed.p.credits=8;allowed.parent.quality='hd';await assert.rejects(allowed.run(request()),{status:400});}finally{await allowed.close();}
});

test('HD rejects low-resolution, remote and corrupted output, refunds the entire supplement exactly once and never falls back after an accepted result',async()=>{
 const f=await fixture();try{
  for(const [index,value] of [source,'https://remote.test/output.png',hdBytes.subarray(0,100)].entries()){
   f.setResult(value);const body=request({idempotencyKey:'hd-failed-intention-000'+index}),job=await f.run(body);await f.jobs.wait(job);
   assert.equal(job.status,'failed');assert.equal(job.creditsCharged,0);assert.equal(job.creditsRefunded,2);assert.equal(f.p.credits,8);assert.equal(f.jobs.expose(job).result,undefined);
   assert.equal((await f.run(body)).id,job.id);assert.equal(f.calls.length,index+1);await f.jobs.recover();assert.equal(f.p.credits,8);
  }
  assert.equal(f.base.db.variants.length,1);
 }finally{await f.close();}
});

test('A queued HD job survives restart and a removed source refunds two credits; reservations cannot overspend the last budget',async()=>{
 const f=await fixture({concurrency:0});try{
  f.p.credits=2;const job=await f.run(request());assert.equal(job.status,'queued');assert.equal(f.p.credits,0);
  await assert.rejects(f.run(request({idempotencyKey:'hd-another-intention-01'})),{status:429});assert.equal(f.base.db.jobs.length,1);
  await f.stores.run(f.base,null,async()=>{updateVariant(f.parent,{revision:1,patch:{deleted:true}});await f.stores.save();});
  await f.restart();await f.jobs.wait(job);assert.equal(job.status,'failed');assert.equal(job.creditsRefunded,2);assert.equal(f.p.credits,2);assert.equal(f.calls.length,0);
 }finally{await f.close();}
 const resumed=await fixture({concurrency:0});try{const job=await resumed.run(request());await resumed.restart();await resumed.jobs.wait(job);assert.equal(job.status,'completed');assert.equal(resumed.calls.length,1);assert.equal(resumed.p.credits,6);}finally{await resumed.close();}
});

test('HD models are capability-gated and adapters send explicit resolution while keeping preview inexpensive',async()=>{
 const calls=[],config=defaultRouting();const env={OPENAI_API_KEY:'TEST_ONLY_HD_OPENAI',GEMINI_API_KEY:'TEST_ONLY_HD_GEMINI',BFL_API_KEY:'TEST_ONLY_HD_FLUX'};
 const catalog=providerCatalog(env,{sleep:async()=>{},fetcher:async(url,options)=>{
  if(options.method==='POST')calls.push({url,body:JSON.parse(options.body)});
  if(url.includes('openai'))return json({data:[{b64_json:hdBytes.toString('base64')}]});
  if(url.includes('googleapis'))return json({status:'completed',steps:[{type:'model_output',content:[{type:'image',data:hdBytes.toString('base64')}]}]});
  if(options.method==='POST')return json({id:'hd-flux-fixture',polling_url:'https://api.bfl.ai/v1/get_result?id=fixture'});
  if(url.includes('get_result'))return json({status:'Ready',result:{sample:'https://delivery.bfl.ai/hd.png'}});
  return new Response(hdBytes);
 }});
 const router=imageEditingProvider(env,{catalog,routing:{read:async()=>({config})}});
 for(const id of ['openai-premium','gemini-preview','flux-edit']){
  config.routes.finalHD={primary:id,fallback:null};const output=await router.edit({...request(),sourceImage:image(source)},{jobId:'hd-adapter-fixture'});assert.deepEqual(await verifyHD(output.image),{width:2048,height:1536});
 }
 assert.equal(calls[0].body.quality,'high');assert.equal(calls[0].body.size,'2048x1536');assert.deepEqual(calls[1].body.response_format,{type:'image',mime_type:'image/png',image_size:'2K',aspect_ratio:'4:3'});assert.equal(calls[2].body.width,2048);assert.equal(calls[2].body.height,1536);
 for(const [type,model] of [['openai','gpt-image-1.5'],['gemini','gemini-2.5-flash-image'],['gemini','gemini-3.1-flash-lite-image'],['flux','flux-kontext-pro'],['flux','flux-pro-1.0-fill']])assert.equal(catalog.accepts({type,model,enabled:true},{quality:'hd'}),false);
 config.routes.finalHD={primary:'flux-erase',fallback:'openai-premium'};assert.equal((await router.capabilities()).hdRendering,true);config.profiles.find(p=>p.id==='openai-premium').enabled=false;assert.equal((await router.capabilities()).hdRendering,false);await assert.rejects(router.prepare(request()),{status:503});
 const square=await hdDimensions(await sharp({create:{width:50,height:50,channels:3,background:'#fff'}}).png().toBuffer());assert.equal(square.width,1920);assert.equal(square.height,1920);
 const panorama=await sharp({create:{width:100,height:10,channels:3,background:'#fff'}}).png().toBuffer();await assert.rejects(hdDimensions(panorama));
 const boundary=await hdDimensions(await sharp({create:{width:30,height:10,channels:3,background:'#fff'}}).png().toBuffer());assert.ok(boundary.width/boundary.height<=3);assert.equal(boundary.height%16,0);
 const oriented=await sharp(source).jpeg().withMetadata({orientation:6}).toBuffer();assert.deepEqual(await hdDimensions(oriented),{width:1536,height:2048});
 const orientedResult=await sharp(hdBytes).jpeg().withMetadata({orientation:6}).toBuffer();assert.deepEqual(await verifyHD('data:image/jpeg;base64,'+orientedResult.toString('base64')),{width:1536,height:2048});
});
