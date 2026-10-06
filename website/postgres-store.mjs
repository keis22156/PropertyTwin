import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdir,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const collections={sessions:'private.buyer_sessions',links:'private.smart_links',leads:'public.leads',variants:'public.variants',records:'public.business_records',jobs:'private.ai_jobs'};
const empty=()=>({properties:[],sessions:[],links:[],leads:[],variants:[],records:[],jobs:[],workspace:{},media:{},assets:{},uploads:{}});
const error=(status,message)=>Object.assign(Error(message),{status});

export async function databasePool(env=process.env){
 const connection=env.DATABASE_URL;if(!connection)throw Error('DATABASE_URL manquant.');
 let url;try{url=new URL(connection);}catch{throw Error('DATABASE_URL invalide.');}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL doit utiliser PostgreSQL.');
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 // Never allow URL options to silently replace TLS certificate verification.
 if(url.search)throw Error('Retirez les options SSL de DATABASE_URL ; utilisez DATABASE_CA_FILE.');
 const ssl=local?false:{rejectUnauthorized:true,...(env.DATABASE_CA_FILE?{ca:await readFile(env.DATABASE_CA_FILE,'utf8')}:{})};
 const pool=new pg.Pool({connectionString:connection,ssl,max:8,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
 pool.on('error',()=>console.error('PostgreSQL connection unavailable.'));return pool;
}

export async function createPostgresStores(root,{pool,sharedWorkspace=process.env.SHARED_WORKSPACE_ID}={}){
 if(sharedWorkspace&&!uuid.test(sharedWorkspace))throw Error("SHARED_WORKSPACE_ID invalide.");
 pool||=await databasePool();
 const context=new AsyncLocalStorage(),cache=new Map();
 const local={id:'local',dir:root,db:empty(),files:new Set(),pending:Promise.resolve()};
 await mkdir(path.join(root,'media'),{recursive:true});
 async function load(id){
  if(id==='local'){if(sharedWorkspace)return load(sharedWorkspace);return local;}if(!uuid.test(id))throw error(400,'Agence invalide.');
  if(cache.has(id))return cache.get(id);
  const dir=id===sharedWorkspace?root:path.join(root,'agencies',id);await mkdir(path.join(dir,'media'),{recursive:true});
  const store={id,dir,db:empty(),files:new Set(),pending:Promise.resolve()};cache.set(id,store);return store;
 }
 async function read(client,id){
  const result=await client.query('select workspace,media,uploads from private.workspaces where agency_id=$1',[id]);
  const db=empty();if(result.rows[0])Object.assign(db,result.rows[0]);
  db.properties=(await client.query('select slug,data from public.properties where agency_id=$1 order by position,slug',[id])).rows.map(row=>({...row.data,slug:row.slug,rooms:[]}));
  const rooms=(await client.query('select slug,data from public.property_rooms where agency_id=$1 order by slug,(data->>\'position\')::integer',[id])).rows;
  for(const row of rooms){const {position,...room}=row.data;db.properties.find(p=>p.slug===row.slug)?.rooms.push(room);}
  for(const row of (await client.query('select slug,data from public.roomplan_assets where agency_id=$1',[id])).rows){const p=db.properties.find(p=>p.slug===row.slug);if(p)p.roomplan=row.data;}
  for(const [key,table] of Object.entries(collections))db[key]=(await client.query(`select data from ${table} where agency_id=$1 order by position,id`,[id])).rows.map(row=>row.data);
  const registered=(await client.query('select url,metadata from private.media_files where agency_id=$1',[id])).rows;
  const files=new Set(registered.map(row=>row.url));for(const row of registered)db.assets[row.url]=row.metadata;
  return {db,files};
 }
 async function persist(client,store){
  const {db,id,files}=store;
  await client.query('update private.workspaces set workspace=$2,media=$3,uploads=$4,updated_at=now() where agency_id=$1',[id,db.workspace,db.media,db.uploads]);
  // The agency lock serializes replacement of every collection. Child rows are
  // removed first to keep cross-agency foreign keys intact throughout the commit.
  for(const table of [...Object.values(collections),'public.roomplan_assets','public.property_rooms'])await client.query(`delete from ${table} where agency_id=$1`,[id]);
  await client.query('delete from public.properties where agency_id=$1',[id]);
  for(const [position,p] of db.properties.entries()){
   const {rooms,roomplan,slug,...data}=p;
   await client.query('insert into public.properties(agency_id,slug,data,position) values($1,$2,$3,$4)',[id,slug,data,position]);
   for(const [position,room] of (rooms||[]).entries())await client.query('insert into public.property_rooms(agency_id,slug,id,data) values($1,$2,$3,$4)',[id,slug,room.id,{...room,position}]);
   if(roomplan)await client.query('insert into public.roomplan_assets(agency_id,slug,data) values($1,$2,$3)',[id,slug,roomplan]);
  }
  for(const [key,table] of Object.entries(collections))for(const [position,record] of db[key].entries())await client.query(`insert into ${table}(agency_id,id,slug,data,position) values($1,$2,$3,$4,$5)`,[id,key==='links'?record.token:record.id,record.slug,record,position]);
  await client.query('delete from private.media_files where agency_id=$1',[id]);
  for(const file of files)await client.query('insert into private.media_files(agency_id,url,metadata) values($1,$2,$3)',[id,file,db.assets[file]||{}]);
 }
 const current=()=>context.getStore()?.store||cache.get(sharedWorkspace)||local;
 const state=new Proxy({}, {get:(_,key)=>current().db[key],set:(_,key,value)=>{current().db[key]=value;return true;}});
 async function save(){const ctx=context.getStore();if(!ctx?.client||!ctx.active)throw Error('Écriture PostgreSQL hors transaction.');ctx.dirty=true;}
 async function run(base,identity,operation){
  if(base.id==='local')return context.run({store:local,identity},operation);
  // A scheduled worker may inherit the request's AsyncLocalStorage before COMMIT.
  // Every run owns a separate transaction; no inherited connection is reused.
  const client=await pool.connect();
  let ctx;
  try{
   await client.query('begin');await client.query("set local lock_timeout='10s'; set local statement_timeout='30s'; set local idle_in_transaction_session_timeout='60s'");
   await client.query('insert into private.workspaces(agency_id) values($1) on conflict do nothing',[base.id]);
   await client.query('select agency_id from private.workspaces where agency_id=$1 for update',[base.id]);
   const fresh=await read(client,base.id),store={...base,...fresh},initialFiles=new Set(store.files);
   ctx={store,identity,client,dirty:false,active:true};
   const value=await context.run(ctx,operation);
   const filesChanged=store.files.size!==initialFiles.size||[...store.files].some(file=>!initialFiles.has(file));
   if(ctx.dirty||filesChanged)await persist(client,store);
   await client.query('commit');base.db=store.db;base.files=store.files;return value;
  }catch(cause){await client.query('rollback').catch(()=>{});if(cause.code==='55P03'||cause.code==='57014')throw error(503,'L’agence est occupée. Réessayez dans quelques instants.');throw cause;}
  finally{if(ctx)ctx.active=false;client.release();}
 }
 async function refreshAll(){
  const ids=(await pool.query('select agency_id from private.workspaces')).rows;
  for(const {agency_id:id} of ids){const store=await load(id);const fresh=await read(pool,id);store.db=fresh.db;store.files=fresh.files;}
 }
 async function publicStore(url){
  const parts=url.pathname.split('/'),slug=url.searchParams.get('slug')||(['p','v'].includes(parts[1])?parts[2]:null);
  const shared=url.pathname==='/api/shared'?url.searchParams.get('token'):parts[1]==='share'?parts[2]:null;
  let rows=[];
  if(slug)rows=(await pool.query('select agency_id from public.properties where slug=$1',[slug])).rows;
  else if(shared)rows=(await pool.query("select agency_id from public.variants where data->>'shareToken'=$1",[shared])).rows;
  else if(/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/.test(url.pathname))rows=(await pool.query('select agency_id from private.media_files where url=$1',[url.pathname])).rows;
  return rows[0]?load(rows[0].agency_id):local;
 }
 await refreshAll();
 const shared=sharedWorkspace?await load(sharedWorkspace):local;
 if(sharedWorkspace&&!(await pool.query('select id from public.agencies where id=$1',[sharedWorkspace])).rowCount)throw Error('L’espace commun PostgreSQL n’existe pas. Lancez npm run dev:shared.');
 return {kind:'postgres',local:shared,load,current,state,save,run,publicStore,refreshAll,all:()=>[...cache.values()],identity:()=>context.getStore()?.identity,close:()=>pool.end(),pool,
  async importFiles(store){for(const file of await readdir(path.join(store.dir,'media')))store.files.add('/media/'+file);}};
}
