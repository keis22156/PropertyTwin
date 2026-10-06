import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import sharp from 'sharp';
import {validGLB} from './glb-data.mjs';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const opaque=()=>randomBytes(24).toString('base64url');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const mediaFormats={
 'image/png':{ext:'png',limit:8000000,test:d=>d.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
 'image/jpeg':{ext:'jpg',limit:8000000,test:d=>d[0]===255&&d[1]===216&&d[2]===255},
 'image/webp':{ext:'webp',limit:8000000,test:d=>d.subarray(0,4).toString()==='RIFF'&&d.subarray(8,12).toString()==='WEBP'},
 'model/gltf-binary':{ext:'glb',limit:50000000,test:validGLB},
 'model/vnd.usdz+zip':{ext:'usdz',limit:50000000,test:d=>d.subarray(0,4).equals(Buffer.from([80,75,3,4]))}
};
export function validateMedia(data,type){
 const format=mediaFormats[type];if(!format||!Buffer.isBuffer(data)||data.length<12||data.length>format.limit||!format.test(data))fail(400,'Fichier invalide ou trop volumineux (8 Mo par photo, 50 Mo par modèle).');return format;
}
export function createMediaStorage({env=process.env,fetcher=(...args)=>fetch(...args),clock=()=>Date.now()}={}){
 const enabled=env.MEDIA_STORAGE==='supabase';
 if(env.MEDIA_STORAGE&&!['disk','supabase'].includes(env.MEDIA_STORAGE))throw Error('MEDIA_STORAGE doit être disk ou supabase.');
 let base;
 if(enabled){
  if(!env.DATABASE_URL||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Supabase Storage nécessite DATABASE_URL, SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sur le serveur.');
  base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Origine Supabase invalide.');
 }
 const bucket='propertytwin-media';
 const objectKey=(store,name)=>{if(!uuid.test(store.id))fail(400,'Agence invalide.');return store.id+'/'+name;};
 const headers=()=>({apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY});
 const resource=route=>new URL('/storage/v1/'+route,base).href;
 async function response(route,options={}){
  const res=await fetcher(resource(route),{...options,headers:{...headers(),...options.headers},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!res.ok)fail(res.status===404?404:503,res.status===404?'Média introuvable.':'Le stockage est indisponible. Réessayez.');return res;
 }
 async function json(route,value){return (await response(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})).json();}
 function signed(value,route){
  if(typeof value!=='string')fail(502,'Réponse de stockage invalide.');
  const url=value.startsWith('/object/')?new URL(resource(value.slice(1))):new URL(value,resource(''));
  if(url.origin!==base.origin||url.username||url.password||url.pathname!=='/storage/v1/'+route||!url.searchParams.get('token'))fail(502,'Réponse de stockage invalide.');return url.href;
 }
 async function bytes(key,limit){
  const res=await response('object/'+bucket+'/'+key);let length=0;const chunks=[];
  if(Number(res.headers.get('content-length'))>limit){await res.body?.cancel();fail(400,'Fichier trop volumineux.');}
  for await(const chunk of res.body){length+=chunk.length;if(length>limit)fail(400,'Fichier trop volumineux.');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
 }
 function owned(store,url){if(!/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/.test(url)||!store.files.has(url))fail(404,'Média introuvable.');return store.db.assets?.[url];}
 async function write(store,data,type){
  const format=validateMedia(data,type),name=opaque()+'.'+format.ext,url='/media/'+name;
  store.db.assets||={};
  if(enabled){const key=objectKey(store,name);await response('object/'+bucket+'/'+key,{method:'POST',headers:{'Content-Type':type,'x-upsert':'false'},body:data});store.db.assets[url]={backend:'supabase',key,type,size:data.length};}
  else await writeFile(path.join(store.dir,'media',name),data,{flag:'wx'});
  store.files.add(url);return url;
 }
 function assetKey(store,asset){const name=asset.key?.slice(store.id.length+1);if(!asset.key?.startsWith(store.id+'/')||!/^([A-Za-z0-9_-]{32})\.(png|jpg|webp|glb|usdz)$/.test(name))fail(404,'Média introuvable.');return asset.key;}
 async function read(store,url){const asset=owned(store,url);if(asset?.backend==='supabase'){if(!enabled)fail(503,'Activez Supabase Storage pour lire ce média.');return bytes(assetKey(store,asset),mediaFormats[asset.type]?.limit||50000000);}return readFile(path.join(store.dir,url));}
 async function downloadURL(store,url){const asset=owned(store,url);if(asset?.backend!=='supabase')return null;if(!enabled)fail(503,'Activez Supabase Storage pour lire ce média.');const route='object/sign/'+bucket+'/'+assetKey(store,asset);const data=await json(route,{expiresIn:60});return signed(data.signedURL,route);}
 async function verify(){if(!enabled)return;const info=await (await response('bucket/'+bucket)).json();if(info.public!==false||Number(info.file_size_limit)>50000000||!Number(info.file_size_limit))throw Error('Le bucket propertytwin-media doit être privé et limité à 50 Mo.');}
 async function begin(store,principal,slug,input){
  if(!enabled)fail(503,'Les imports signés ne sont pas activés.');
  const format=mediaFormats[input.type];if(!format||!Number.isInteger(input.size)||input.size<12||input.size>format.limit)fail(400,'Type ou taille de fichier invalide.');
  if(typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey))fail(400,'Clé d’import invalide.');
  store.db.uploads||={};const all=Object.values(store.db.uploads);
  const existing=all.find(u=>u.principal===principal&&u.slug===slug&&u.idempotencyKey===input.idempotencyKey);
  if(existing){if(existing.type!==input.type||existing.size!==input.size)fail(409,'Cette clé correspond à un autre fichier.');if(existing.status==='completed')return {uploadId:existing.id,status:'completed',result:existing.result};if(existing.expiresAt<=clock())fail(410,'Cet import a expiré. Recommencez avec une nouvelle clé.');return descriptor(existing);}
  const active=all.filter(u=>['pending','processing'].includes(u.status)&&u.expiresAt>clock());if(active.length>=20||active.filter(u=>u.principal===principal).length>=5)fail(429,'Trop d’imports en attente. Terminez vos imports avant de recommencer.');
  const id=opaque(),key=objectKey(store,opaque()+'.'+format.ext),u={id,key,type:input.type,size:input.size,slug,principal,idempotencyKey:input.idempotencyKey,status:'pending',expiresAt:clock()+7200000};
  const output=await descriptor(u);store.db.uploads[id]=u;return output;
 }
 async function descriptor(u){u.lastSignedAt=clock();const route='object/upload/sign/'+bucket+'/'+u.key,data=await json(route,{});return {uploadId:u.id,status:'pending',uploadURL:signed(data.url,route),method:'PUT',headers:{'Content-Type':u.type},expiresAt:new Date(u.expiresAt).toISOString()};}
 function lookup(store,principal,slug,id){const u=store.db.uploads?.[id];if(!u||u.principal!==principal||u.slug!==slug)fail(404,'Import introuvable.');if(u.status!=='completed'&&u.expiresAt<=clock())fail(410,'Cet import a expiré.');return u;}
 // Validation happens outside the agency transaction. The unregistered staged
 // object is never exposed, and its original upload path is never a media URL.
 async function validateUpload(upload){
  const data=await bytes(upload.key,mediaFormats[upload.type].limit);if(data.length!==upload.size)fail(400,'La taille du fichier reçu ne correspond pas à l’import.');validateMedia(data,upload.type);
  if(upload.type.startsWith('image/'))try{await sharp(data,{limitInputPixels:40000000}).autoOrient().webp().toBuffer();}catch{fail(400,'Image illisible ou trop grande.');}
  return {data,checksum:createHash('sha256').update(data).digest('hex')};
 }
 async function removeStaged(upload){if(!/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/i.test(upload.key))fail(400,'Clé temporaire invalide.');if(enabled)await response('object/'+bucket,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[upload.key]})});}
 return {enabled,write,read,downloadURL,verify,begin,lookup,validateUpload,removeStaged};
}
