import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createStores} from './data-store.mjs';
import {createAIJobs,buyerAllowance} from './ai-jobs.mjs';
import {imageEditingProvider} from './image-provider.mjs';
import {providerCatalog} from './image-providers.mjs';
import {publicVariant,updateVariant} from './variant-data.mjs';

const photo='/media/'+'a'.repeat(32)+'.png';
const original=await sharp({create:{width:32,height:24,channels:3,background:'#aabbcc'}}).png().toBuffer();
const generated=await sharp({create:{width:20,height:20,channels:3,background:'#337755'}}).png().toBuffer();
const image='data:image/png;base64,'+generated.toString('base64');
const parent=(id,extra={})=>({id,slug:'fixture',room:'salon',original:photo,image,label:'Japandi',agent:true,sessionId:'agent',revision:1,...extra});
const input=(id,extra={})=>({room:'salon',photo,action:'Changer le sol',parentVariantId:id,async:true,idempotencyKey:'variant-intention-0001',...extra});

test('Chains use the owned parent bytes, retain the original and lineage, and replay once even after parent deletion',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-variant-chain-')),stores=await createStores(directory),base=stores.local;
 const calls=[],reads=[],env={AI_ENDPOINT:'https://fixture.test',AI_SUPPORTS_MASK:'1'};
 const provider=imageEditingProvider(env,{readMedia:async url=>{reads.push(url);return original;},catalog:providerCatalog(env,{fetcher:async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({image_base64:generated.toString('base64')}));}})});
 const p={slug:'fixture',credits:20,rooms:[{id:'salon',photos:[photo]}]},s={id:'agent',slug:p.slug,agent:true,events:[]};
 Object.assign(base.db,{properties:[p],sessions:[s],variants:[parent('parent')]});const jobs=createAIJobs({stores,provider});
 try{
  for(const invalid of [input('unknown'),input('parent',{room:'wrong'}),input('parent',{parentVariantId:42})])await assert.rejects(stores.run(base,null,()=>jobs.submit(p,s,invalid)));
  assert.equal(p.credits,20);assert.equal(calls.length,0);
  const request=input('parent',{sourceImage:'https://attacker.test/override.png'});
  const job=await stores.run(base,null,()=>jobs.submit(p,s,request));await jobs.wait(job);
  assert.equal(job.status,'completed');assert.equal(calls.length,1);assert.equal(calls[0].image_base64,generated.toString('base64'));assert.deepEqual(reads,[]);
  const result=await stores.run(base,null,()=>jobs.expose(job));assert.equal(result.result.original,photo);assert.equal(result.result.parentVariantId,'parent');assert.equal(result.result.revision,1);assert.equal(result.result.sourceImage,undefined);assert.equal(result.input,undefined);assert.equal(p.credits,19);
  updateVariant(base.db.variants[0],{revision:1,patch:{deleted:true}});
  assert.equal((await stores.run(base,null,()=>jobs.submit(p,s,request))).id,job.id);assert.equal(calls.length,1);
  await assert.rejects(stores.run(base,null,()=>jobs.submit(p,s,{...request,idempotencyKey:'variant-intention-0002'})),{status:410});assert.equal(p.credits,19);
  const restored=await createStores(directory);assert.equal(restored.local.db.variants[1].parentVariantId,'parent');assert.equal(restored.local.db.jobs[0].input.sourceImage,image);
 }finally{jobs.close();await base.pending;await rm(directory,{recursive:true,force:true});}
});

test('Masks are applied to the generated parent, with its dimensions; foreign sessions and deleted queued sources reserve no net credits',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-variant-mask-')),stores=await createStores(directory),base=stores.local,calls=[];
 const p={slug:'fixture',credits:20,rooms:[{id:'salon',photos:[photo]}]},agent={id:'agent',agent:true,slug:p.slug,events:[]},buyer={id:'buyer',slug:p.slug,events:[]};
 Object.assign(base.db,{properties:[p],sessions:[agent,buyer],variants:[parent('parent'),parent('buyer-owned',{agent:false,sessionId:'buyer'}),parent('buyer-foreign',{agent:false,sessionId:'other'})]});
 const env={AI_ENDPOINT:'https://fixture.test',AI_SUPPORTS_MASK:'1'};
 const provider=imageEditingProvider(env,{readMedia:async()=>original,catalog:providerCatalog(env,{fetcher:async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({image_base64:generated.toString('base64')}));}})});
 let jobs=createAIJobs({stores,provider});
 try{
  for(const [s,id] of [[buyer,'parent'],[buyer,'buyer-foreign'],[agent,'buyer-owned']])await assert.rejects(stores.run(base,null,()=>jobs.submit(p,s,input(id))),{status:404});assert.equal(calls.length,0);assert.equal(p.credits,20);
  const mask=await sharp({create:{width:20,height:20,channels:3,background:'#fff'}}).png().toBuffer();
  const job=await stores.run(base,null,()=>jobs.submit(p,agent,input('parent',{action:'Supprimer un objet',mask:{base64:mask.toString('base64'),width:20,height:20}})));await jobs.wait(job);
  assert.equal(job.status,'completed');assert.equal(calls.length,1);assert.equal((await sharp(Buffer.from(calls[0].image_base64,'base64')).metadata()).width,20);assert.equal(calls[0].mask_width,20);
  jobs.close();jobs=createAIJobs({stores,provider,concurrency:0});agent.lastGeneration=0;
  const queued=await stores.run(base,null,()=>jobs.submit(p,agent,input('parent',{idempotencyKey:'queued-variant-intent-01'})));assert.equal(p.credits,18);
  await stores.run(base,null,async()=>{updateVariant(base.db.variants[0],{revision:1,patch:{deleted:true}});await stores.save();});jobs.close();jobs=createAIJobs({stores,provider});await jobs.recover();await jobs.wait(queued);
  assert.equal(queued.status,'failed');assert.equal(queued.creditsRefunded,1);assert.equal(p.credits,19);assert.equal(calls.length,1);
  updateVariant(base.db.variants[1],{revision:1,patch:{deleted:true}});assert.equal(buyerAllowance(base.db,p,buyer).used,1,'Deleting a version never restores a buyer generation allowance.');
 }finally{jobs.close();await base.pending;await rm(directory,{recursive:true,force:true});}
});

