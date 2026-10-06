import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';

export const routeNames={agentPreview:'Studio agent',homeStaging:'Home staging',magicErase:'Gomme IA',buyerPreview:'Aperçu acheteur',finalHD:'Rendu HD'};
export const providerTypes=['http','openai','gemini','flux'];
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const only=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
export function defaultRouting(){
 return {version:1,revision:0,enabled:true,buyerEnabled:true,profiles:[
  {id:'http',name:'Backend existant',type:'http',model:'',enabled:true},
  {id:'openai-premium',name:'OpenAI précis',type:'openai',model:'gpt-image-2.5-sunburst',enabled:true},
  {id:'openai-fast',name:'OpenAI aperçu',type:'openai',model:'gpt-image-2.5-flare',enabled:true},
  {id:'gemini-preview',name:'Gemini aperçu',type:'gemini',model:'gemini-3.1-flash-image',enabled:true},
  {id:'flux-edit',name:'Flux édition',type:'flux',model:'flux-2-pro',enabled:true},
  {id:'flux-erase',name:'Flux masque',type:'flux',model:'flux-pro-1.0-fill',enabled:true}
 ],routes:Object.fromEntries(Object.keys(routeNames).map(key=>[key,{primary:'http',fallback:null}]))};
}
export function validateRouting(value){
 if(!only(value,['version','revision','enabled','buyerEnabled','profiles','routes'])||value.version!==1||!Number.isInteger(value.revision)||value.revision<0||typeof value.enabled!=='boolean'||typeof value.buyerEnabled!=='boolean'||!Array.isArray(value.profiles)||!value.profiles.length||value.profiles.length>12)fail(400,'Configuration IA invalide.');
 const ids=new Set();
 const profiles=value.profiles.map(p=>{
  if(!only(p,['id','name','type','model','enabled'])||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!providerTypes.includes(p.type)||typeof p.enabled!=='boolean'||typeof p.model!=='string'||p.model.length>100)fail(400,'Profil IA invalide.');
  const valid=p.type==='http'?p.model==='':p.type==='openai'?/^gpt-image-[a-z0-9.-]+$/.test(p.model):p.type==='gemini'?/^gemini-[a-z0-9.-]*image[a-z0-9.-]*$/.test(p.model):['flux-2-pro','flux-2-pro-preview','flux-kontext-pro','flux-kontext-max','flux-pro-1.0-fill'].includes(p.model);
  if(!valid)fail(400,'Modèle incompatible avec le fournisseur choisi.');ids.add(p.id);return {...p,name:p.name.trim()};
 });
 if(!only(value.routes,Object.keys(routeNames))||Object.keys(value.routes).length!==Object.keys(routeNames).length)fail(400,'Routage IA incomplet.');
 const routes={};for(const key of Object.keys(routeNames)){
  const route=value.routes[key];if(!only(route,['primary','fallback'])||!ids.has(route.primary)||(route.fallback!==null&&(!ids.has(route.fallback)||route.fallback===route.primary)))fail(400,'Fournisseur principal ou de secours invalide.');routes[key]={...route};
 }
 return {version:1,revision:value.revision,enabled:value.enabled,buyerEnabled:value.buyerEnabled,profiles,routes};
}
export function operationRoute(input,{agent=true}={}){return !agent?'buyerPreview':input.quality==='hd'?'finalHD':input.mask?'magicErase':input.action==='Meubler'?'homeStaging':'agentPreview';}

// Configuration contains no credential or URL. The SQL table is platform-private.
export function createRoutingStore({directory,pool}={}){
 const file=path.join(directory,'platform-ai.json');let pending=Promise.resolve();
 async function read(){
  if(pool){try{const result=await pool.query('select config from private.ai_routing where singleton=true');return {config:result.rows[0]?validateRouting(result.rows[0].config):defaultRouting(),storageReady:true};}catch(error){if(error.code==='42P01')return {config:defaultRouting(),storageReady:false};throw error;}}
  try{return {config:validateRouting(JSON.parse(await readFile(file,'utf8'))),storageReady:true};}catch(error){if(error.code==='ENOENT')return {config:defaultRouting(),storageReady:true};throw error;}
 }
 async function write(value,baseline){
  const checked=validateRouting(value);if(!Number.isInteger(baseline)||baseline<0)fail(400,'Révision de référence invalide.');
  async function update(client){
   const {config,storageReady}=await (client?readSQL(client):read());if(!storageReady)fail(503,'Appliquez la migration 202610060005_ai_routing.sql avant d’enregistrer le routage.');
   if(config.revision!==baseline)fail(409,'Le routage a été modifié ailleurs. Rechargez la configuration avant d’enregistrer.');
   const next={...checked,revision:config.revision+1};
   if(client)await client.query('insert into private.ai_routing(singleton,config) values(true,$1) on conflict(singleton) do update set config=excluded.config,updated_at=now()',[next]);
   else{await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await rename(file+'.tmp',file);}return next;
  }
  if(pool){const client=await pool.connect();try{await client.query('begin');await client.query("set local lock_timeout='10s';set local statement_timeout='30s'");await client.query('select pg_advisory_xact_lock(74261005)');const result=await update(client);await client.query('commit');return result;}catch(error){await client.query('rollback');if(error.code==='42P01')fail(503,'Appliquez la migration 202610060005_ai_routing.sql avant d’enregistrer le routage.');throw error;}finally{client.release();}}
  const result=pending.catch(()=>{}).then(()=>update());pending=result;return result;
 }
 async function readSQL(client){const result=await client.query('select config from private.ai_routing where singleton=true');return {config:result.rows[0]?validateRouting(result.rows[0].config):defaultRouting(),storageReady:true};}
 return {read,write};
}
