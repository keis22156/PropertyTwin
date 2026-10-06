import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStores} from './data-store.mjs';
import {createAIJobs,buyerAllowance} from './ai-jobs.mjs';

const fixture=()=>({properties:[{slug:'property',title:'Technical fixture',credits:20,rooms:[{id:'salon',photos:['https://example.test/photo.jpg']}]}],sessions:[{id:'buyer',slug:'property',events:[]}]});
const input=key=>({room:'salon',photo:'https://example.test/photo.jpg',action:'Meubler',prompt:'Salon clair',async:true,idempotencyKey:key});
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('The job did not reach the expected state.');}

await test('Persistent reservations, simultaneous idempotency and refund retain the agency context',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-jobs-'));
 const stores=await createStores(directory),a=stores.local,b=await stores.load('11111111-1111-4111-8111-111111111111');
 Object.assign(a.db,fixture());Object.assign(b.db,fixture());
 const calls=[];let finish,breakProvider=false;
 const provider={name:'technical-fixture',configured:true,async edit(request,context){calls.push({request,context});await new Promise(resolve=>finish=resolve);if(breakProvider)throw Error('Private provider message');return {image:'https://example.test/result.jpg',provider:'technical-fixture',model:'fixture-model',actualProviderCost:null};}};
 const jobs=createAIJobs({stores,provider,concurrency:1});
 try{
  await stores.run(a,{user:{id:'agent-a'}},async()=>{
   const [first,duplicate]=await Promise.all([jobs.submit(a.db.properties[0],a.db.sessions[0],input('same-intent-key-0001')),jobs.submit(a.db.properties[0],a.db.sessions[0],input('same-intent-key-0001'))]);
   assert.equal(first.id,duplicate.id);assert.equal(a.db.jobs.length,1);assert.equal(a.db.properties[0].credits,19);
   const disk=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));assert.equal(disk.properties[0].credits,19);assert.equal(disk.jobs.length,1);
   await assert.rejects(jobs.submit(a.db.properties[0],a.db.sessions[0],{...input('same-intent-key-0001'),prompt:'Other intent'}),{status:409});
   await assert.rejects(jobs.submit(a.db.properties[0],a.db.sessions[0],input('second-intent-key-01')),{status:429});
  });
  await until(()=>calls.length===1);assert.equal(a.db.jobs[0].status,'processing');assert.equal(calls[0].context.directory,directory);
  assert.equal(JSON.parse(await readFile(path.join(directory,'store.json'),'utf8')).jobs[0].status,'processing');
  finish();await until(()=>a.db.jobs[0].status==='completed'&&!a.db.sessions[0].generating);
  await stores.run(a,null,async()=>{
   const replay=await jobs.submit(a.db.properties[0],a.db.sessions[0],input('same-intent-key-0001'));assert.equal(replay.id,a.db.jobs[0].id);
   assert.equal(jobs.expose(replay).result.original,'https://example.test/photo.jpg');assert.equal(jobs.expose(replay).creditsCharged,1);
   assert.equal(jobs.expose(replay).idempotencyKey,undefined);assert.equal(jobs.expose(replay).userId,undefined);assert.equal(jobs.expose(replay).result.sessionId,undefined);
  });
  assert.equal(calls.length,1);assert.equal(a.db.properties[0].credits,19);
  breakProvider=true;
  await stores.run(b,null,()=>jobs.submit(b.db.properties[0],b.db.sessions[0],input('same-intent-key-0001')));
  await until(()=>calls.length===2);assert.equal(calls[1].context.directory,b.dir);assert.equal(b.db.properties[0].credits,19);
  finish();await until(()=>b.db.jobs[0].status==='failed'&&!b.db.sessions[0].generating);
  assert.equal(b.db.properties[0].credits,20);assert.equal(a.db.properties[0].credits,19);assert.equal(b.db.variants.length,0);
  await stores.run(b,null,()=>jobs.submit(b.db.properties[0],b.db.sessions[0],input('same-intent-key-0001')));
  assert.equal(calls.length,2);assert.equal(b.db.jobs[0].creditsRefunded,1);assert.ok(!b.db.jobs[0].error.includes('Private'));
 }finally{jobs.close();await a.pending;await b.pending;await rm(directory,{recursive:true,force:true});}
});

