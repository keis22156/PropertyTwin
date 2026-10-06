import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAuth} from './auth.mjs';

const dir=await mkdtemp(path.join(os.tmpdir(),'propertytwin-auth-'));
const agencyA='11111111-1111-4111-8111-111111111111',agencyB='22222222-2222-4222-8222-222222222222';
const userA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
process.env.DATA_DIR=dir;process.env.SUPABASE_URL='https://auth-fixture.example.test';process.env.SUPABASE_ANON_KEY='fixture-public-key';process.env.AUTH_COOKIE_SECRET='ab'.repeat(32);delete process.env.ENABLE_DEMO;
const nativeFetch=globalThis.fetch,calls=[];let roleA='owner',memberA=true;
globalThis.fetch=async(input,options={})=>{
 if(!String(input).startsWith(process.env.SUPABASE_URL))return nativeFetch(input,options);
 const url=new URL(input),body=options.body?JSON.parse(options.body):{},credential=options.headers.Authorization,candidate=credential==='Bearer jwt-b'?'b':credential==='Bearer jwt-a'?'a':null;
 calls.push({url,body,credential,method:options.method});
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 if(url.pathname==='/auth/v1/token'){
  if(url.searchParams.get('grant_type')==='password'){if(body.password==='wrong')return json({error:'invalid'},400);return json({access_token:'jwt-a',refresh_token:'refresh-a',expires_in:3600});}
  if(body.refresh_token==='refresh-a')return json({access_token:'jwt-a',refresh_token:'refresh-a',expires_in:3600});
  return json({error:'invalid'},401);
 }
 if(url.pathname==='/auth/v1/user')return candidate?json({id:candidate==='a'?userA:userB,email:candidate+'@example.test'}):json({error:'invalid'},401);
 if(url.pathname==='/rest/v1/agency_members'){
  assert.ok(candidate,'Membership lookup must carry a verified user token');
  return json(candidate==='a'?(memberA?[{agency_id:agencyA,role:roleA,agencies:{id:agencyA,name:'Agence A'}}]:[]):[{agency_id:agencyB,role:'agent',agencies:{id:agencyB,name:'Agence B'}}]);
 }
 if(url.pathname==='/auth/v1/signup')return json({id:userA});
 if(['/auth/v1/otp','/auth/v1/recover','/auth/v1/logout'].includes(url.pathname))return json({});
 if(url.pathname==='/rest/v1/rpc/create_agency')return json(agencyA);
 return json({error:'Unexpected fixture route'},404);
};
const {server}=await import('./server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;process.env.PUBLIC_SITE_URL=origin;
async function request(route,{body,bearer,cookie,source=origin,method=body?'POST':'GET'}={}){
 const response=await nativeFetch(origin+route,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{}),...(cookie?{Cookie:cookie}:{}),Origin:source},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
}


await test('Supabase connection keeps tokens server-side and validates origin, cookie and membership',async()=>{
 assert.deepEqual((await request('/api/auth/config')).data,{enabled:true,local:false});
 assert.equal((await request('/api/agent/properties')).status,401);
 const invalidBody=await nativeFetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'null'});assert.equal(invalidBody.status,400);
 const oversized=await request('/api/auth/login',{body:{email:'a@example.test',password:'a'.repeat(11000)}});assert.equal(oversized.status,413);
 assert.equal((await request('/api/auth/login',{body:{email:'a@example.test',password:'valid-password'},source:'https://attacker.test'})).status,403);
 const login=await request('/api/auth/login',{body:{email:'a@example.test',password:'valid-password'}});
 assert.equal(login.status,200);assert.equal(login.data.access_token,undefined);assert.match(login.cookie,/HttpOnly; SameSite=Lax; Path=\//);assert.ok(!login.cookie.includes('jwt-a'));assert.ok(!login.cookie.includes('refresh-a'));
 const cookie=login.cookie.split(';')[0];
 assert.equal((await request('/api/auth/me',{cookie})).data.user.id,userA);
 assert.equal((await request('/api/agent/properties',{cookie})).status,200);
 assert.equal((await request('/api/agent/draft',{cookie,source:'https://attacker.test',body:{title:'Attack',rooms:[]}})).status,403);
 const [name,value]=cookie.split('=');const altered=name+'='+(value[0]==='a'?'b':'a')+value.slice(1);
 assert.equal((await request('/api/auth/me',{cookie:altered})).status,401);
 assert.equal((await request('/api/auth/agency',{cookie,body:{agency:agencyB}})).status,403);
 memberA=false;assert.equal((await request('/api/agent/properties',{cookie})).status,403);memberA=true;
 const logout=await request('/api/auth/logout',{cookie,body:{}});assert.equal(logout.status,200);assert.match(logout.cookie,/Max-Age=0/);
});

