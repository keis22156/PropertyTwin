import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import pg from 'pg';
import {createPostgresStores} from '../postgres-store.mjs';
import {createAIJobs} from '../ai-jobs.mjs';
import {createRoutingStore,defaultRouting} from '../ai-routing.mjs';
import sharp from 'sharp';
import {technicalRoomplan} from './fixtures/roomplan.mjs';
import {postgresBin} from './runtime-tools.mjs';

// A new, isolated local PostgreSQL cluster; never connects to DATABASE_URL.
if(process.getuid?.()===0)throw Error('test:postgres nécessite un utilisateur non root : PostgreSQL refuse initdb sous root.');
const bin=await postgresBin();
const command=promisify(execFile),temporary=await mkdtemp(path.join(os.tmpdir(),'pt-postgres-check-'));
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const pool=new pg.Pool({host:'127.0.0.1',port,user:'propertytwin_test',database:'postgres',max:8});
const pools=[],queues=[];let started=false;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',userA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const input=key=>({room:'salon',photo:'https://example.test/photo.jpg',prompt:'Salon clair',action:'Meubler',async:true,idempotencyKey:key});
async function check(name,operation){await operation();console.log('PASS '+name);}
async function until(predicate){for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('Timed out waiting for the database state.');}
try{
 await command(path.join(bin,'initdb'),['-D',path.join(temporary,'cluster'),'-A','trust','-U','propertytwin_test','--no-locale']);
 await command(path.join(bin,'pg_ctl'),['-D',path.join(temporary,'cluster'),'-l',path.join(temporary,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${temporary}`,'-w','start']);started=true;
 await pool.query("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;");
 await pool.query("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id text,bucket_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant all on storage.objects to authenticated,anon;create policy fixture_broad_access on storage.objects for all to authenticated,anon using(true) with check(true);");
 for(const name of ['202610050001_agencies.sql','202610050002_saas_data.sql','202610060003_media_registry.sql','202610060004_private_storage.sql','202610060005_ai_routing.sql'])await pool.query(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await pool.query('insert into auth.users(id) values($1),($2)',[userA,userB]);
 await pool.query("insert into public.agencies(id,name) values($1,'Technical A'),($2,'Technical B')",[a,b]);
 await pool.query("insert into public.agency_members(agency_id,user_id,role) values($1,$2,'owner'),($3,$4,'viewer')",[a,userA,b,userB]);
 const makePool=()=>{const value=new pg.Pool({host:'127.0.0.1',port,user:'propertytwin_test',database:'postgres',max:6});pools.push(value);return value;};
 const one=await createPostgresStores(path.join(temporary,'files'),{pool:makePool()}),two=await createPostgresStores(path.join(temporary,'files'),{pool:makePool()});
 const agencyOne=await one.load(a),agencyTwo=await two.load(a);
 const fixture={slug:'technical-property',title:'Technical fixture',description:'Initial',credits:1,rooms:[{id:'salon',name:'Salon',photos:['https://example.test/photo.jpg']},{id:'chambre',name:'Chambre',photos:[]}],roomplan:technicalRoomplan()};
 await check('Schema migration and normalized RoomPlan round trip',async()=>{
  await one.run(agencyOne,null,async()=>{one.state.properties.push(fixture);one.state.sessions.push({id:'buyer-one',slug:fixture.slug,events:[]},{id:'buyer-two',slug:fixture.slug,events:[]});await one.save();});
  await two.run(agencyTwo,null,()=>assert.deepEqual(two.state.properties[0],fixture));
  assert.equal((await pool.query('select count(*)::int n from public.property_rooms')).rows[0].n,2);
  assert.equal((await pool.query('select count(*)::int n from public.roomplan_assets')).rows[0].n,1);
 });
 await check('Two server transactions preserve separate edits and roll back failed requests',async()=>{
  await Promise.all([one.run(agencyOne,null,async()=>{one.state.properties[0].title='From server one';await new Promise(resolve=>setTimeout(resolve,50));await one.save();}),two.run(agencyTwo,null,async()=>{two.state.properties[0].description='From server two';await two.save();})]);
  await assert.rejects(one.run(agencyOne,null,async()=>{one.state.properties[0].title='Must roll back';await one.save();throw Error('Technical rollback');}));
  await two.run(agencyTwo,null,()=>{assert.equal(two.state.properties[0].title,'From server one');assert.equal(two.state.properties[0].description,'From server two');});
 });
 const disabled={name:'technical-provider',configured:true},queueOne=createAIJobs({stores:one,provider:disabled,concurrency:0}),queueTwo=createAIJobs({stores:two,provider:disabled,concurrency:0});queues.push(queueOne,queueTwo);
 await check('Separate servers cannot reserve the same last credit',async()=>{
  const results=await Promise.allSettled([one.run(agencyOne,null,()=>queueOne.submit(one.state.properties[0],one.state.sessions.find(s=>s.id==='buyer-one'),input('last-credit-intent-001'))),two.run(agencyTwo,null,()=>queueTwo.submit(two.state.properties[0],two.state.sessions.find(s=>s.id==='buyer-two'),input('last-credit-intent-002')))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
  assert.equal((await pool.query('select (data->>\'credits\')::int n from public.properties')).rows[0].n,0);
  assert.equal((await pool.query('select count(*)::int n from private.ai_jobs')).rows[0].n,1);
 });
 let finish,calls=0;
 const provider={name:'technical-provider',configured:true,async edit(){calls++;await new Promise(resolve=>finish=resolve);return {image:'https://example.test/result.jpg'};}};
 const workerOne=createAIJobs({stores:one,provider}),workerTwo=createAIJobs({stores:two,provider});queues.push(workerOne,workerTwo);
 await check('Two workers claim one job, release the lock during provider work, and preserve live leases',async()=>{
  await Promise.all([workerOne.recover(),workerTwo.recover()]);await until(()=>Boolean(finish));assert.equal(calls,1);
  await workerTwo.recover();assert.equal((await pool.query('select status from private.ai_jobs')).rows[0].status,'processing');
  await two.run(agencyTwo,null,async()=>{two.state.properties[0].description='Edited while provider works';await two.save();});
  finish();await until(async()=> (await pool.query('select status from private.ai_jobs')).rows[0].status==='completed');assert.equal(calls,1);
  await two.run(agencyTwo,null,()=>{assert.equal(two.state.properties[0].description,'Edited while provider works');assert.equal(two.state.variants.length,1);assert.equal(two.state.jobs[0].creditsCharged,1);});
 });
 await check('Cross-server idempotency returns the completed result without another charge',async()=>{
  const job=(await pool.query('select data from private.ai_jobs')).rows[0].data;
  const result=await two.run(agencyTwo,null,()=>workerTwo.submit(two.state.properties[0],two.state.sessions.find(s=>s.id===job.sessionId),{...input(job.idempotencyKey)}));
  assert.equal(result.id,job.id);assert.equal(result.status,'completed');assert.equal(calls,1);
 });
 await check('An expired processing lease refunds once across workers',async()=>{
  await one.run(agencyOne,null,async()=>{const original=one.state.jobs[0];one.state.sessions.push({id:'interrupted',slug:fixture.slug,events:[],generating:true});one.state.jobs.push({...original,id:'interrupted-job',principal:'interrupted',sessionId:'interrupted',idempotencyKey:'interrupted-intent-01',status:'processing',variantId:undefined,creditsCharged:0,creditsRefunded:0,leaseExpires:new Date(Date.now()-1000).toISOString()});await one.save();});
  await Promise.all([workerOne.recover(),workerTwo.recover()]);
  const job=(await pool.query("select data from private.ai_jobs where id='interrupted-job'")).rows[0].data;
  assert.equal(job.status,'failed');assert.equal(job.creditsRefunded,1);assert.equal((await pool.query('select (data->>\'credits\')::int n from public.properties')).rows[0].n,1);assert.equal(calls,1);
 });
 await check('SQL RLS isolates agencies, denies viewer writes and hides session credentials',async()=>{
  const foreign=await one.load(b);await one.run(foreign,null,async()=>{one.state.properties.push({...fixture,slug:'foreign-property',roomplan:undefined});await one.save();});
  const client=await pool.connect();
  try{
   await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[userA]);
   assert.deepEqual((await client.query('select slug from public.properties')).rows.map(r=>r.slug),['technical-property']);await client.query('rollback');
   await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[userB]);
   assert.deepEqual((await client.query('select slug from public.properties')).rows.map(r=>r.slug),['foreign-property']);
   await assert.rejects(client.query("update public.properties set data='{}'"),{code:'42501'});await client.query('rollback');
   await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[userA]);
   await assert.rejects(client.query('select * from private.buyer_sessions'),{code:'42501'});await client.query('rollback');
   await client.query("insert into storage.objects(id,bucket_id) values('private-fixture','propertytwin-media'),('other-fixture','other-bucket')");
   await client.query('begin');await client.query('set local role authenticated');assert.deepEqual((await client.query('select id from storage.objects')).rows.map(r=>r.id),['other-fixture']);await assert.rejects(client.query("insert into storage.objects(id,bucket_id) values('forbidden','propertytwin-media')"),{code:'42501'});await client.query('rollback');
  }finally{client.release();}
 });
 // Stop technical workers before the real HTTP server starts its own queue.
 for(const queue of queues)queue.close();
 await check('App and SaaS share PostgreSQL, signed media, concurrent upload claims, migration and cleanup over HTTP',async()=>{
  process.env.DATABASE_URL=`postgresql://propertytwin_test@127.0.0.1:${port}/postgres`;
  process.env.DATA_DIR=path.join(temporary,'files');process.env.SUPABASE_URL='https://postgres-auth-fixture.example.test';process.env.SUPABASE_ANON_KEY='technical-public-key';delete process.env.NODE_ENV;delete process.env.AI_ENDPOINT;delete process.env.ENABLE_DEMO;
  process.env.MEDIA_STORAGE='supabase';process.env.SUPABASE_SERVICE_ROLE_KEY='technical-storage-backend-key';
  const nativeFetch=globalThis.fetch,objects=new Map(),imageInputs=[];let imageCalls=0,holdKey,stageReadStarted,releaseRead;const readReleases=[];
  const variantImage=await sharp({create:{width:20,height:20,channels:3,background:'#337755'}}).png().toBuffer();
  globalThis.fetch=async(url,options={})=>{
   if(url===process.env.AI_ENDPOINT){imageCalls++;imageInputs.push(JSON.parse(options.body));assert.ok(imageInputs.at(-1).image_base64);return new Response(JSON.stringify({image_base64:variantImage.toString('base64')}),{headers:{'Content-Type':'application/json'}});}
   if(!String(url).startsWith(process.env.SUPABASE_URL))return nativeFetch(url,options);
   const route=new URL(url).pathname;
   const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
   if(route.startsWith('/storage/v1/')){
    assert.equal(options.headers.Authorization,'Bearer technical-storage-backend-key');assert.equal(options.redirect,'error');
    const storage=route.slice('/storage/v1/'.length);
    if(storage==='bucket/propertytwin-media')return json({public:false,file_size_limit:50000000});
    if(storage.startsWith('object/upload/sign/'))return json({url:'/object/upload/sign/'+storage.slice('object/upload/sign/'.length)+'?token=technical-upload'});
    if(storage.startsWith('object/sign/'))return json({signedURL:'/object/sign/'+storage.slice('object/sign/'.length)+'?token=technical-download'});
    const key=storage.slice('object/propertytwin-media/'.length);
    if(options.method==='DELETE'){for(const key of JSON.parse(options.body).prefixes)objects.delete(key);return json({});}
    if(options.method==='POST'){assert.equal(options.headers['x-upsert'],'false');assert.ok(!objects.has(key));objects.set(key,Buffer.from(options.body));return json({Key:key});}
    if(key===holdKey){stageReadStarted=(Number(stageReadStarted)||0)+1;await new Promise(resolve=>{readReleases.push(resolve);releaseRead=()=>{for(const finish of readReleases.splice(0))finish();};});}
    return objects.has(key)?new Response(objects.get(key)):new Response('{}',{status:404});
   }
   if(route==='/auth/v1/token')return json({access_token:'technical-user-token',refresh_token:'technical-refresh-token',expires_in:3600});
   if(route==='/auth/v1/user'){assert.equal(options.headers.Authorization,'Bearer technical-user-token');return json({id:userA,email:'technical@example.test'});}
   if(route==='/rest/v1/agency_members')return json([{agency_id:a,role:'owner',agencies:{id:a,name:'Technical A'}}]);
   return json({});
  };
  const {server}=await import('../server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;process.env.PUBLIC_SITE_URL=origin;
  const request=async(route,body,{bearer,cookie}={})=>{
   const response=await nativeFetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,...(bearer?{Authorization:'Bearer '+bearer,'X-PropertyTwin-Agency':a}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  try{
   const mobile=await request('/api/mobile/login',{email:'technical@example.test',password:'technical-password'});assert.equal(mobile.status,200);assert.equal(mobile.cookie,undefined);assert.equal(mobile.data.access_token,'technical-user-token');
   const native={bearer:mobile.data.access_token};const created=await request('/api/agent/sync',{clientKey:'native-shared-database-key',patch:{title:'Created from native app',rooms:[]}},native);assert.equal(created.status,200);const slug=created.data.property.slug;
   const webLogin=await request('/api/auth/login',{email:'technical@example.test',password:'technical-password'});assert.equal(webLogin.data.access_token,undefined);const web={cookie:webLogin.cookie};
   const listed=await request('/api/agent/properties',undefined,web);const p=listed.data.find(p=>p.slug===slug);assert.equal(p.title,'Created from native app');
   const updated=await request('/api/agent/update',{slug,baseline:p,property:{...p,title:'Edited from SaaS'}},web);assert.equal(updated.status,200);
   const feed=await request('/api/agent/sync-feed',undefined,native);assert.equal(feed.data.properties.find(p=>p.slug===slug).title,'Edited from SaaS');
   const row=(await pool.query('select agency_id,data from public.properties where slug=$1',[slug])).rows[0];assert.equal(row.agency_id,a);assert.equal(row.data.title,'Edited from SaaS');
   const original=await sharp({create:{width:30,height:20,channels:3,background:'#d2dadf'}}).png().toBuffer();
   const signed=await request('/api/v1/properties/'+slug+'/media/upload-url',{type:'image/png',size:original.length,idempotencyKey:'http-storage-upload-key-01'},web);assert.equal(signed.status,201);
   assert.ok(!JSON.stringify(signed.data).includes(process.env.SUPABASE_SERVICE_ROLE_KEY));
   const key=new URL(signed.data.uploadURL).pathname.split('/propertytwin-media/')[1];objects.set(key,Buffer.alloc(original.length));
   assert.equal((await request('/api/v1/properties/'+slug+'/media/complete',{uploadId:signed.data.uploadId},web)).status,400);
   assert.equal((await pool.query('select count(*)::int n from private.media_files where agency_id=$1',[a])).rows[0].n,0);
   assert.equal((await request('/api/v1/properties/technical-property/media/complete',{uploadId:signed.data.uploadId},web)).status,404);
   objects.set(key,original);holdKey=key;const completing=request('/api/v1/properties/'+slug+'/media/complete',{uploadId:signed.data.uploadId},web);await until(()=>stageReadStarted);assert.equal((await request('/api/v1/properties/'+slug+'/media/complete',{uploadId:signed.data.uploadId},web)).status,409);holdKey=null;releaseRead();const complete=await completing;assert.equal(complete.status,201);assert.ok(complete.data.media.sources.length);
   const count=objects.size;assert.equal((await request('/api/agent/upload-complete',{slug,uploadId:signed.data.uploadId},web)).data.url,complete.data.url);assert.equal(objects.size,count);
   const registered=(await pool.query('select metadata from private.media_files where url=$1',[complete.data.url])).rows[0].metadata;assert.equal(registered.backend,'supabase');assert.deepEqual(objects.get(registered.key),original);assert.notEqual(registered.key,key);
   await assert.rejects(readFile(path.join(process.env.DATA_DIR,'agencies',a,complete.data.url)),{code:'ENOENT'});
   const download=await nativeFetch(origin+complete.data.url,{redirect:'manual'});assert.equal(download.status,302);assert.match(download.headers.get('location'),/token=technical-download/);assert.equal(download.headers.get('cache-control'),'no-store');
   const nativeUpload=await request('/api/agent/upload',{type:'image/png',base64:original.toString('base64')},native);assert.equal(nativeUpload.status,201);assert.equal((await pool.query('select metadata from private.media_files where url=$1',[nativeUpload.data.url])).rows[0].metadata.backend,'supabase');
   process.env.AI_ENDPOINT='https://postgres-ai-fixture.example.test/edit';
   const latest=(await request('/api/agent/properties',undefined,web)).data.find(p=>p.slug===slug);
   const photo=await request('/api/agent/update',{slug,baseline:latest,property:{...latest,rooms:[{id:'salon',name:'Salon',photos:[complete.data.url]}]}},web);assert.equal(photo.status,200);
   const creditsBefore=photo.data.property.credits,filesBefore=(await pool.query('select count(*)::int n from private.media_files where agency_id=$1',[a])).rows[0].n;
   holdKey=registered.key;stageReadStarted=0;
   const editInput={slug,room:'salon',photo:complete.data.url,exposure:.4,shadows:20,sharpness:10,crop:'1:1'};
   const retouchOne=request('/api/agent/photo-edit',editInput,web),retouchTwo=request('/api/agent/photo-edit',{...editInput,temperature:8},web);
   await until(()=>stageReadStarted===2);assert.equal((await request('/api/agent/photo-edit',editInput,web)).status,429);
   const concurrentEdit=await request('/api/agent/update',{slug,baseline:photo.data.property,property:{...photo.data.property,title:'Edited while retouching'}},web);assert.equal(concurrentEdit.status,200);
   holdKey=null;releaseRead();const edits=await Promise.all([retouchOne,retouchTwo]);assert.ok(edits.every(edit=>edit.status===201));assert.notEqual(edits[0].data.url,edits[1].data.url);assert.deepEqual(objects.get(registered.key),original);
   const editedRow=(await pool.query('select data from public.properties where slug=$1',[slug])).rows[0].data;assert.equal(editedRow.title,'Edited while retouching');assert.equal(editedRow.credits,creditsBefore);assert.equal(imageCalls,0);
   const countBeforeConflict=(await pool.query('select count(*)::int n from private.media_files where agency_id=$1',[a])).rows[0].n;assert.ok(countBeforeConflict>filesBefore);
   const fullEdited=(await request('/api/agent/properties',undefined,web)).data.find(p=>p.slug===slug);
   holdKey=registered.key;stageReadStarted=0;const obsolete=request('/api/agent/photo-edit',editInput,web);await until(()=>stageReadStarted===1);
   let removedPhoto;try{removedPhoto=await request('/api/agent/update',{slug,baseline:fullEdited,property:{...fullEdited,rooms:[{id:'salon',name:'Salon',photos:[]}]}},web);assert.equal(removedPhoto.status,200);}finally{holdKey=null;releaseRead();}
   assert.equal((await obsolete).status,409);assert.equal((await pool.query('select count(*)::int n from private.media_files where agency_id=$1',[a])).rows[0].n,countBeforeConflict);
   const restorePhoto=await request('/api/agent/update',{slug,baseline:removedPhoto.data.property,property:{...removedPhoto.data.property,rooms:[{id:'salon',name:'Salon',photos:[complete.data.url]}]}},web);assert.equal(restorePhoto.status,200);
   const generated=await request('/api/agent/generate',{slug,room:'salon',photo:complete.data.url,prompt:'Salon clair'},web);assert.equal(generated.status,201);assert.equal(generated.data.original,complete.data.url);assert.equal(imageCalls,1);
   assert.equal((await pool.query('select status from private.ai_jobs where slug=$1',[slug])).rows[0].status,'completed');
   process.env.AI_SUPPORTS_MASK='1';
   const masked=await request('/api/agent/sync',{clientKey:'postgres-masked-photo-key',patch:{title:'Isolated PostgreSQL mask fixture',rooms:[{id:'salon',name:'Salon',photos:[complete.data.url]}]},baseline:{}},web);assert.equal(masked.status,200);
   const maskPixels=Buffer.alloc(30*20);maskPixels[10*30+10]=255;const mask={width:30,height:20,base64:(await sharp(maskPixels,{raw:{width:30,height:20,channels:1}}).png().toBuffer()).toString('base64')};
   const erased=await request('/api/agent/generate',{slug:masked.data.property.slug,room:'salon',photo:complete.data.url,action:'Supprimer un objet',mask,async:true,idempotencyKey:'postgres-erase-intent-001'},web);assert.equal(erased.status,202);
   let erasedJob;await until(async()=>{erasedJob=(await request('/api/agent/jobs?id='+erased.data.job.id,undefined,web)).data.jobs[0];return erasedJob.status==='completed';});
   assert.equal(erasedJob.creditsCharged,1);assert.equal(erasedJob.credits,4);assert.equal(erasedJob.input,undefined);assert.equal(imageInputs.at(-1).mask_convention,'white-edit-black-keep');assert.equal(imageInputs.at(-1).mask_width,30);
   const persisted=(await pool.query('select data from private.ai_jobs where id=$1',[erasedJob.id])).rows[0].data;assert.equal(persisted.input.mask.width,30);assert.ok(persisted.input.mask.digest);assert.equal(persisted.creditsCharged,1);assert.equal(persisted.input.routing.operation,'magicErase');assert.equal(persisted.attempts[0].status,'completed');assert.equal(persisted.attempts[0].provider,'http-image-editing');assert.deepEqual(objects.get(registered.key),original);
   const repeatErasure=await request('/api/agent/generate',{slug:masked.data.property.slug,room:'salon',photo:complete.data.url,action:'Supprimer un objet',mask,async:true,idempotencyKey:'postgres-erase-intent-001'},web);assert.equal(repeatErasure.data.job.id,erasedJob.id);assert.equal(imageCalls,2);delete process.env.AI_SUPPORTS_MASK;

   const revisions=await Promise.all([request('/api/agent/variant',{id:generated.data.id,slug,revision:1,patch:{label:'Parquet choisi',favorite:true}},web),request('/api/agent/variant',{id:generated.data.id,slug,revision:1,patch:{label:'Concurrent'}},native)]);
   assert.deepEqual(revisions.map(r=>r.status).sort(),[200,409]);const parentRevision=revisions.find(r=>r.status===200).data.revision;
   // Expire only the fixture's rate-limit timestamp to exercise the next real HTTP job.
   await one.run(agencyOne,null,async()=>{one.state.sessions.find(s=>s.agent&&s.slug===slug).lastGeneration=0;await one.save();});
   const chained=await request('/api/agent/generate',{slug,room:'salon',photo:complete.data.url,parentVariantId:generated.data.id,action:'Changer le sol',async:true,idempotencyKey:'postgres-variant-chain-001'},web);assert.equal(chained.status,202);
   let chainedJob;await until(async()=>{chainedJob=(await request('/api/agent/jobs?id='+chained.data.job.id,undefined,native)).data.jobs[0];return chainedJob.status==='completed';});
   assert.equal(imageCalls,3);assert.equal(imageInputs.at(-1).image_base64,variantImage.toString('base64'));assert.equal(chainedJob.result.parentVariantId,generated.data.id);assert.equal(chainedJob.result.original,complete.data.url);
   const childRow=(await pool.query('select data from public.variants where id=$1',[chainedJob.result.id])).rows[0].data;assert.equal(childRow.parentVariantId,generated.data.id);assert.equal(childRow.revision,1);
   const deleted=await request('/api/agent/variant',{slug,id:generated.data.id,revision:parentRevision,patch:{deleted:true}},native);assert.equal(deleted.status,200);assert.equal(deleted.data.image,undefined);
   const tree=(await request('/api/agent/variants',undefined,web)).data;assert.equal(tree.find(v=>v.id===generated.data.id).image,undefined);assert.equal(tree.find(v=>v.id===chainedJob.result.id).parentVariantId,generated.data.id);
   assert.equal((await pool.query('select data from public.properties where slug=$1',[slug])).rows[0].data.credits,creditsBefore-2);

   const legacyURL='/media/'+'L'.repeat(32)+'.png',legacyPath=path.join(process.env.DATA_DIR,'agencies',a,legacyURL);await writeFile(legacyPath,original);
   await one.run(agencyOne,null,async()=>{one.current().files.add(legacyURL);await one.save();});
   const oldArguments=process.argv;process.argv=[process.execPath,'migrate-media.mjs','--agency='+a];
   try{await import('./migrate-media.mjs');}finally{process.argv=oldArguments;}
   const migrated=(await pool.query('select metadata from private.media_files where url=$1',[legacyURL])).rows[0].metadata;assert.equal(migrated.backend,'supabase');assert.deepEqual(objects.get(migrated.key),original);assert.deepEqual(await readFile(legacyPath),original);
   const expiredKey=a+'/'+'E'.repeat(32)+'.png';objects.set(expiredKey,original);
   await one.run(agencyOne,null,async()=>{one.state.uploads['expired-fixture']={id:'expired-fixture',key:expiredKey,status:'pending',expiresAt:Date.now()-3600000,lastSignedAt:Date.now()-10800000};await one.save();});
   await import('./cleanup-uploads.mjs');assert.equal(objects.has(expiredKey),false);assert.deepEqual(objects.get(migrated.key),original);assert.equal((await pool.query("select uploads ? 'expired-fixture' as exists from private.workspaces where agency_id=$1",[a])).rows[0].exists,false);

   const loginRefresh=await request('/api/mobile/refresh',{refresh_token:mobile.data.refresh_token});assert.equal(loginRefresh.data.access_token,'technical-user-token');
  }finally{holdKey=null;releaseRead?.();await new Promise(resolve=>server.close(resolve));globalThis.fetch=nativeFetch;}
 });
 await check('Legacy import preserves source files and sync keys, and refuses a populated target',async()=>{
  const importedAgency='33333333-3333-4333-8333-333333333333';
  await pool.query("insert into public.agencies(id,name) values($1,'Technical import')",[importedAgency]);
  const source=path.join(temporary,'legacy'),mediaName='M'.repeat(32)+'.jpg',bytes=Buffer.from('technical-import-file');
  await mkdir(path.join(source,'media'),{recursive:true});await writeFile(path.join(source,'media',mediaName),bytes);
  const legacy={properties:[{...fixture,slug:'imported-property',syncKey:'native-original-key'}],workspace:{name:'Imported agency'}};
  const original=JSON.stringify(legacy);await writeFile(path.join(source,'store.json'),original);
  const args=[new URL('./import-postgres.mjs',import.meta.url).pathname,'--source='+source,'--agency='+importedAgency];
  for(const forbidden of [{assets:{['/media/'+mediaName]:{backend:'supabase',key:a+'/'+mediaName}}},{uploads:{pending:{key:a+'/'+mediaName}}}]){
   const unsafe=JSON.stringify({...legacy,...forbidden});await writeFile(path.join(source,'store.json'),unsafe);
   await assert.rejects(command(process.execPath,args,{env:{...process.env,DATA_DIR:path.join(temporary,'files')}}),/store local/);
   assert.equal((await pool.query('select count(*)::int n from public.properties where agency_id=$1',[importedAgency])).rows[0].n,0);
   assert.equal(await readFile(path.join(source,'store.json'),'utf8'),unsafe);
  }
  await writeFile(path.join(source,'store.json'),original);
  await command(process.execPath,args,{env:{...process.env,DATA_DIR:path.join(temporary,'files')}});
  assert.equal((await pool.query('select data from public.properties where slug=$1',['imported-property'])).rows[0].data.syncKey,'native-original-key');
  assert.equal(await readFile(path.join(source,'store.json'),'utf8'),original);
  assert.deepEqual(await readFile(path.join(temporary,'files','agencies',importedAgency,'media',mediaName)),bytes);
  assert.equal((await pool.query('select url from private.media_files where agency_id=$1',[importedAgency])).rows[0].url,'/media/'+mediaName);
  await assert.rejects(command(process.execPath,args,{env:{...process.env,DATA_DIR:path.join(temporary,'files')}}));
  assert.equal((await pool.query('select count(*)::int n from public.properties where agency_id=$1',[importedAgency])).rows[0].n,1);
 });
 await check('Platform routing is shared across servers, rejects concurrent stale writes and stays inaccessible to agency JWTs',async()=>{
  const first=createRoutingStore({directory:temporary,pool:makePool()}),second=createRoutingStore({directory:temporary,pool:makePool()}),config=defaultRouting();
  const results=await Promise.allSettled([first.write({...config,enabled:false},0),second.write({...config,buyerEnabled:false},0)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  const read=await second.read();assert.equal(read.config.revision,1);await second.write({...config,revision:1},1);assert.equal((await first.read()).config.enabled,true);assert.equal((await first.read()).config.revision,2);
  const client=await pool.connect();try{await client.query('begin');await client.query('set local role authenticated');await assert.rejects(client.query('select config from private.ai_routing'),{code:'42501'});await client.query('rollback');}finally{client.release();}
 });
 await check('Standalone shared database works without accounts and persists app/web changes and media',async()=>{
  await pool.query('create database propertytwin_shared_test');
  const standalone=new pg.Pool({host:'127.0.0.1',port,user:'propertytwin_test',database:'propertytwin_shared_test'});
  try{
   await standalone.query(await readFile(new URL('../standalone-schema.sql',import.meta.url),'utf8'));
   await standalone.query(await readFile(new URL('../platform-ai-schema.sql',import.meta.url),'utf8'));
   await standalone.query('insert into public.agencies(id,name) values($1,$2)',[a,'Shared test workspace']);
   const directory=path.join(temporary,'shared-files');await mkdir(path.join(directory,'media'),{recursive:true});
   const image='/media/'+'S'.repeat(32)+'.png';await writeFile(path.join(directory,image),Buffer.from('technical-file'));
   const first=await createPostgresStores(directory,{pool:standalone,sharedWorkspace:a});
   await first.run(first.local,null,async()=>{await first.importFiles(first.current());await first.save();});
   const code=`
    const {server}=await import('./server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    const request=async(route,body,key='shared-test-key')=>{const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;};
    try{
     const connection=await request('/api/agent/connection');if(connection.database!=='postgres'||!connection.shared||connection.accounts)throw Error('Wrong database');
     const pair=await request('/api/agent/pair',{}),native=await request('/api/mobile/pair',{code:pair.code},'');
     const created=await request('/api/agent/sync',{clientKey:'iphone-shared-key',patch:{title:'Created on iPhone',rooms:[]},baseline:{}},native.token);
     const properties=await request('/api/agent/properties'),property=properties.find(p=>p.slug===created.property.slug);
     if(property.title!=='Created on iPhone')throw Error('App creation missing from web');
     await request('/api/agent/update',{slug:property.slug,baseline:property,property:{...property,title:'Edited on web'}});
     const imported=await request('/api/agent/sync',{clientKey:'iphone-shared-key',slug:property.slug,patch:{},baseline:property},native.token);
     if(imported.property.title!=='Edited on web')throw Error('Web update missing from app');
     const download=await fetch(origin+${JSON.stringify(image)});if(await download.text()!=='technical-file')throw Error('Imported media missing');
    }finally{await new Promise(resolve=>server.close(resolve));}
   `;
   await command(process.execPath,['--input-type=module','-e',code],{cwd:new URL('../',import.meta.url).pathname,timeout:30000,env:{...process.env,DATABASE_URL:`postgresql://propertytwin_test@127.0.0.1:${port}/propertytwin_shared_test`,DATA_DIR:directory,ADMIN_TOKEN:'shared-test-key',SHARED_WORKSPACE_ID:a,SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',MEDIA_STORAGE:'disk',AI_ENDPOINT:'',NODE_ENV:''}});
   const second=await createPostgresStores(directory,{pool:standalone,sharedWorkspace:a});
   await second.run(second.local,null,()=>{assert.equal(second.state.properties.length,1);assert.equal(second.state.properties[0].title,'Edited on web');assert.ok(second.current().files.has(image));});
  }finally{await standalone.end();}
 });
 console.log('PostgreSQL: 11 checks passed on an isolated real server.');
}finally{
 for(const queue of queues)queue.close();for(const connection of pools)await connection.end();await pool.end();
 if(started)await command(path.join(bin,'pg_ctl'),['-D',path.join(temporary,'cluster'),'-m','immediate','-w','stop']);
 await rm(temporary,{recursive:true,force:true});
}