await test('Queued jobs resume from disk; interrupted processing refunds once and never resubmits',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-job-recovery-'));let calls=0;
 const provider={name:'technical-fixture',configured:true,async edit(){calls++;return {image:'https://example.test/result.jpg'};}};
 let stores=await createStores(directory),jobs=createAIJobs({stores,provider,concurrency:0});
 try{
  Object.assign(stores.local.db,fixture());
  await jobs.submit(stores.state.properties[0],stores.state.sessions[0],input('queued-intent-key-01'));jobs.close();
  stores=await createStores(directory);jobs=createAIJobs({stores,provider});await jobs.recover();
  await until(()=>stores.state.jobs[0].status==='completed');await stores.local.pending;assert.equal(calls,1);assert.equal(stores.state.properties[0].credits,19);jobs.close();
  const db=stores.state;db.sessions.push({id:'interrupted',slug:'property',events:[],generating:true});db.properties[0].credits--;
  db.jobs.push({...db.jobs[0],id:'interrupted-job',sessionId:'interrupted',principal:'interrupted',idempotencyKey:'interrupted-intent-01',status:'processing',variantId:undefined,creditsCharged:0,creditsRefunded:0});await stores.save();
  stores=await createStores(directory);jobs=createAIJobs({stores,provider});await jobs.recover();await jobs.recover();
  assert.equal(calls,1);assert.equal(stores.state.properties[0].credits,19);assert.equal(stores.state.jobs[1].status,'failed');assert.equal(stores.state.jobs[1].creditsRefunded,1);assert.equal(stores.state.sessions[1].generating,false);
  const disk=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));assert.equal(disk.jobs[1].creditsRefunded,1);assert.equal(disk.properties[0].credits,19);
 }finally{jobs.close();await stores.local.pending;await rm(directory,{recursive:true,force:true});}
});

await test('Anonymous buyers receive two generations, identified buyers five; failures and agent jobs do not consume this quota',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-job-limits-'));let time=Date.now(),broken=false;
 const provider={name:'technical-fixture',configured:true,async edit(){if(broken)throw Error('Failure');return {image:'https://example.test/result.jpg'};}};
 const stores=await createStores(directory);Object.assign(stores.local.db,fixture());const db=stores.state,p=db.properties[0],s=db.sessions[0];
 const jobs=createAIJobs({stores,provider,clock:()=>time});
 async function generate(key){const job=await jobs.submit(p,s,input(key));await jobs.wait(job);time+=31000;return job;}
 try{
  assert.equal(buyerAllowance(db,p,s).remaining,2);
  await generate('anonymous-intent-01');await generate('anonymous-intent-02');assert.equal(buyerAllowance(db,p,s).remaining,0);
  await assert.rejects(jobs.submit(p,s,input('anonymous-intent-03')),{status:429});assert.equal(db.jobs.length,2);
  s.lead={name:'Buyer',email:'buyer@example.test'};assert.equal(buyerAllowance(db,p,s).remaining,3);
  broken=true;assert.equal((await generate('identified-failure-01')).status,'failed');assert.equal(buyerAllowance(db,p,s).remaining,3);assert.equal(p.credits,18);broken=false;
  for(let i=0;i<3;i++)await generate('identified-intent-0'+i);
  assert.equal(buyerAllowance(db,p,s).used,5);await assert.rejects(jobs.submit(p,s,input('identified-intent-04')),{status:429});assert.equal(p.credits,15);
  const agent={id:'agent',agent:true,events:[]};db.sessions.push(agent);const job=await jobs.submit(p,agent,input('agent-intent-key-01'));await jobs.wait(job);assert.equal(job.status,'completed');assert.equal(buyerAllowance(db,p,s).used,5);
  p.credits=0;const another={id:'other-buyer',events:[]};db.sessions.push(another);await assert.rejects(jobs.submit(p,another,input('no-property-budget-01')),{status:429});assert.equal(p.credits,0);
 }finally{jobs.close();await stores.local.pending;await rm(directory,{recursive:true,force:true});}
});

await test('Two visitors cannot reserve the last property credit simultaneously',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-last-credit-'));
 const stores=await createStores(directory);Object.assign(stores.local.db,fixture());const db=stores.state;db.properties[0].credits=1;
 const other={id:'other',events:[]};db.sessions.push(other);const jobs=createAIJobs({stores,provider:{name:'fixture',configured:true},concurrency:0});
 try{
  const results=await Promise.allSettled([jobs.submit(db.properties[0],db.sessions[0],input('last-credit-buyer-01')),jobs.submit(db.properties[0],other,input('last-credit-buyer-02'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,429);assert.equal(db.properties[0].credits,0);assert.equal(db.jobs.length,1);
  const disk=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));assert.equal(disk.properties[0].credits,0);assert.equal(disk.jobs[0].creditsReserved,1);
 }finally{jobs.close();await stores.local.pending;await rm(directory,{recursive:true,force:true});}
});

await test('A failed reservation cannot acknowledge a duplicate or call the paid provider',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-job-disk-failure-'));
 const stores=await createStores(directory);Object.assign(stores.local.db,fixture());const db=stores.state;
 let calls=0;const originalSave=stores.save;stores.save=()=>Promise.reject(Error('Technical disk failure'));
 const jobs=createAIJobs({stores,provider:{name:'fixture',configured:true,edit:async()=>{calls++;}},concurrency:1});
 try{
  const results=await Promise.allSettled([jobs.submit(db.properties[0],db.sessions[0],input('disk-failure-key-001')),jobs.submit(db.properties[0],db.sessions[0],input('disk-failure-key-001'))]);
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal(calls,0);assert.equal(db.jobs.length,0);assert.equal(db.properties[0].credits,20);assert.equal(db.sessions[0].generating,false);
 }finally{jobs.close();stores.save=originalSave;await stores.local.pending;await rm(directory,{recursive:true,force:true});}
});

