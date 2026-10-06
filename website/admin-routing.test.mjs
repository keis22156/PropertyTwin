import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
const directory=await mkdtemp(path.join(os.tmpdir(),'pt-admin-routing-'));
for(const key of ['DATABASE_URL','SHARED_WORKSPACE_ID','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','MEDIA_STORAGE','NODE_ENV','AI_ENDPOINT','AI_TOKEN','OPENAI_API_KEY','GEMINI_API_KEY','BFL_API_KEY'])delete process.env[key];
process.env.DATA_DIR=directory;process.env.ADMIN_TOKEN='TEST_ONLY_AGENT_KEY';process.env.PLATFORM_ADMIN_TOKEN='TEST_ONLY_PLATFORM_KEY';process.env.OPENAI_API_KEY='TEST_ONLY_PRIVATE_OPENAI_KEY';
const nativeFetch=globalThis.fetch;let providerCalls=0;const fixtureImage=await sharp({create:{width:20,height:20,channels:3,background:'#adc4d2'}}).png().toBuffer();
globalThis.fetch=async(url,options)=>{if(url!==process.env.AI_ENDPOINT)return nativeFetch(url,options);providerCalls++;return new Response(JSON.stringify({image_base64:fixtureImage.toString('base64')}),{headers:{'Content-Type':'application/json'}});};
const {server}=await import('./server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
async function request({token='',method='GET',body}={}){const response=await fetch(origin+'/api/admin/ai-routing',{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
try{
 await test('Only platform credentials can configure global routing; secrets never appear in API or files',async()=>{
  assert.equal((await request()).status,401);assert.equal((await request({token:process.env.ADMIN_TOKEN})).status,401);
  const first=await request({token:process.env.PLATFORM_ADMIN_TOKEN});assert.equal(first.status,200);assert.equal(first.data.config.revision,0);assert.equal(first.data.profiles.find(p=>p.id==='openai-premium').configured,true);assert.ok(!JSON.stringify(first.data).includes(process.env.OPENAI_API_KEY));
  const config={...first.data.config,buyerEnabled:false};let saved=await request({token:process.env.PLATFORM_ADMIN_TOKEN,method:'PUT',body:{config,baseline:0}});assert.equal(saved.status,200);assert.equal(saved.data.config.revision,1);
  assert.equal((await request({token:process.env.PLATFORM_ADMIN_TOKEN,method:'PUT',body:{config,baseline:0}})).status,409);
  assert.equal((await request({token:process.env.PLATFORM_ADMIN_TOKEN,method:'PUT',body:{config:{...saved.data.config,apiKey:'bad'},baseline:1}})).status,400);
  assert.equal((await request({token:process.env.PLATFORM_ADMIN_TOKEN,method:'POST',body:{}})).status,405);assert.ok(!(await readFile(path.join(directory,'platform-ai.json'),'utf8')).includes(process.env.OPENAI_API_KEY));
  const capabilities=await fetch(origin+'/api/agent/ai-config',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}});assert.deepEqual(await capabilities.json(),{configured:false,maskEditing:false,hdRendering:false,prices:{preview:1,hd:2}});
  delete process.env.PLATFORM_ADMIN_TOKEN;assert.equal((await request({token:process.env.ADMIN_TOKEN})).status,200);process.env.NODE_ENV='production';assert.equal((await request({token:process.env.ADMIN_TOKEN})).status,401);delete process.env.NODE_ENV;
 });
 await test('Admin switches block agent/buyer submissions before credits; reactivation uses the same job and private sessions',async()=>{
  process.env.PLATFORM_ADMIN_TOKEN='TEST_ONLY_PLATFORM_KEY';process.env.AI_ENDPOINT='https://isolated-switch-fixture.example.test/edit';
  const api=async(route,body,{agent=false,cookie}={})=>{const response=await nativeFetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(agent?{Authorization:'Bearer '+process.env.ADMIN_TOKEN}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const p=(await api('/api/agent/publish',{title:'Isolated routing switches',credits:4,rooms:[{id:'salon',name:'Salon',photos:['https://example.test/source.png']}]},{agent:true})).data;
  async function switchTo(enabled,buyerEnabled){const current=await request({token:process.env.PLATFORM_ADMIN_TOKEN});const saved=await request({token:process.env.PLATFORM_ADMIN_TOKEN,method:'PUT',body:{config:{...current.data.config,enabled,buyerEnabled},baseline:current.data.config.revision}});assert.equal(saved.status,200);}
  const input={slug:p.slug,room:'salon',photo:'https://example.test/source.png',action:'Meubler',async:true,idempotencyKey:'agent-switch-intent-01'};
  await switchTo(false,false);assert.equal((await api('/api/agent/generate',input,{agent:true})).status,503);
  const buyer=await api('/api/open?slug='+p.slug,{});assert.equal(buyer.status,200);await switchTo(true,false);
  assert.equal((await api('/api/generate?slug='+p.slug,{...input,idempotencyKey:'buyer-switch-intent-01'},{cookie:buyer.cookie})).status,503);assert.equal(providerCalls,0);
  assert.equal((await api('/api/agent/jobs',null,{agent:true})).data.jobs.length,0);assert.equal((await api('/api/agent/properties',null,{agent:true})).data.find(x=>x.slug===p.slug).credits,4);
  async function wait(id,agent){for(let i=0;i<100;i++){const current=await api(agent?'/api/agent/jobs?id='+id:'/api/jobs?slug='+p.slug+'&id='+id,null,agent?{agent:true}:{cookie:buyer.cookie});const job=current.data.jobs[0];if(job.status==='completed')return job;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Fixture job did not complete');}
  const agentJob=await api('/api/agent/generate',input,{agent:true});assert.equal(agentJob.status,202);const completeAgent=await wait(agentJob.data.job.id,true);assert.equal(completeAgent.creditsCharged,1);
  await switchTo(true,true);const buyerInput={...input,idempotencyKey:'buyer-switch-intent-01'},buyerJob=await api('/api/generate?slug='+p.slug,buyerInput,{cookie:buyer.cookie});assert.equal(buyerJob.status,202);const completeBuyer=await wait(buyerJob.data.job.id,false);assert.equal(completeBuyer.creditsCharged,1);assert.equal(providerCalls,2);
  await switchTo(false,false);const replay=await api('/api/generate?slug='+p.slug,buyerInput,{cookie:buyer.cookie});assert.equal(replay.data.job.id,buyerJob.data.job.id);assert.equal(providerCalls,2);assert.equal((await api('/api/agent/properties',null,{agent:true})).data.find(x=>x.slug===p.slug).credits,2);
  const disk=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));assert.equal(disk.jobs.length,2);assert.equal(disk.jobs.find(j=>j.id===buyerJob.data.job.id).input.routing.operation,'buyerPreview');assert.ok(!JSON.stringify(disk).includes(process.env.OPENAI_API_KEY));
 });
}finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