await test('Agency data, media, buyer sessions and leads remain isolated across real HTTP routes',async()=>{
 const sharp=(await import('sharp')).default;
 const photo=await sharp({create:{width:32,height:24,channels:3,background:'#aabbcc'}}).png().toBuffer();
 const upload=await request('/api/agent/upload',{bearer:'jwt-a',body:{type:'image/png',base64:photo.toString('base64')}});assert.equal(upload.status,201);
 const created=await request('/api/agent/draft',{bearer:'jwt-a',body:{title:'Bien A',rooms:[{id:'salon',name:'Salon',photos:[upload.data.url]}]}});assert.equal(created.status,201);const slug=created.data.slug;
 const own=await request('/api/agent/properties',{bearer:'jwt-a'});assert.equal(own.data.length,1);
 assert.deepEqual((await request('/api/agent/properties',{bearer:'jwt-b'})).data,[]);
 assert.equal((await request('/api/agent/update',{bearer:'jwt-b',body:{slug,property:{title:'Volé',rooms:[]}}})).status,404);
 assert.equal((await request('/api/agent/prepare-share',{bearer:'jwt-b',body:{slug}})).status,404);
 assert.equal((await request('/api/agent/prepare-share',{bearer:'jwt-a',body:{slug}})).status,200);
 const media=await nativeFetch(origin+upload.data.url);assert.deepEqual(Buffer.from(await media.arrayBuffer()),photo);
 const opened=await request('/api/open?slug='+slug,{body:{}});assert.equal(opened.status,200);const cookie=opened.cookie.split(';')[0];
 assert.equal((await request('/api/contact?slug='+slug,{cookie,body:{name:'Client A',email:'client@example.test',kind:'visit'}})).status,200);
 assert.equal((await request('/api/agent/activity',{bearer:'jwt-a'})).data.leads.length,1);
 assert.equal((await request('/api/agent/activity',{bearer:'jwt-b'})).data.leads.length,0);
 assert.equal((await request('/api/agent/sync-workspace',{bearer:'jwt-b',body:{patch:{name:'Forbidden'},baseline:{}}})).status,403);
 const stored=JSON.parse(await readFile(path.join(dir,'agencies',agencyA,'store.json'),'utf8'));assert.equal(stored.properties[0].title,'Bien A');
 assert.equal(JSON.parse(await readFile(path.join(dir,'agencies',agencyA,'store.json'),'utf8')).leads[0].name,'Client A');
 roleA='viewer';assert.equal((await request('/api/agent/properties',{bearer:'jwt-a'})).status,200);assert.equal((await request('/api/agent/draft',{bearer:'jwt-a',body:{title:'No',rooms:[]}})).status,403);roleA='owner';
 assert.equal((await request('/api/open?slug=appartement-victor-hugo-demo',{body:{}})).status,404);
});

await test('Email signup, magic link, recovery and onboarding use Supabase and the configured site URL',async()=>{
 assert.equal((await request('/api/auth/signup',{body:{email:'a@example.test',password:'short'}})).status,400);
 assert.equal((await request('/api/auth/signup',{body:{email:'a@example.test',password:'long-valid-password'}})).data.confirmationRequired,true);
 for(const action of ['magic','recover'])assert.equal((await request('/api/auth/'+action,{body:{email:'a@example.test'}})).status,200);
 const otp=calls.find(c=>c.url.pathname==='/auth/v1/otp');assert.equal(otp.url.searchParams.get('redirect_to'),origin+'/auth/callback');assert.equal(otp.body.create_user,false);
 const login=await request('/api/auth/login',{body:{email:'a@example.test',password:'valid-password'}}),cookie=login.cookie.split(';')[0];
 assert.equal((await request('/api/auth/onboard',{cookie,body:{name:'Agence A'}})).status,201);
 assert.equal((await request('/api/agent/workspace',{cookie})).data.workspace.name,'Agence A');
 assert.equal((await request('/api/auth/session',{body:{access_token:'jwt-b',refresh_token:'refresh-a'}})).status,401);
 assert.equal((await request('/api/auth/session',{body:{access_token:'jwt-a',refresh_token:'refresh-a'}})).status,200);
 assert.equal((await request('/api/auth/password',{cookie,body:{password:'replacement-password'}})).status,200);
});

