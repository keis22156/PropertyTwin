import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdir,readFile,writeFile,rename,readdir,access} from 'node:fs/promises';
import path from 'node:path';

const agencyID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function createStores(root){
 if(process.env.DATABASE_URL){const {createPostgresStores}=await import('./postgres-store.mjs');return createPostgresStores(root);}
 const context=new AsyncLocalStorage(),stores=new Map(),loading=new Map();
 async function load(id){
  if(id!=='local'&&!agencyID.test(id))throw Object.assign(Error('Agence invalide.'),{status:400});
  if(stores.has(id))return stores.get(id);
  if(loading.has(id))return loading.get(id);
  const task=(async()=>{
   const dir=id==='local'?root:path.join(root,'agencies',id);
   await mkdir(path.join(dir,'media'),{recursive:true});
   let db;
   try{db=JSON.parse(await readFile(path.join(dir,'store.json'),'utf8'));}
   catch(error){if(error.code!=='ENOENT')throw error;db={properties:[],sessions:[],links:[],leads:[],variants:[]};}
   db.jobs||=[];db.records||=[];db.workspace||={};db.media||={};db.assets||={};db.uploads||={};
   const files=new Set((await readdir(path.join(dir,'media'))).map(name=>'/media/'+name));
   const store={id,dir,db,files,pending:Promise.resolve()};stores.set(id,store);return store;
  })();loading.set(id,task);
  try{return await task;}finally{loading.delete(id);}
 }
 const local=await load('local');
 let entries=[];try{entries=await readdir(path.join(root,'agencies'),{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const entry of entries)if(entry.isDirectory()&&agencyID.test(entry.name))await load(entry.name);
 const current=()=>context.getStore()?.store||local;
 const state=new Proxy({}, {get:(_,key)=>current().db[key],set:(_,key,value)=>{current().db[key]=value;return true;}});
 async function save(){
  const store=current(),snapshot=JSON.stringify(store.db);
  store.pending=store.pending.catch(()=>{}).then(async()=>{
   await writeFile(path.join(store.dir,'store.tmp'),snapshot);await rename(path.join(store.dir,'store.tmp'),path.join(store.dir,'store.json'));
  });return store.pending;
 }
 async function publicStore(url){
  const parts=url.pathname.split('/');
  const slug=url.searchParams.get('slug')||(['p','v'].includes(parts[1])?parts[2]:null);
  const shared=url.pathname==='/api/shared'?url.searchParams.get('token'):parts[1]==='share'?parts[2]:null;
  for(const store of stores.values()){
   if(slug&&store.db.properties.some(p=>p.slug===slug))return store;
   if(shared&&store.db.variants.some(v=>v.shareToken===shared))return store;
   if(/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/.test(url.pathname)){
    if(store.files.has(url.pathname))return store;
    try{await access(path.join(store.dir,url.pathname));return store;}catch(error){if(error.code!=='ENOENT')throw error;}
   }
  }return local;
 }
 return {local,load,current,state,save,publicStore,all:()=>[...stores.values()],identity:()=>context.getStore()?.identity,run:(store,identity,operation)=>context.run({store,identity},operation)};
}