test('Variant metadata validates before mutating, detects conflicts, and tombstones hide image and share credentials',()=>{
 const v=parent('version',{shareToken:'private-share'});
 for(const request of [{revision:1,patch:{label:' '}},{revision:1,patch:{label:'Valid',favorite:'yes'}},{revision:1,patch:{image:'evil'}},{revision:1,patch:{deleted:'yes'}},{revision:0,patch:{favorite:true}}])assert.throws(()=>updateVariant(v,request),{status:400});
 assert.equal(v.label,'Japandi');assert.equal(v.revision,1);
 const renamed=updateVariant(v,{revision:1,patch:{label:'  Japandi et parquet  ',favorite:true}});assert.equal(renamed.label,'Japandi et parquet');assert.equal(renamed.favorite,true);assert.equal(renamed.sessionId,undefined);assert.equal(renamed.shareToken,undefined);
 assert.throws(()=>updateVariant(v,{revision:1,patch:{label:'Stale'}}),{status:409});assert.equal(v.label,'Japandi et parquet');
 const deleted=updateVariant(v,{revision:2,patch:{deleted:true}});assert.equal(deleted.image,undefined);assert.equal(deleted.label,'Version supprimée');assert.equal(v.shareToken,undefined);assert.equal(v.image,image);
 assert.throws(()=>updateVariant(v,{revision:3,patch:{favorite:false}}),{status:410});
 const restored=updateVariant(v,{revision:3,patch:{deleted:false}});assert.equal(restored.image,image);assert.equal(restored.label,'Japandi et parquet');assert.equal(restored.revision,4);assert.equal(v.shareToken,undefined);assert.equal(publicVariant(v).favorite,true);
});

test('Real HTTP routes enforce agent/buyer ownership, persist revisions and revoke deleted shares without deleting descendants',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-variant-http-'));
 const agentId='a'.repeat(32),buyerId='b'.repeat(32),childId='c'.repeat(32),buyerToken='s'.repeat(32),otherToken='t'.repeat(32),shareToken='u'.repeat(32);
 await writeFile(path.join(directory,'store.json'),JSON.stringify({leads:[],links:[],properties:[{slug:'fixture',title:'Technical fixture',status:'Unlisted',credits:14,agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:[photo]}]}],sessions:[{id:'buyer',slug:'fixture',token:buyerToken,events:[],visits:0},{id:'other',slug:'fixture',token:otherToken,events:[],visits:0}],variants:[parent(agentId),parent(childId,{parentVariantId:agentId}),parent(buyerId,{agent:false,sessionId:'buyer',shareToken})]}));
 process.env.DATA_DIR=directory;process.env.ADMIN_TOKEN='fixture-agent';delete process.env.DATABASE_URL;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;
 const {server}=await import('./server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 async function request(route,body,{agent=false,cookie=''}={}){const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(agent?{Authorization:'Bearer fixture-agent'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
 try{
  const change={id:agentId,slug:'fixture',revision:1,patch:{label:'Japandi initial',favorite:true}};
  assert.equal((await request('/api/agent/variant',change)).status,401);assert.equal((await request('/api/agent/variant',{...change,id:buyerId},{agent:true})).status,404);
  assert.equal((await request('/api/agent/variant',change,{agent:true})).status,200);assert.equal((await request('/api/agent/variant',change,{agent:true})).status,409);
  const buyerChange={id:buyerId,revision:1,patch:{deleted:true}};
  assert.equal((await request('/api/variant?slug=fixture',buyerChange,{cookie:'pt_session_fixture='+otherToken})).status,404);
  assert.equal((await request('/api/variant?slug=fixture',buyerChange,{cookie:'pt_session_fixture='+buyerToken})).status,200);
  assert.equal((await request('/api/shared?token='+shareToken)).status,404);assert.equal((await request('/api/share?slug=fixture',{id:buyerId},{cookie:'pt_session_fixture='+buyerToken})).status,404);
  assert.equal((await request('/api/agent/variant',{id:agentId,slug:'fixture',revision:2,patch:{deleted:true}},{agent:true})).status,200);
  const list=await request('/api/agent/variants',null,{agent:true});assert.equal(list.data.find(v=>v.id===agentId).image,undefined);assert.equal(list.data.find(v=>v.id===childId).image,image);assert.equal(list.data.find(v=>v.id===childId).parentVariantId,agentId);
  const opened=await request('/api/open?slug=fixture',{}, {cookie:'pt_session_fixture='+buyerToken});assert.equal(opened.data.aiAllowance.used,1);assert.equal(opened.data.variants[0].image,undefined);assert.equal(opened.data.property.credits,undefined);
  const disk=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));assert.equal(disk.properties[0].credits,14);assert.equal(disk.variants[0].revision,3);assert.equal(disk.variants[1].parentVariantId,agentId);assert.equal(disk.variants[2].shareToken,undefined);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