await test('Production fails closed without Supabase and a durable encryption secret',()=>{
 assert.throws(()=>createAuth({env:{NODE_ENV:'production'}}),/Production/);
 assert.throws(()=>createAuth({env:{SUPABASE_URL:'http://supabase.test',SUPABASE_ANON_KEY:'public'}}),/HTTPS/);
 assert.throws(()=>createAuth({env:{AUTH_COOKIE_SECRET:'short'}}),/64/);
 assert.throws(()=>createAuth({env:{SUPABASE_URL:'https://example.test'}}),/ensemble/);
});

await test('Versioned API ingests RoomPlan without exposing raw scan data on open and protects all agency routes',async()=>{
 const {technicalRoomplan}=await import('./scripts/fixtures/roomplan.mjs');
 const source=technicalRoomplan(),created=await request('/api/v1/properties',{bearer:'jwt-a',body:{title:'Scan API',rooms:[{id:'salon',name:'Salon',photos:['https://example.test/photo.jpg']},{id:'chambre',name:'Chambre',photos:[]}]}});
 assert.equal(created.status,201);const slug=created.data.slug;
 assert.equal((await request('/api/v1/properties/'+slug,{bearer:'jwt-b'})).status,404);
 assert.equal((await request('/api/v1/properties/'+slug+'/roomplan',{bearer:'jwt-b',body:{roomplan:source,baseline:null}})).status,404);
 const imported=await request('/api/v1/properties/'+slug+'/roomplan',{bearer:'jwt-a',body:{roomplan:source,baseline:null}});assert.equal(imported.status,201);assert.deepEqual(imported.data.roomplan,source);
 assert.equal((await request('/api/v1/properties/'+slug+'/roomplan',{bearer:'jwt-a',body:{roomplan:source,baseline:null}})).status,409);
 const changed=await request('/api/v1/properties/'+slug,{method:'PATCH',bearer:'jwt-a',body:{patch:{price:300000},baseline:{price:null}}});assert.equal(changed.status,200);assert.equal(changed.data.property.price,300000);
 assert.equal((await request('/api/v1/properties/'+slug,{method:'PATCH',bearer:'jwt-a',body:{patch:{price:400000},baseline:{price:null}}})).status,409);
 assert.equal((await request('/api/v1/properties/'+slug,{method:'PATCH',bearer:'jwt-a',body:{patch:{slug:'stolen'},baseline:{slug}}})).status,400);
 assert.equal((await request('/api/v1/properties/'+slug+'/experience/publish',{bearer:'jwt-a',body:{}})).status,200);
 const opened=await request('/api/open?slug='+slug,{body:{}});assert.equal(opened.data.property.hasRoomplan,true);assert.equal(opened.data.property.roomplan,undefined);assert.equal(opened.data.property.scans,undefined);
 assert.equal((await request('/api/roomplan?slug='+slug)).status,401);
 const cookie=opened.cookie.split(';')[0],asset=(await request('/api/roomplan?slug='+slug,{cookie})).data.roomplan;assert.equal(asset.rooms[0].name,'Salon');assert.equal(asset.rooms[0].geometry.roomIdentifier,'salon');assert.deepEqual(asset.rooms[1].reliableDimensions,source.rooms[1].reliableDimensions);
 const ownProperty=(await request('/api/agent/properties',{bearer:'jwt-a'})).data.find(p=>p.title==='Bien A');
 assert.equal((await request('/api/v1/properties',{bearer:'jwt-b',body:{title:'Borrowed media',rooms:[{id:'room',name:'Pièce',photos:[ownProperty.hero]}]}})).status,400);
 assert.equal((await request('/api/agent/sync-workspace',{bearer:'jwt-a',body:{patch:{name:'Agence A'},baseline:{name:'Agence A'}}})).status,200);
 roleA='viewer';assert.equal((await request('/api/v1/properties/'+slug+'/roomplan',{bearer:'jwt-a'})).status,200);assert.equal((await request('/api/v1/properties/'+slug+'/experience/publish',{bearer:'jwt-a',body:{}})).status,403);roleA='owner';
 const privateChange=await request('/api/v1/properties/'+slug,{method:'PATCH',bearer:'jwt-a',body:{patch:{privacy:'Private'},baseline:{privacy:'Unlisted'}}});assert.equal(privateChange.status,200);
 assert.equal((await request('/api/roomplan?slug='+slug,{cookie})).status,401);
 const identified=await request('/api/open?slug='+slug,{cookie,body:{name:'Camille',email:'camille@example.test'}});assert.equal(identified.status,200);assert.equal((await request('/api/roomplan?slug='+slug,{cookie})).status,200);
});

