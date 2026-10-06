import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createMediaStorage} from './media-storage.mjs';
import {imageEditingProvider} from './image-provider.mjs';
const agency='11111111-1111-4111-8111-111111111111',env={MEDIA_STORAGE:'supabase',DATABASE_URL:'postgresql://technical-unused',SUPABASE_URL:'https://storage-fixture.example.test',SUPABASE_SERVICE_ROLE_KEY:'technical-backend-secret'};
const file=await sharp({create:{width:24,height:16,channels:3,background:'#b7c4ce'}}).png().toBuffer();
const state=()=>({id:agency,dir:'/unused',files:new Set(),db:{assets:{},uploads:{}}});
function fixture(){
 const objects=new Map(),calls=[];let publicBucket=false,foreign=false;
 const fetcher=async(url,options)=>{
  calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);assert.equal(options.redirect,'error');
  const route=new URL(url).pathname.replace('/storage/v1/',''),json=value=>new Response(JSON.stringify(value));
  if(route==='bucket/propertytwin-media')return json({public:publicBucket,file_size_limit:50000000});
  if(route.startsWith('object/upload/sign/'))return json({url:foreign?'https://attacker.example.test/upload?token=secret':'/object/upload/sign/'+route.slice('object/upload/sign/'.length)+'?token=technical-upload-token'});
  if(route.startsWith('object/sign/'))return json({signedURL:'/object/sign/'+route.slice('object/sign/'.length)+'?token=technical-read-token'});
  const key=route.slice('object/propertytwin-media/'.length);
  if(options.method==='POST'&&route.startsWith('object/propertytwin-media/')){assert.equal(options.headers['x-upsert'],'false');objects.set(key,Buffer.from(options.body));return json({Key:key});}
  if(options.method==='DELETE'){for(const key of JSON.parse(options.body).prefixes)objects.delete(key);return json({});}
  return objects.has(key)?new Response(objects.get(key)):new Response('{}',{status:404});
 };
 return {objects,calls,fetcher,public:()=>publicBucket=true,foreign:()=>foreign=true};
}
await test('Disk media preserve originals and deny unregistered paths',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-media-disk-'));await mkdir(path.join(directory,'media'));
 const store={...state(),dir:directory},storage=createMediaStorage({env:{}});
 try{const url=await storage.write(store,file,'image/png');assert.deepEqual(await storage.read(store,url),file);assert.deepEqual(await readFile(path.join(directory,url)),file);assert.equal(await storage.downloadURL(store,url),null);await assert.rejects(storage.read(store,'/media/'+'x'.repeat(32)+'.png'),{status:404});await assert.rejects(storage.read(store,'/media/../../secret'),{status:404});}finally{await rm(directory,{recursive:true,force:true});}
});
await test('Private Storage uses backend credentials and renewable scoped read links across instances',async()=>{
 const f=fixture(),store=state(),first=createMediaStorage({env,fetcher:f.fetcher});await first.verify();
 const url=await first.write(store,file,'image/png');assert.equal(store.db.assets[url].key,agency+'/'+url.split('/').at(-1));
 const second=createMediaStorage({env,fetcher:f.fetcher});assert.deepEqual(await second.read(store,url),file);assert.match(await second.downloadURL(store,url),/object\/sign\/propertytwin-media\/.+\?token=technical-read-token/);
 assert.equal(JSON.parse(f.calls.at(-1).options.body).expiresIn,60);assert.ok(!JSON.stringify(store.db).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 store.db.assets[url].key='22222222-2222-4222-8222-222222222222/'+url.split('/').at(-1);await assert.rejects(second.read(store,url),{status:404});
 f.public();await assert.rejects(first.verify(),/privé/);assert.throws(()=>createMediaStorage({env:{MEDIA_STORAGE:'supabase'}}),/nécessite/);
});
await test('Signed uploads are scoped, replayable, bounded and never register an unvalidated file',async()=>{
 let time=Date.now();const f=fixture(),storage=createMediaStorage({env,fetcher:f.fetcher,clock:()=>time}),store=state();
 const input={type:'image/png',size:file.length,idempotencyKey:'signed-upload-intent-01'};
 const descriptor=await storage.begin(store,'agent-one','property',input);assert.equal(descriptor.method,'PUT');assert.equal(store.files.size,0);assert.equal(Object.keys(store.db.assets).length,0);assert.ok(!JSON.stringify(descriptor).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 assert.equal((await storage.begin(store,'agent-one','property',input)).uploadId,descriptor.uploadId);
 await assert.rejects(storage.begin(store,'agent-one','property',{...input,size:file.length+1}),{status:409});
 assert.throws(()=>storage.lookup(store,'agent-two','property',descriptor.uploadId),{status:404});assert.throws(()=>storage.lookup(store,'agent-one','foreign-property',descriptor.uploadId),{status:404});
 const upload=storage.lookup(store,'agent-one','property',descriptor.uploadId);f.objects.set(upload.key,file);assert.deepEqual((await storage.validateUpload(upload)).data,file);assert.equal(store.files.size,0);
 f.objects.set(upload.key,Buffer.alloc(file.length));await assert.rejects(storage.validateUpload(upload),{status:400});f.objects.set(upload.key,Buffer.alloc(file.length+1));await assert.rejects(storage.validateUpload(upload),{status:400});
 for(let i=1;i<5;i++)await storage.begin(store,'agent-one','property',{...input,idempotencyKey:'pending-upload-intent-'+i});
 await assert.rejects(storage.begin(store,'agent-one','property',{...input,idempotencyKey:'pending-upload-intent-six'}),{status:429});
 time+=7200001;assert.throws(()=>storage.lookup(store,'agent-one','property',descriptor.uploadId),{status:410});
 await assert.rejects(storage.begin(store,'agent-one','property',{...input,type:'text/html'}),{status:400});await assert.rejects(storage.begin(store,'agent-one','property',{...input,size:8000001}),{status:400});
});
await test('Storage never follows a signing response to a foreign origin',async()=>{
 const f=fixture();f.foreign();const storage=createMediaStorage({env,fetcher:f.fetcher});await assert.rejects(storage.begin(state(),'agent','property',{type:'image/png',size:file.length,idempotencyKey:'foreign-origin-intent-01'}),{status:502});
});
await test('Image provider reads Storage originals through its abstraction without a shared disk',async()=>{
 const f=fixture(),storage=createMediaStorage({env,fetcher:f.fetcher}),store=state(),url=await storage.write(store,file,'image/png');
 const previous=globalThis.fetch;let sent;
 globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({image_url:'https://example.test/result.jpg'}));};
 try{const provider=imageEditingProvider({AI_ENDPOINT:'https://provider.example.test'}, {readMedia:(url,context)=>{assert.equal(context.agencyId,agency);return storage.read({...store,db:{assets:context.assets}},url);}});await provider.edit({photo:url,action:'Meubler',prompt:'Salon'}, {directory:'/no-disk',agencyId:agency,assets:store.db.assets,jobId:'technical-job'});assert.equal(sent.image_base64,file.toString('base64'));assert.equal(sent.image_url,undefined);}finally{globalThis.fetch=previous;}
});
