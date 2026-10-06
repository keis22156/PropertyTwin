import {roomplanForProperty,publicRoomplan,validateRoomplan} from './roomplan-data.mjs';
import http from 'node:http';
import {createLocalConnection} from './local-connection.mjs';
import {createStores} from './data-store.mjs';
import {createAuth} from './auth.mjs';
import {isDeepStrictEqual} from 'node:util';
import QRCode from 'qrcode';
import {renderRetouchInWorker} from './photo-retouch-worker.mjs';
import {validateSettings} from './public/retouch-engine.mjs';
import {imageRenditions} from './image-renditions.mjs';
import {createMediaStorage,validateMedia,mediaFormats} from './media-storage.mjs';
import {imageEditingProvider} from './image-provider.mjs';
import {createRoutingStore} from './ai-routing.mjs';
import {createAIJobs,buyerAllowance} from './ai-jobs.mjs';
import {validateProperty as validateInput,mediaURL} from './property-data.mjs';
import {validateWorkspacePatch,workspaceBranding} from './workspace-data.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const main=process.argv[1]===fileURLToPath(import.meta.url);
if(main){try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}}
const dir=process.env.DATA_DIR||path.join(root,'data');
if(process.env.SHARED_WORKSPACE_ID&&(process.env.NODE_ENV==='production'||process.env.SUPABASE_URL||process.env.SUPABASE_ANON_KEY||!process.env.ADMIN_TOKEN))throw Error('L’espace sans compte nécessite une clé ADMIN_TOKEN et un serveur de développement sans Supabase.');
if(process.env.DATABASE_URL&&!process.env.SHARED_WORKSPACE_ID&&(!process.env.SUPABASE_URL||!process.env.SUPABASE_ANON_KEY))throw Error('PostgreSQL nécessite l’authentification Supabase.');
const storage=createMediaStorage();await storage.verify();
const stores=await createStores(dir),db=stores.state;
const save=stores.save;let activeRetouches=0;
const localConnection=createLocalConnection();
const token=()=>randomBytes(24).toString('base64url');
const inheritBranding=p=>p.brandingMode==='workspace'?{...p,...workspaceBranding(db.workspace)}:p;
const auth=createAuth({onboard:async(id,workspace)=>stores.run(await stores.load(id),null,async()=>{if(!Object.keys(db.workspace).length){db.workspace=workspace;await save();}})});
// Recover interrupted generations independently in every agency.
for(const store of stores.all())await stores.run(store,null,async()=>{
 let recovered=false;
 for(const lead of db.leads)if(!lead.id){lead.id=token();lead.stage='new';lead.notes=[];recovered=true;}
 for(const session of db.sessions)if(session.generating&&!db.jobs.some(j=>j.sessionId===session.id&&['queued','processing'].includes(j.status))){const p=db.properties.find(p=>p.slug===session.slug);if(p)p.credits++;session.generating=false;recovered=true;}
 if(recovered)await save();
});
const routing=createRoutingStore({directory:dir,pool:stores.pool});
const provider=imageEditingProvider(process.env,{routing,readMedia:(url,context)=>storage.read({id:context.agencyId,dir:context.directory,files:new Set([url]),db:{assets:context.assets}},url)});
const jobs=createAIJobs({stores,provider});
await jobs.recover();
const demoEnabled=process.env.ENABLE_DEMO==='1'&&process.env.NODE_ENV!=='production';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function checkOwnedMedia(value){
 if(typeof value==='string'&&value.startsWith('/media/')&&!stores.current().files.has(value))fail(400,'Ce média n’appartient pas à votre agence.');
 if(Array.isArray(value))for(const item of value)checkOwnedMedia(item);
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key.startsWith('/media/'))checkOwnedMedia(key);checkOwnedMedia(item);}
}
function validateProperty(input,options){const result=validateInput(input,options);checkOwnedMedia(result);return result;}
const photo='https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85';
const demo={slug:'appartement-victor-hugo-demo',title:'Appartement Victor Hugo',location:'Paris 16e · Quartier Victor Hugo',price:895000,surface:72,roomsCount:3,bedrooms:2,description:'La lumière traverse le salon, les matières invitent au calme. Retrouvez les détails de votre visite et prenez le temps d’imaginer votre quotidien ici.',features:['4e étage','Ascenseur','Balcon'],agency:{name:'Maison Dupont',color:'#536554'},agent:{name:'Sophie Martin',firstName:'Sophie'},rooms:[{id:'salon',name:'Salon',photos:[photo]},{id:'cuisine',name:'Cuisine',photos:['https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1200&q=80']},{id:'chambre',name:'Chambre principale',photos:['https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80']}],hero:photo,status:'Unlisted',privacy:'Unlisted',credits:5,demo:true};
function admin(req){if(stores.identity())return;const key=process.env.ADMIN_TOKEN||'';const got=req.headers.authorization?.replace(/^Bearer /,'')||'';if(!key||key.length!==got.length||!timingSafeEqual(Buffer.from(key),Buffer.from(got)))fail(401,'Accès agent non autorisé.');}
function property(slug){const p=demoEnabled&&slug===demo.slug?demo:db.properties.find(p=>p.slug===slug);if(!p||p.deletedAt||['Draft','Archived'].includes(p.status))fail(404,'Ce logement n’est pas disponible.');return p;}
function session(req,p){const id=(req.headers.cookie||'').split('; ').find(c=>c.startsWith('pt_session_'+p.slug+'='))?.split('=')[1];if(typeof id!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(id))fail(401,'Ouvrez à nouveau le logement.');const s=db.sessions.find(s=>!s.agent&&s.token===id&&s.slug===p.slug);if(!s)fail(401,'Ouvrez à nouveau le logement.');return s;}
const publicVariant=({sessionId,shareToken,...v})=>v;
const publicProperty=p=>{const {credits,id,internalId,syncKey,scans,roomplan,deletedAt,...rest}=p;
const urls=[p.hero,p.agency?.logo,p.agent?.photo,p.floorplan?.image,...p.rooms.flatMap(room=>room.photos)];
const media={...(p.media||{})};for(const url of urls)if(db.media[url])media[url]=db.media[url];
return {...rest,...(roomplanForProperty(p)?{hasRoomplan:true}:{}),...(Object.keys(media).length?{media}:{})};};
async function prepareMedia(base,data,type){
 const target={...base,db:{assets:{}},files:new Set()};
 let renditions;if(type.startsWith('image/'))try{renditions=await imageRenditions(data);}catch{fail(400,'Image illisible ou trop grande. Choisissez une autre photo.');}
 const url=await storage.write(target,data,type);let media;
 if(renditions){const sources=[];for(const rendition of renditions)sources.push({url:await storage.write(target,rendition.data,'image/webp'),width:rendition.width});media={thumbnail:sources[0].url,sources};}
 return {url,media,assets:target.db.assets,files:target.files};
}
function registerMedia(prepared){for(const file of prepared.files)stores.current().files.add(file);Object.assign(db.assets,prepared.assets);if(prepared.media)db.media[prepared.url]=prepared.media;return {url:prepared.url,...(prepared.media?{media:prepared.media}:{})};}
async function storeImage(data,ext){const types={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};const result=registerMedia(await prepareMedia(stores.current(),data,types[ext]));await save();return result;}
function replacePropertyFields(p,updated){for(const field of Object.keys(validateProperty(p,{draft:true})))if(!(field in updated))delete p[field];Object.assign(p,updated);}
async function body(req,limit=75_000_000){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)fail(413,'Fichier trop volumineux.');chunks.push(chunk);}let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{fail(400,'Données invalides.');}if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'Indiquez un objet JSON valide.');return result;}
const events=new Set('mini_site_open property_return_visit gallery_open photo_view room_view floorplan_open 3d_open ai_studio_open ai_generation variant_saved contact_clicked visit_requested interest_submitted session_duration'.split(' '));
async function generateVariant(p,s,b){
 const job=await jobs.submit(p,s,b);
 if(b.async)return {job:jobs.expose(job)};
 if(stores.kind==='postgres')return {deferred:job};
 await jobs.wait(job);if(job.status==='failed')fail(502,job.error);
 return db.variants.find(v=>v.id===job.variantId);
}
async function handle(req,res){let url=new URL(req.url,'http://localhost');const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
if(url.pathname.startsWith('/api/v1/')){
 const match=url.pathname.match(/^\/api\/v1\/properties(?:\/([A-Za-z0-9_-]+)(?:\/(roomplan|floorplan|experience\/publish|media\/upload-url|media\/complete))?)?$/);
 if(!match)fail(404,'Route inconnue.');
 const [,slug,action]=match;
 if(!slug&&req.method==='GET')url.pathname='/api/agent/properties';
 else if(!slug&&req.method==='POST')url.pathname='/api/agent/draft';
 else {
  const p=db.properties.find(p=>p.slug===slug&&!p.deletedAt);if(!p)fail(404,'Bien introuvable.');
  if(!action&&req.method==='GET')return send({property:p});
  if(['media/upload-url','media/complete'].includes(action)&&req.method==='POST'){url.pathname=action==='media/upload-url'?'/api/agent/upload-url':'/api/agent/upload-complete';url.searchParams.set('slug',slug);}
  else if(action==='roomplan'){url.pathname='/api/agent/roomplan';url.searchParams.set('slug',slug);}
  else if((!action&&req.method==='PATCH')||(action==='floorplan'&&req.method==='POST')){
   const b=await body(req),patch=action?{floorplan:b.floorplan}:b.patch;
   if(!patch||typeof patch!=='object'||Array.isArray(patch)||!b.baseline||typeof b.baseline!=='object')fail(400,'Indiquez le patch et son état précédent.');
   const allowed=new Set('title location description information privacy indexable rooms hero features credits price surface roomsCount bedrooms bathrooms floor totalFloors landArea charges propertyTax constructionYear dpe listingType transaction condition heating orientation address city postalCode reference brandingMode agency agent scans floorplan model3d roomplan media videoURL tourURL documents'.split(' '));
   const candidate={...p};
   for(const [field,value] of Object.entries(patch)){
    if(!allowed.has(field)||!Object.hasOwn(b.baseline,field))fail(400,'Champ ou référence invalide : '+field);
    if(value===null)delete candidate[field];else candidate[field]=value;
   }
   const result=inheritBranding(validateProperty(candidate,{draft:['Draft','Archived'].includes(p.status)}));
   for(const field of Object.keys(patch))if(!isDeepStrictEqual(p[field]??null,b.baseline[field]??null)&&!isDeepStrictEqual(p[field]??null,result[field]??null))throw Object.assign(Error('Modification simultanée : '+field),{status:409,field});
   if(db.sessions.some(s=>s.slug===slug&&s.generating))fail(409,'Une transformation est en cours.');
   replacePropertyFields(p,result);await save();return send({property:p});
  }else if(action==='experience/publish'&&req.method==='POST'){
   validateProperty(p);p.status=p.privacy==='Public'?'Published':'Unlisted';await save();return send({property:p,url:'/p/'+p.slug});
  }else fail(405,'Méthode non autorisée.');
 }
}
if(/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/.test(url.pathname)){const types={png:'image/png',jpg:'image/jpeg',webp:'image/webp',glb:'model/gltf-binary',usdz:'model/vnd.usdz+zip'};const signed=await storage.downloadURL(stores.current(),url.pathname);if(signed){res.writeHead(302,{'Location':signed,'Cache-Control':'no-store'});res.end();return;}try{const data=await storage.read(stores.current(),url.pathname);res.setHeader('Content-Type',types[url.pathname.split('.').at(-1)]);res.setHeader('Cache-Control','private, max-age=3600');res.end(data);return;}catch(e){if(e.code==='ENOENT')fail(404,'Média introuvable.');throw e;}}
const vendor={'/vendor/three.module.js':'build/three.module.js','/vendor/three.core.js':'build/three.core.js','/vendor/OrbitControls.js':'examples/jsm/controls/OrbitControls.js'};if(vendor[url.pathname]){res.setHeader('Content-Type','text/javascript');let source=await readFile(path.join(root,'node_modules/three',vendor[url.pathname]),'utf8');if(url.pathname==='/vendor/OrbitControls.js')source=source.replace("from 'three'","from '/vendor/three.module.js'");res.end(source);return;}
if(url.pathname==='/vendor/model-viewer.min.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(root,'node_modules/@google/model-viewer/dist/model-viewer.min.js')));return;}
if(url.pathname.startsWith('/api/agent')){admin(req);
if(url.pathname==='/api/agent/roomplan'){const p=db.properties.find(p=>p.slug===url.searchParams.get('slug'));if(!p||p.deletedAt)fail(404,'Bien introuvable.');if(req.method==='GET')return send({roomplan:publicRoomplan(p)});if(req.method==='POST'){const b=await body(req);if(!isDeepStrictEqual(p.roomplan??null,b.baseline??null))fail(409,'Le RoomPlan a changé. Actualisez le dossier avant de réimporter.');const asset=validateRoomplan(b.roomplan,p.rooms);p.roomplan=asset;await save();return send({roomplan:asset,property:p},201);}fail(405,'Méthode non autorisée.');}
if(url.pathname==='/api/agent/workspace'&&req.method==='GET')return send({workspace:db.workspace});
if(url.pathname==='/api/agent/sync-workspace'&&req.method==='POST'){
 const b=await body(req),patch=validateWorkspacePatch(b.patch||{});checkOwnedMedia(patch);
 for(const [field,value] of Object.entries(patch))if(!isDeepStrictEqual(db.workspace[field]??'',b.baseline?.[field]??'')&&!isDeepStrictEqual(db.workspace[field]??'',value))throw Object.assign(new Error('Les paramètres ont été modifiés simultanément : '+field),{status:409,field:'workspace.'+field});
 Object.assign(db.workspace,patch);
 for(const p of db.properties)if(p.brandingMode==='workspace'&&!p.deletedAt)Object.assign(p,workspaceBranding(db.workspace));
 await save();return send({workspace:db.workspace});
}
if(url.pathname==='/api/agent/connection'&&req.method==='GET')return send({database:stores.kind||'json',shared:Boolean(process.env.SHARED_WORKSPACE_ID),accounts:auth.enabled,workspaceID:process.env.SHARED_WORKSPACE_ID||null});
if(url.pathname==='/api/agent/pair'&&req.method==='POST')return send(localConnection.create(),201);
if(url.pathname==='/api/agent/ai-config'&&req.method==='GET')return send(await provider.capabilities());
if(url.pathname==='/api/agent/media-config'&&req.method==='GET')return send({signedUploads:storage.enabled});
if(['/api/agent/upload-url','/api/agent/upload-complete'].includes(url.pathname)&&req.method==='POST'){
 const b=await body(req,10000),slug=url.searchParams.get('slug')||b.slug,p=db.properties.find(p=>p.slug===slug&&!p.deletedAt);if(!p)fail(404,'Bien introuvable.');
 const principal=stores.identity()?.user?.id||'local-agent';
 if(url.pathname==='/api/agent/upload-url'){const result=await storage.begin(stores.current(),principal,slug,b);await save();return send(result,201);}
 const upload=storage.lookup(stores.current(),principal,slug,b.uploadId);if(upload.status==='completed')return send(upload.result,201);
 if(upload.status==='processing'&&upload.leaseExpires>Date.now())fail(409,'La validation de cet import est en cours. Réessayez dans quelques instants.');
 upload.status='processing';upload.processingToken=token();upload.leaseExpires=Date.now()+180000;await save();
 return {mediaUpload:structuredClone(upload),principal,slug};
}
if(url.pathname==='/api/agent/upload'&&req.method==='POST'){
 const b=await body(req);if(!mediaFormats[b.type]||typeof b.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.base64))fail(400,'Fichier invalide. Choisissez JPEG, PNG, WebP, GLB ou USDZ.');
 const data=Buffer.from(b.base64,'base64'),format=validateMedia(data,b.type);if(b.type.startsWith('image/'))return send(await storeImage(data,format.ext),201);
 const result=registerMedia(await prepareMedia(stores.current(),data,b.type));await save();return send(result,201);
}
if(url.pathname==='/api/agent/photo-edit'&&req.method==='POST'){
 const b=await body(req,10000),p=db.properties.find(p=>p.slug===b.slug),room=p?.rooms.find(r=>r.id===b.room);
 if(p?.deletedAt||!room?.photos.includes(b.photo))fail(400,'Photo inconnue.');
 if(!/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$/.test(b.photo))fail(400,'Importez cette photo dans le dossier pour activer la retouche.');
 return {photoEdit:{slug:p.slug,room:room.id,photo:b.photo,settings:validateSettings(b),source:{...stores.current(),files:new Set(stores.current().files),db:{assets:structuredClone(db.assets)}}}};
}
if(url.pathname==='/api/agent/qr'&&req.method==='POST'){const b=await body(req);if(typeof b.url!=='string'||b.url.length>2000||!/^https?:\/\//.test(b.url))fail(400,'URL invalide.');return send({image:await QRCode.toDataURL(b.url,{errorCorrectionLevel:'M',width:300,margin:4})});}
if(url.pathname==='/api/agent/sync'&&req.method==='POST'){const b=await body(req);if(typeof b.clientKey!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(b.clientKey))fail(400,'Clé de synchronisation invalide.');let p=b.slug?db.properties.find(p=>p.slug===b.slug):db.properties.find(p=>p.syncKey===b.clientKey);if(b.slug&&!p)fail(404,'Bien introuvable.');if(p?.deletedAt)fail(410,'Ce bien est dans la corbeille. Restaurez-le avant de le modifier.');if(p){const patch=b.patch||{},baseline=b.baseline||{};const proposed={...p,...patch};for(const [field,value] of Object.entries(patch))if(value===null)delete proposed[field];const desired=inheritBranding(validateProperty(proposed,{draft:['Draft','Archived'].includes(p.status)}));for(const field of Object.keys(patch)){if(!isDeepStrictEqual(p[field]??null,baseline[field]??null)&&!isDeepStrictEqual(p[field]??null,desired[field]??null))throw Object.assign(new Error('Modification simultanée du champ '+field+'. Choisissez la version à conserver.'),{status:409,field});}if(db.sessions.some(s=>s.slug===p.slug&&s.generating))fail(409,'Une transformation est en cours.');const candidate={...p,...patch};for(const [field,value] of Object.entries(patch))if(value===null)delete candidate[field];const validated=inheritBranding(validateProperty(candidate,{draft:['Draft','Archived'].includes(p.status)}));replacePropertyFields(p,validated);}else{const validated=inheritBranding(validateProperty(b.patch,{draft:true}));p={...validated,syncKey:b.clientKey,slug:'bien-'+token().slice(0,12),status:'Draft'};db.properties.push(p);}await save();return send({property:p,url:'/p/'+p.slug});}
if(url.pathname==='/api/agent/prepare-share'&&req.method==='POST'){const b=await body(req);const p=db.properties.find(p=>p.slug===b.slug);if(!p||p.deletedAt)fail(404,'Bien introuvable.');validateProperty(p);p.status=p.privacy==='Public'?'Published':'Unlisted';await save();return send({slug:p.slug,url:'/p/'+p.slug,property:p});}
if(url.pathname==='/api/agent/sync-feed'&&req.method==='GET')return send({properties:db.properties});
if(url.pathname==='/api/agent/trash'&&req.method==='GET')return send({properties:db.properties.filter(p=>p.deletedAt)});
if(url.pathname==='/api/agent/removal'&&req.method==='POST'){
 const b=await body(req),p=db.properties.find(p=>p.slug===b.slug);
 if(!p)fail(404,'Bien introuvable.');if(typeof b.removed!=='boolean')fail(400,'Action invalide.');
 if(Boolean(p.deletedAt)===b.removed)return send({property:p});
 if(!isDeepStrictEqual(p,b.baseline))throw Object.assign(new Error('Le dossier a changé depuis sa consultation. Actualisez-le avant de modifier sa présence dans la corbeille.'),{status:409,field:'removal'});
 if(db.sessions.some(s=>s.slug===p.slug&&s.generating))fail(409,'Une transformation est en cours.');
 if(b.removed)p.deletedAt=new Date().toISOString();else {delete p.deletedAt;if(p.brandingMode==='workspace')Object.assign(p,workspaceBranding(db.workspace));}
 await save();return send({property:p});
}
if(url.pathname==='/api/agent/properties'&&req.method==='GET')return send(db.properties.filter(p=>!p.deletedAt));
if(['/api/agent/publish','/api/agent/draft'].includes(url.pathname)&&req.method==='POST'){const draft=url.pathname.endsWith('/draft');const b=inheritBranding(validateProperty(await body(req),{draft}));const slug=b.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+token().slice(0,8);const p={...b,slug,status:draft?'Draft':b.privacy==='Public'?'Published':'Unlisted',privacy:b.privacy||'Unlisted',credits:Number.isInteger(b.credits)&&b.credits>=0?b.credits:5,hero:b.hero||b.rooms[0]?.photos[0]||''};db.properties.push(p);await save();return send({slug,url:'/p/'+slug},201);}
if(url.pathname==='/api/agent/update'&&req.method==='POST'){
 const b=await body(req),p=db.properties.find(p=>p.slug===b.slug);
 if(!p||p.deletedAt)fail(404,'Bien introuvable.');
 if(db.sessions.some(s=>s.slug===p.slug&&s.generating))fail(409,'Une transformation est en cours.');
 let updated;
 if(b.baseline!==undefined){
  const original=validateProperty(b.baseline,{draft:true});
  const wanted=validateProperty({...b.property,credits:b.property?.credits??original.credits},{draft:true});
  const current=validateProperty(p,{draft:true}),candidate={...p};
  const changed=[...new Set([...Object.keys(original),...Object.keys(wanted)])].filter(field=>!isDeepStrictEqual(original[field]??null,wanted[field]??null));
  for(const field of changed){if(wanted[field]===undefined)delete candidate[field];else candidate[field]=wanted[field];}
  updated=inheritBranding(validateProperty(candidate,{draft:['Draft','Archived'].includes(p.status)}));
  for(const field of changed)if(!isDeepStrictEqual(current[field]??null,original[field]??null)&&!isDeepStrictEqual(current[field]??null,updated[field]??null))throw Object.assign(new Error('Modification simultanée du champ '+field+'. Choisissez la version à conserver.'),{status:409,field});
 }else updated=inheritBranding(validateProperty({...b.property,credits:b.property.credits??p.credits},{draft:['Draft','Archived'].includes(p.status)}));
 replacePropertyFields(p,updated);await save();return send({ok:true,url:'/p/'+p.slug,property:p});
}
if(url.pathname==='/api/agent/link'&&req.method==='POST'){const b=await body(req);if(typeof b.name!=='string'||!b.name.trim()||b.name.length>200||b.email&&(!/^\S+@\S+\.\S+$/.test(b.email)||b.email.length>200)||b.phone&&(typeof b.phone!=='string'||b.phone.length>100))fail(400,'Coordonnées client invalides.');const p=property(b.slug);const t=token();const channel=['direct','whatsapp','email','sms','qr','portal','social','website'].includes(b.channel)?b.channel:'direct';db.links.push({token:t,slug:p.slug,channel,lead:{name:b.name||'',email:b.email||'',phone:b.phone||''}});await save();return send({url:'/v/'+p.slug+'/'+t});}
if(url.pathname==='/api/agent/status'&&req.method==='POST'){const b=await body(req);const p=db.properties.find(p=>p.slug===b.slug);if(!p||p.deletedAt)fail(404,'Bien introuvable.');if(!['Draft','Published','Unlisted','Archived'].includes(b.status))fail(400,'État invalide.');if(['Published','Unlisted'].includes(b.status))validateProperty(p);p.status=b.status;await save();return send({ok:true,url:'/p/'+p.slug});}
if(url.pathname==='/api/agent/jobs'&&req.method==='GET')return send({jobs:jobs.list(j=>j.agent&&(!url.searchParams.get('id')||j.id===url.searchParams.get('id'))&&db.properties.some(p=>p.slug===j.slug&&!p.deletedAt))});
if(url.pathname==='/api/agent/generate'&&req.method==='POST'){const b=await body(req,3000000);const p=db.properties.find(p=>p.slug===b.slug);if(!p||p.deletedAt)fail(404,'Bien introuvable.');let s=db.sessions.find(s=>s.agent&&s.slug===p.slug);if(!s){s={id:token(),slug:p.slug,agent:true,events:[],visits:0};db.sessions.push(s);}const result=await generateVariant(p,s,b);if(result.job)return send(result,202);if(result.deferred)return {deferred:result.deferred,agent:true};return send({...publicVariant(result),credits:p.credits},201);}
if(url.pathname==='/api/agent/variants')return send(db.variants.filter(v=>v.agent&&db.properties.some(p=>p.slug===v.slug&&!p.deletedAt)).map(publicVariant));
if(url.pathname==='/api/agent/records'&&req.method==='GET')return send({records:db.records.filter(r=>['agency','profile'].includes(r.kind)||db.properties.some(p=>p.slug===r.slug&&!p.deletedAt))});
if(['/api/agent/sync-record','/api/agent/record'].includes(url.pathname)&&req.method==='POST'){const b=await body(req);const kinds={agency:{name:'string',email:'string',phone:'string',website:'string',brandHex:'string',address:'string'},profile:{firstName:'string',lastName:'string',email:'string',agency:'string'},variant:{title:'string',style:'string',prompt:'string',image:'string',isFavorite:'boolean',room:'string',sourcePhoto:'string'},event:{type:'string',timestamp:'string',room:'string',metadata:'string'},interaction:{event:'string',session:'string',timestamp:'string'},offer:{amount:'number',financing:'string',message:'string'},measurement:{name:'string',widthCM:'number',depthCM:'number',heightCM:'number',room:'string'}};let record=b.id?db.records.find(r=>r.id===b.id):db.records.find(r=>r.clientKey===b.clientKey&&r.slug===b.slug&&r.kind===b.kind);const kind=record?.kind||b.kind;if(!kinds[kind]||!db.properties.some(p=>(!p.deletedAt||['agency','profile'].includes(kind))&&p.slug===(record?.slug||b.slug)))fail(400,'Donnée synchronisée invalide.');if(b.id&&!record)fail(404,'Donnée introuvable.');if(!record&&(typeof b.clientKey!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(b.clientKey)))fail(400,'Clé invalide.');const patch=b.patch||{},fields=kinds[kind];checkOwnedMedia(patch);for(const [key,value] of Object.entries(patch)){if(!fields[key]||(value===null&&!['room','sourcePhoto','agency'].includes(key))||(value!==null&&typeof value!==fields[key])||(typeof value==='number'&&(!Number.isFinite(value)||value<0))||(typeof value==='string'&&value.length>5000))fail(400,'Champ invalide : '+key);}if(kind==='variant'&&patch.image&&!mediaURL(patch.image))fail(400,'Image de variante invalide.');if(record&&url.pathname.endsWith('sync-record'))for(const key of Object.keys(patch))if(!isDeepStrictEqual(record.data[key]??null,b.baseline?.[key]??null)&&!isDeepStrictEqual(record.data[key]??null,patch[key]))throw Object.assign(new Error('Modification simultanée : '+key),{status:409,field:key});if(record){for(const [key,value] of Object.entries(patch)){if(value===null)delete record.data[key];else record.data[key]=value;}}else{record={id:token(),clientKey:b.clientKey,kind,slug:b.slug,data:patch,at:new Date().toISOString()};db.records.push(record);}await save();return send({record});}
if(url.pathname==='/api/agent/sync-lead'&&req.method==='POST'){const b=await body(req);if(typeof b.clientKey!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(b.clientKey))fail(400,'Clé de contact invalide.');const p=db.properties.find(p=>p.slug===b.slug);if(!p||p.deletedAt)fail(404,'Bien introuvable.');let lead=b.id?db.leads.find(l=>l.id===b.id&&l.slug===p.slug):db.leads.find(l=>l.syncKey===b.clientKey&&l.slug===p.slug);if(b.id&&!lead)fail(404,'Contact introuvable.');const patch=b.patch||{},baseline=b.baseline||{},fields=['name','email','phone','message','kind','engagement'];const candidate={...(lead||{}),...Object.fromEntries(fields.filter(k=>k in patch).map(k=>[k,patch[k]]))};if(typeof candidate.name!=='string'||!candidate.name.trim()||!['visit','question','interest','callback'].includes(candidate.kind))fail(400,'Contact invalide.');for(const k of fields)if(k in candidate&&(typeof candidate[k]!=='string'||candidate[k].length>5000))fail(400,'Champ de contact invalide.');if(lead){for(const k of fields.filter(k=>k in patch))if(!isDeepStrictEqual(lead[k]??null,baseline[k]??null)&&!isDeepStrictEqual(lead[k]??null,patch[k]??null))throw Object.assign(new Error('Le contact a été modifié simultanément : '+k),{status:409,field:k});Object.assign(lead,candidate);}else{lead={...candidate,id:token(),syncKey:b.clientKey,slug:p.slug,stage:'new',notes:[],source:'app',at:new Date().toISOString()};db.leads.push(lead);}await save();return send({lead});}
if(url.pathname==='/api/agent/lead'&&req.method==='POST'){const b=await body(req);const lead=db.leads.find(l=>l.id===b.id);if(!lead||!(demoEnabled&&lead.slug===demo.slug)&&!db.properties.some(p=>p.slug===lead.slug&&!p.deletedAt))fail(404,'Contact introuvable.');if(b.stage!==undefined){if(!['new','contacted','qualified','visit','won','lost'].includes(b.stage))fail(400,'Statut invalide.');lead.stage=b.stage;}if(b.note!==undefined){if(typeof b.note!=='string'||!b.note.trim()||b.note.length>5000)fail(400,'Note invalide.');lead.notes ||= [];lead.notes.push({text:b.note.trim(),at:new Date().toISOString()});}await save();return send({ok:true});}
if(url.pathname==='/api/agent/activity'){const active=slug=>demoEnabled&&slug===demo.slug||db.properties.some(p=>p.slug===slug&&!p.deletedAt);return send({sessions:db.sessions.filter(s=>!s.agent&&active(s.slug)).map(({token,linkToken,...s})=>s),leads:db.leads.filter(l=>active(l.slug)),variants:db.variants.filter(v=>!v.agent&&active(v.slug)).map(({image,...v})=>v)});}
fail(404,'Route inconnue.');}
if(url.pathname==='/api/shared'&&req.method==='GET'){const v=db.variants.find(v=>v.shareToken===url.searchParams.get('token'));if(!v)fail(404,'Cette version n’est pas disponible.');const p=property(v.slug);return send({title:p.title,room:p.rooms.find(r=>r.id===v.room)?.name,label:v.label,image:v.image,original:v.original});}
if(url.pathname.startsWith('/api/')){const slug=url.searchParams.get('slug');const p=property(slug);
if(url.pathname==='/api/open'&&req.method==='POST'){const b=await body(req);const link=b.link?db.links.find(l=>l.token===b.link&&l.slug===slug):null;if(b.link&&!link)fail(404,'Lien client invalide.');let s;try{s=session(req,p);}catch{/* First visit has no session yet. */}if(link&&s&&s.linkToken!==link.token)s=undefined;let gateLead=null;if(p.privacy==='Private'&&!link&&!s?.lead){if(b.name===undefined&&b.email===undefined)return send({gated:true});if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>200||typeof b.email!=='string'||b.email.trim().length>200||!/^\S+@\S+\.\S+$/.test(b.email.trim()))fail(400,'Indiquez votre nom et une adresse email valide.');gateLead={name:b.name.trim(),email:b.email.trim()};}if(!s){s={id:token(),token:token(),slug,linkToken:link?.token||null,lead:link?.lead||gateLead,events:[],visits:0};db.sessions.push(s);}else if(link)s.lead=link.lead;else if(gateLead)s.lead=gateLead;s.source=link?.channel||(s.linkToken?db.links.find(l=>l.token===s.linkToken&&l.slug===slug)?.channel:null)||(['direct','whatsapp','email','sms','qr','portal','social','website'].includes(b.source)?b.source:'direct');s.visits++;s.events.push({type:s.visits>1?'property_return_visit':'mini_site_open',source:s.source,at:new Date().toISOString()});await save();res.setHeader('Set-Cookie',`pt_session_${p.slug}=${s.token}; HttpOnly; SameSite=Lax; Path=/${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);return send({property:publicProperty(p),lead:s.lead,variants:db.variants.filter(v=>v.sessionId===s.id).map(publicVariant),jobs:jobs.list(j=>j.sessionId===s.id&&!j.agent&&(!url.searchParams.get('id')||j.id===url.searchParams.get('id'))),aiAllowance:buyerAllowance(db,p,s),credits:p.credits});}
const s=session(req,p);if(p.privacy==='Private'&&!s.lead&&!s.linkToken)fail(401,'Indiquez vos coordonnées pour accéder à ce logement.');
if(url.pathname==='/api/roomplan'&&req.method==='GET')return send({roomplan:publicRoomplan(p)});
if(url.pathname==='/api/identify'&&req.method==='POST'){
 const b=await body(req,10000);
 for(const field of ['name','email','phone'])if(b[field]!==undefined&&typeof b[field]!=='string')fail(400,'Coordonnées invalides.');
 const name=(b.name||'').trim(),email=(b.email||'').trim(),phone=(b.phone||'').trim();
 if(!name||name.length>200||!email&&!phone||email.length>200||phone.length>100||email&&!/^\S+@\S+\.\S+$/.test(email))fail(400,'Indiquez votre nom et un email ou téléphone valide.');
 if(b.marketingConsent!==undefined&&typeof b.marketingConsent!=='boolean')fail(400,'Consentement invalide.');
 s.lead={name,email,phone};
 let lead=db.leads.find(l=>l.sessionId===s.id&&l.kind==='project');
 const details={...s.lead,marketingConsent:b.marketingConsent===true,consentUpdatedAt:new Date().toISOString()};
 if(lead)Object.assign(lead,details);
 else{lead={id:token(),stage:'new',notes:[],source:s.source||'direct',...details,slug,sessionId:s.id,kind:'project',at:new Date().toISOString()};db.leads.push(lead);s.events.push({type:'lead_identified',at:lead.at});}
 await save();return send({ok:true,lead:s.lead,aiAllowance:buyerAllowance(db,p,s)});
}
if(url.pathname==='/api/event'&&req.method==='POST'){const b=await body(req);if(!events.has(b.type))fail(400,'Événement invalide.');if(s.events.length<10000)s.events.push({type:b.type,room:String(b.room||'').slice(0,100),duration:Math.min(3600,Math.max(0,Number(b.duration)||0)),at:new Date().toISOString()});await save();return send({ok:true});}
if(url.pathname==='/api/contact'&&req.method==='POST'){
const b=await body(req);
if(!['visit','callback','question','interest'].includes(b.kind))fail(400,'Type de demande invalide.');
for(const field of ['name','email','phone','availability','message',...(b.kind==='interest'?['interest']:[])])if(b[field]!==undefined&&typeof b[field]!=='string')fail(400,'Champ de demande invalide : '+field);
const name=(b.name||'').trim(),email=(b.email||'').trim(),phone=(b.phone||'').trim();
if(!name||!email&&!phone)fail(400,'Indiquez votre nom et un moyen de vous joindre.');
if(email&&!/^\S+@\S+\.\S+$/.test(email))fail(400,'Indiquez une adresse email valide.');
s.lead={name:name.slice(0,200),email:email.slice(0,200),phone:phone.slice(0,100)};
db.leads.push({id:token(),stage:'new',notes:[],source:s.source||'direct',...s.lead,slug,sessionId:s.id,kind:b.kind,interest:b.kind==='interest'?(b.interest||'').slice(0,200):'',availability:(b.availability||'').slice(0,1000),message:(b.message||'').slice(0,3000),at:new Date().toISOString()});
s.events.push({type:b.kind==='visit'?'visit_requested':b.kind==='interest'?'interest_submitted':'contact_clicked',at:new Date().toISOString()});
await save();return send({ok:true,aiAllowance:buyerAllowance(db,p,s)});
}
if(url.pathname==='/api/jobs'&&req.method==='GET')return send({jobs:jobs.list(j=>j.sessionId===s.id&&!j.agent&&(!url.searchParams.get('id')||j.id===url.searchParams.get('id'))),aiAllowance:buyerAllowance(db,p,s)});
if(url.pathname==='/api/generate'&&req.method==='POST'){const result=await generateVariant(p,s,await body(req,3000000));if(result.deferred)return {deferred:result.deferred};return send(result.job?result:publicVariant(result),result.job?202:201);}
if(url.pathname==='/api/share'&&req.method==='POST'){const b=await body(req);const v=db.variants.find(v=>v.id===b.id&&v.sessionId===s.id);if(!v)fail(404,'Version introuvable.');v.shareToken ||= token();await save();return send({url:'/share/'+v.shareToken});}
if(url.pathname==='/api/save'&&req.method==='POST'){const b=await body(req);const v=db.variants.find(v=>v.id===b.id&&v.sessionId===s.id);if(!v)fail(404,'Version introuvable.');v.saved=true;s.events.push({type:'variant_saved',room:v.room,at:new Date().toISOString()});await save();return send(publicVariant(v));}
fail(404,'Route inconnue.');}
const publicSlug=url.pathname.split('/')[1]==='p'?url.pathname.split('/')[2]:null;
if(publicSlug){const visible=db.properties.find(p=>p.slug===publicSlug);if(!visible?.deletedAt&&visible?.privacy==='Public'&&visible.indexable&&visible.status==='Published')res.setHeader('X-Robots-Tag','index, follow');}
const staticFiles={'/app.js':'app.js','/style.css':'style.css','/dashboard.js':'dashboard.js','/dashboard.css':'dashboard.css','/roomplan-viewer.js':'roomplan-viewer.js','/retouch-engine.mjs':'retouch-engine.mjs','/mask-history.mjs':'mask-history.mjs'};const file=staticFiles[url.pathname]||'index.html';res.setHeader('Content-Type',(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript':file.endsWith('.css')?'text/css':'text/html');let content=await readFile(path.join(root,'public',file));if(file==='index.html'){res.setHeader('Cache-Control','no-store');if(res.getHeader('X-Robots-Tag')==='index, follow')content=Buffer.from(content.toString().replace('content="noindex,nofollow"','content="index,follow"'));}res.end(content);
}
function bufferResponse(res){
 let status=200,data,ended=false;const headers=new Map();
 return {setHeader:(key,value)=>headers.set(key.toLowerCase(),value),getHeader:key=>headers.get(key.toLowerCase())??res.getHeader(key),
  writeHead:(code,values={})=>{status=code;for(const [key,value] of Object.entries(values))headers.set(key.toLowerCase(),value);},
  end:value=>{data=value;ended=true;},flush:()=>{if(!ended)return;res.writeHead(status,Object.fromEntries(headers));res.end(data);}};
}
export const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(url.pathname.startsWith('/api/admin/')){
   const expected=process.env.PLATFORM_ADMIN_TOKEN||(!auth.enabled&&process.env.NODE_ENV!=='production'?process.env.ADMIN_TOKEN:'')||'',got=req.headers.authorization?.replace(/^Bearer /,'')||'';
   const expectedBytes=Buffer.from(expected),gotBytes=Buffer.from(got);if(!expectedBytes.length||expectedBytes.length!==gotBytes.length||!timingSafeEqual(expectedBytes,gotBytes))fail(401,'Accès administration non autorisé.');
   if(url.pathname!=='/api/admin/ai-routing')fail(404,'Route inconnue.');
   let payload;if(req.method==='GET')payload={...await routing.read(),profiles:await provider.describe()};else if(req.method==='PUT'){const input=await body(req,25000);payload={config:await routing.write(input.config,input.baseline),storageReady:true,profiles:await provider.describe()};}else fail(405,'Méthode non autorisée.');
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));return;
  }
  if(url.pathname==='/api/mobile/pair'&&req.method==='POST'){const input=await body(req,1000);const result=localConnection.redeem(input.code,req.socket.remoteAddress);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;}
  if(await auth.handle(req,res,url,req=>body(req,10000)))return;
  let store,identity;
  if(url.pathname.startsWith('/api/agent')||url.pathname.startsWith('/api/v1/')){
   if(auth.enabled){identity=await auth.authorize(req,res);store=await stores.load(identity.agency);
    if(url.pathname==='/api/agent/sync-workspace'&&!['owner','admin'].includes(identity.role))fail(403,'Seuls les administrateurs peuvent modifier l’identité de l’agence.');
   }else{admin(req);store=stores.local;}
  }else store=await stores.publicStore(url);
  const pending=stores.kind==='postgres'?bufferResponse(res):null;
  const result=await stores.run(store,identity,()=>handle(req,pending||res));
  if(result?.photoEdit){
   if(activeRetouches>=2)fail(429,'Deux retouches sont déjà en cours. Réessayez dans quelques instants.');
   activeRetouches++;
   try{
    const edit=result.photoEdit,rendered=await renderRetouchInWorker(await storage.read(edit.source,edit.photo),edit.settings),prepared=await prepareMedia(store,rendered.data,'image/webp');
    const payload=await stores.run(store,identity,async()=>{
     const p=db.properties.find(p=>p.slug===edit.slug&&!p.deletedAt);
     if(!p?.rooms.find(r=>r.id===edit.room)?.photos.includes(edit.photo))fail(409,'Cette photo a été déplacée ou retirée pendant la retouche. Actualisez le dossier.');
     const registered=registerMedia(prepared);await save();return {...registered,original:edit.photo,settings:rendered.settings,width:rendered.width,height:rendered.height};
    });
    res.writeHead(201,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));
   }finally{activeRetouches--;}
  }else if(result?.mediaUpload){
   try{
   const checked=await storage.validateUpload(result.mediaUpload);
   const prepared=await prepareMedia(store,checked.data,result.mediaUpload.type);
   const payload=await stores.run(store,identity,async()=>{
    if(!db.properties.some(p=>p.slug===result.slug&&!p.deletedAt))fail(410,'Ce bien est dans la corbeille.');
    const upload=storage.lookup(stores.current(),result.principal,result.slug,result.mediaUpload.id);
    if(upload.status==='completed')return upload.result;
    if(upload.processingToken!==result.mediaUpload.processingToken)fail(409,'La validation de cet import a été reprise.');
    const registered=registerMedia(prepared);upload.status='completed';upload.checksum=checked.checksum;upload.result=registered;await save();return registered;
   });
   try{await storage.removeStaged(result.mediaUpload);}catch{console.error('Staged media cleanup unavailable.');}
   res.writeHead(201,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));
   }catch(error){
    await stores.run(store,identity,async()=>{const upload=db.uploads[result.mediaUpload.id];if(upload?.status==='processing'&&upload.processingToken===result.mediaUpload.processingToken){upload.status='pending';delete upload.processingToken;delete upload.leaseExpires;await save();}}).catch(()=>{});
    throw error;
   }
  }else if(result?.deferred){
   const final=await jobs.wait(result.deferred);
   if(final.status==='failed')fail(502,final.error);
   const payload=await stores.run(store,identity,()=>{const variant=db.variants.find(v=>v.id===final.variantId);return {...publicVariant(variant),...(result.agent?{credits:db.properties.find(p=>p.slug===final.slug)?.credits}:{})};});
   res.writeHead(201,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));
  }else pending?.flush();
 }catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({message:error.status?error.message:'Une erreur est survenue.',...(error.field?{field:error.field}:{})}));}
});
server.on('close',()=>{jobs.close();if(stores.close)stores.close().catch(()=>{});});
if(main)server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Le port '+(process.env.PORT||3000)+' est déjà utilisé. Le dashboard est peut-être déjà démarré ; utilisez npm run dev:shared pour le vérifier.':'Le serveur n’a pas pu démarrer ('+(error.code||'erreur')+').');jobs.close();Promise.resolve(stores.close?.()).finally(()=>{process.exitCode=1;});});
if(main)server.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log('PropertyTwin Experience : http://localhost:'+(process.env.PORT||3000)));