await test('Les tâches IA vérifient agence et rôle et conservent l’utilisateur à l’origine de la demande',async()=>{
 const before=globalThis.fetch;let finish,calls=0;process.env.AI_ENDPOINT='https://agency-job-fixture.example.test/edit';
 globalThis.fetch=async(url,options)=>{if(url!==process.env.AI_ENDPOINT)return before(url,options);calls++;await new Promise(resolve=>finish=resolve);return new Response(JSON.stringify({image_url:'https://example.test/result.jpg'}),{headers:{'Content-Type':'application/json'}});};
 try{
  const property=(await request('/api/agent/properties',{bearer:'jwt-a'})).data.find(p=>p.title==='Bien A');const slug=property.slug,photo=property.rooms[0].photos[0];
  const payload={slug,room:'salon',photo,action:'Meubler',prompt:'Salon clair',async:true,idempotencyKey:'authenticated-intent-001'};
  roleA='viewer';assert.equal((await request('/api/agent/generate',{bearer:'jwt-a',body:payload})).status,403);roleA='owner';
  const submitted=await request('/api/agent/generate',{bearer:'jwt-a',body:payload});assert.equal(submitted.status,202);
  for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);
  const own=await request('/api/agent/jobs',{bearer:'jwt-a'});assert.equal(own.data.jobs.length,1);
  assert.deepEqual((await request('/api/agent/jobs?id='+submitted.data.job.id,{bearer:'jwt-b'})).data.jobs,[]);
  assert.equal((await request('/api/agent/generate',{bearer:'jwt-b',body:payload})).status,404);
  const stored=JSON.parse(await readFile(path.join(dir,'agencies',agencyA,'store.json'),'utf8'));assert.equal(stored.jobs[0].agencyId,agencyA);assert.equal(stored.jobs[0].userId,userA);assert.equal(stored.jobs[0].status,'processing');
  finish();let completed;
  for(let i=0;i<100;i++){completed=await request('/api/agent/jobs',{bearer:'jwt-a'});if(completed.data.jobs[0].status==='completed')break;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(completed.data.jobs[0].status,'completed');assert.equal(completed.data.jobs[0].creditsCharged,1);assert.equal(calls,1);
 }finally{roleA='owner';globalThis.fetch=before;delete process.env.AI_ENDPOINT;}
});

await test('La connexion mobile partage Supabase sans cookie et refuse une agence hors appartenance',async()=>{
 const login=await request('/api/mobile/login',{source:'null',body:{email:'a@example.test',password:'valid-password'}});assert.equal(login.status,200);assert.equal(login.cookie,null);assert.equal(login.data.access_token,'jwt-a');assert.equal(login.data.refresh_token,'refresh-a');
 const profile=await request('/api/mobile/me',{bearer:login.data.access_token});assert.equal(profile.data.agency,agencyA);
 assert.equal((await request('/api/mobile/me')).status,401);assert.equal((await request('/api/mobile/session',{body:{}})).status,404);
 const invalid=await nativeFetch(origin+'/api/agent/properties',{headers:{Authorization:'Bearer jwt-a','X-PropertyTwin-Agency':agencyB}});assert.equal(invalid.status,403);
 const refresh=await request('/api/mobile/refresh',{source:'null',body:{refresh_token:login.data.refresh_token}});assert.equal(refresh.status,200);assert.equal(refresh.data.access_token,'jwt-a');assert.equal(refresh.cookie,null);
});

globalThis.fetch=nativeFetch;await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});