// Real HTTP async route, not an in-memory queue-only test.
const directory=await mkdtemp(path.join(os.tmpdir(),'pt-jobs-http-'));
process.env.DATA_DIR=directory;process.env.ADMIN_TOKEN='isolated-jobs-test';process.env.AI_ENDPOINT='https://jobs-fixture.example.test/edit';
delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;delete process.env.NODE_ENV;
const nativeFetch=globalThis.fetch;let release,providerCalls=0,requestKey;
globalThis.fetch=async(url,options)=>{
 if(url!==process.env.AI_ENDPOINT)return nativeFetch(url,options);
 providerCalls++;requestKey=options.headers['Idempotency-Key'];await new Promise(resolve=>release=resolve);
 return new Response(JSON.stringify({image_url:'https://example.test/result.jpg'}),{headers:{'Content-Type':'application/json'}});
};
const {server}=await import('./server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
async function request(route,body,cookie='',agent=false){const response=await nativeFetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(agent?{Authorization:'Bearer '+process.env.ADMIN_TOKEN}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
try{
 await test('HTTP async requests return before completion, survive page closure and hide other session jobs',async()=>{
  const property=await request('/api/agent/publish',{title:'Technical fixture',rooms:[{id:'salon',name:'Salon',photos:['https://example.test/photo.jpg']}]},'',true);const slug=property.data.slug;
  const buyer=await request('/api/open?slug='+slug,{}),other=await request('/api/open?slug='+slug,{});
  assert.equal((await request('/api/generate?slug='+slug,{...input('http-intent-key-001'),idempotencyKey:undefined},buyer.cookie)).status,400);
  const created=await request('/api/generate?slug='+slug,input('http-intent-key-001'),buyer.cookie);assert.equal(created.status,202);assert.ok(['queued','processing'].includes(created.data.job.status));
  await until(()=>providerCalls===1);assert.equal(requestKey,created.data.job.id);
  const replay=await request('/api/generate?slug='+slug,input('http-intent-key-001'),buyer.cookie);assert.equal(replay.data.job.id,created.data.job.id);assert.equal(providerCalls,1);
  assert.deepEqual((await request('/api/jobs?slug='+slug,'',other.cookie)).data.jobs,[]);assert.deepEqual((await request('/api/agent/jobs','', '',true)).data.jobs,[]);
  assert.equal((await request('/api/jobs?slug='+slug)).status,401);
  const reopened=await request('/api/open?slug='+slug,{},buyer.cookie);assert.equal(reopened.data.jobs[0].id,created.data.job.id);assert.equal(reopened.data.aiAllowance.pending,1);assert.equal(reopened.data.aiAllowance.remaining,1);
  const disk=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));assert.equal(disk.jobs[0].status,'processing');assert.equal(disk.properties[0].credits,4);
  release();
  let result;for(let i=0;i<100;i++){result=await request('/api/jobs?slug='+slug+'&id='+created.data.job.id,'',buyer.cookie);if(result.data.jobs[0].status==='completed')break;await new Promise(resolve=>setTimeout(resolve,10));}
  const job=result.data.jobs[0];assert.equal(job.status,'completed');assert.equal(job.result.original,'https://example.test/photo.jpg');assert.equal(job.result.sessionId,undefined);assert.equal(job.creditsCharged,1);
  const finalReplay=await request('/api/generate?slug='+slug,input('http-intent-key-001'),buyer.cookie);assert.equal(finalReplay.data.job.result.id,job.result.id);assert.equal(providerCalls,1);assert.equal(finalReplay.data.job.credits,4);
  assert.equal((await request('/api/identify?slug='+slug,{name:'Buyer',email:'invalid'},buyer.cookie)).status,400);
  const identified=await request('/api/identify?slug='+slug,{name:'Buyer',email:'buyer@example.test'},buyer.cookie);assert.equal(identified.status,200);assert.equal(identified.data.aiAllowance.limit,5);assert.equal(identified.data.aiAllowance.remaining,4);
  const again=await request('/api/identify?slug='+slug,{name:'Buyer updated',email:'buyer@example.test',marketingConsent:false},buyer.cookie);assert.equal(again.status,200);
  const activity=await request('/api/agent/activity',undefined,'',true);assert.equal(activity.data.leads.length,1);assert.equal(activity.data.leads[0].kind,'project');assert.equal(activity.data.leads[0].name,'Buyer updated');assert.equal(activity.data.leads[0].marketingConsent,false);
  assert.equal(activity.data.sessions[0].events.filter(e=>e.type==='lead_identified').length,1);assert.ok(!activity.data.sessions[0].events.some(e=>e.type==='visit_requested'));
 });
}finally{globalThis.fetch=nativeFetch;await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
