import {randomBytes,createHash} from 'node:crypto';
import {validateAIMask} from './ai-mask.mjs';
import {normalizeTool,toolLabel} from './public/ai-tools.mjs';
import {publicVariant,variantParent} from './variant-data.mjs';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const active=job=>['queued','processing'].includes(job.status);
const id=()=>randomBytes(24).toString('base64url');
const now=()=>new Date().toISOString();

export function buyerAllowance(db,p,s){
 const identified=Boolean(s.lead?.name&&(s.lead.email||s.lead.phone));
 const limit=identified?5:2;
 const completed=db.variants.filter(v=>v.sessionId===s.id&&!v.agent).length;
 const pending=(db.jobs||[]).filter(j=>j.sessionId===s.id&&!j.agent&&active(j)).length;
 return {limit,used:completed,pending,remaining:Math.max(0,Math.min(limit-completed-pending,p.credits||0)),identified};
}

// One process owns the atomic JSON stores. Persist reservations before calling a provider.
// A processing job is never automatically resubmitted after a restart: its external
// billing outcome may be unknown. Queued jobs have not called the provider yet.
export function createAIJobs({stores,provider,concurrency=2,clock=()=>Date.now()}){
 let running=0,scheduled=false,closed=false;
 const completions=new Map(),reservations=new Map(),ready=new Set();
 const db=stores.state;
 const expose=job=>{
  const p=db.properties.find(p=>p.slug===job.slug);
  const variant=job.variantId?db.variants.find(v=>v.id===job.variantId):null;
  return {id:job.id,slug:job.slug,room:job.input.room,original:job.input.photo,label:job.label,
   status:job.status,createdAt:job.createdAt,startedAt:job.startedAt||null,finishedAt:job.finishedAt||null,
   creditsReserved:job.creditsReserved,creditsCharged:job.creditsCharged,creditsRefunded:job.creditsRefunded,
   ...(p?{credits:p.credits}:{}),...(job.error?{message:job.error}:{}),...(variant&&!variant.deletedAt?{result:publicVariant(variant)}:{}),...(variant?.deletedAt?{resultUnavailable:true}:{})};
 };
 function refund(job){
  if(job.creditsRefunded)return;
  const p=db.properties.find(p=>p.slug===job.slug);if(p)p.credits+=job.creditsReserved;
  job.creditsRefunded=job.creditsReserved;job.creditsCharged=0;
 }
 function release(job){const s=db.sessions.find(s=>s.id===job.sessionId);if(s){s.generating=false;if(job.status==='failed')s.lastGeneration=0;}}
 function settle(job){const waiting=completions.get(job.id)||[];completions.delete(job.id);for(const resolve of waiting)resolve(job);}
 const workerId=id();
 async function process(base,jobId){
  const claim=await stores.run(base,null,async()=>{
   const job=db.jobs.find(j=>j.id===jobId);if(!job||job.status!=='queued')return null;
   const p=db.properties.find(p=>p.slug===job.slug),s=db.sessions.find(s=>s.id===job.sessionId);
   let parentAvailable=true;try{if(p&&s)variantParent(db,p,s,job.input);}catch{parentAvailable=false;}
   if(!p||p.deletedAt||!s||!parentAvailable||!p.rooms.some(r=>r.id===job.input.room&&r.photos.includes(job.input.photo))){
    job.status='failed';job.error='La photo source n’est plus disponible. Votre crédit a été remboursé.';job.finishedAt=now();refund(job);release(job);await stores.save();settle(job);return null;
   }
   Object.assign(job,{status:'processing',startedAt:now(),workerId,leaseExpires:new Date(clock()+180000).toISOString()});await stores.save();
   return {job,directory:stores.current().dir,agencyId:stores.current().id,assets:structuredClone(stores.current().db.assets||{})};
  });
  if(!claim)return;
  let output;
  try{output=await provider.edit(claim.job.input,{directory:claim.directory,agencyId:claim.agencyId,assets:claim.assets,jobId,agent:Boolean(claim.job.agent),onAttempt:attempt=>stores.run(base,null,async()=>{
   const job=db.jobs.find(j=>j.id===jobId);if(!job||job.status!=='processing'||job.workerId!==workerId)return;job.attempts||=[];const index=job.attempts.findIndex(a=>a.id===attempt.id);if(index<0)job.attempts.push(attempt);else job.attempts[index]=attempt;await stores.save();
  })});}catch{/* Failure is finalized under the agency lock below. */}
  const finished=await stores.run(base,null,async()=>{
   const job=db.jobs.find(j=>j.id===jobId);if(!job||job.status!=='processing'||job.workerId!==workerId)return null;
   const s=db.sessions.find(s=>s.id===job.sessionId);
   if(output&&s){
    const variant={id:id(),slug:job.slug,sessionId:s.id,room:job.input.room,original:job.input.photo,
     image:output.image,label:job.label,saved:false,favorite:false,revision:1,at:now(),parentVariantId:job.input.parentVariantId||null,operation:job.input.action,options:job.input.options||{},...(job.input.action==='Rénover'?{visualizationNonContractual:true}:{}),...(job.agent?{agent:true}:{}),jobId:job.id};
    db.variants.push(variant);s.events.push({type:'ai_generation',room:variant.room,at:variant.at});
    Object.assign(job,{status:'completed',variantId:variant.id,creditsCharged:job.creditsReserved,
     provider:output.provider||provider.name,model:output.model??null,actualProviderCost:output.actualProviderCost??null,usage:output.usage||null,providerRequestId:output.providerRequestId||null});
   }else{job.status='failed';job.error='La transformation a échoué. Votre crédit a été remboursé.';refund(job);}
   job.finishedAt=now();job.duration=Math.max(0,clock()-Date.parse(job.startedAt||job.createdAt));release(job);await stores.save();return job;
  });
  if(finished)settle(finished);
 }
 function schedule(){
  if(scheduled||closed)return;scheduled=true;
  setImmediate(()=>{scheduled=false;if(closed)return;
   for(const store of stores.all()){
    for(const job of store.db.jobs||[]){
     if(running>=concurrency)return;
     if(job.status!=='queued'||stores.kind!=='postgres'&&!ready.has(job.id))continue;
     // The dispatch marker is kept outside the persisted document.
     if(completions.has('running:'+job.id))continue;
     completions.set('running:'+job.id,[]);ready.delete(job.id);running++;
     process(store,job.id).catch(()=>{console.error('AI job persistence failed.');}).finally(()=>{
      completions.delete('running:'+job.id);running--;schedule();
     });
    }
   }
  });
 }
 async function recover(){
  for(const store of stores.all())await stores.run(store,null,async()=>{
   let changed=false;
   for(const job of db.jobs||[])if(job.status==='processing'&&(stores.kind!=='postgres'||!job.leaseExpires||Date.parse(job.leaseExpires)<=clock())){
    job.status='failed';job.error='La transformation a été interrompue. Votre crédit a été remboursé.';
    job.finishedAt=now();refund(job);release(job);changed=true;
   }
   if(changed)await stores.save();
   for(const job of db.jobs||[])if(job.status==='queued')ready.add(job.id);
  });
  schedule();
 }
 async function submit(p,s,b){
  if(b.async!==undefined&&typeof b.async!=='boolean')fail(400,'Mode de génération invalide.');
  const key=b.idempotencyKey??(b.async?null:id());
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(key))fail(400,'Clé de génération invalide.');
  if(b.quality!==undefined&&b.quality!=='preview')fail(400,'Seule la qualité aperçu est disponible.');
  if(b.prompt!==undefined&&(typeof b.prompt!=='string'||b.prompt.length>1000))fail(400,'Instruction trop longue (1 000 caractères maximum).');
  if(b.parentVariantId!==undefined&&(typeof b.parentVariantId!=='string'||!b.parentVariantId||!/^[A-Za-z0-9_-]{1,100}$/.test(b.parentVariantId)))fail(400,'Version source invalide.');
  let mask;
  if(b.mask!==undefined||b.action==='Supprimer un objet'){
   if(!s.agent||b.action!=='Supprimer un objet')fail(400,'La sélection manuelle est disponible dans le studio agent pour supprimer un objet.');
   if(!b.parentVariantId&&(typeof b.photo!=='string'||!/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$/.test(b.photo)))fail(400,'Importez cette photo dans le dossier avant de sélectionner un objet.');
   mask=await validateAIMask(b.mask);
  }
  if(p.deletedAt)fail(410,'Ce bien est dans la corbeille.');
  const input={room:b.room,photo:b.photo,...normalizeTool(b,{agent:Boolean(s.agent)}),quality:'preview',...(mask?{mask}:{}),...(b.parentVariantId?{parentVariantId:b.parentVariantId}:{})};
  const principal=s.agent?(stores.identity()?.user?.id||stores.identity()?.userId||'local-agent'):s.id;
  const signature=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existing=db.jobs.find(j=>j.idempotencyKey===key&&j.principal===principal&&j.slug===p.slug);
  if(existing){if(existing.signature!==signature)fail(409,'Cette clé correspond déjà à une autre transformation.');await reservations.get(existing.id);return existing;}
  if(!p.rooms.some(r=>r.id===b.room&&r.photos.includes(b.photo)))fail(400,'Photo inconnue.');
  const parent=variantParent(db,p,s,input);
  if(mask&&parent&&!/^(data:image\/(png|jpeg|webp);base64,|\/media\/)/.test(parent.image))fail(400,'Cette version distante ne permet pas encore la sélection d’objet. Utilisez la photo importée.');
  if(input.inspiration&&!stores.current().files.has(input.inspiration))fail(400,'Cette image d’inspiration n’appartient pas à votre agence.');
  if(provider.prepare){input.routing=await provider.prepare(input,{agent:Boolean(s.agent)});const repeated=db.jobs.find(j=>j.idempotencyKey===key&&j.principal===principal&&j.slug===p.slug);if(repeated){if(repeated.signature!==signature)fail(409,'Cette clé correspond déjà à une autre transformation.');await reservations.get(repeated.id);return repeated;}}
  else{if(!provider.configured)fail(503,'Les transformations IA ne sont pas encore activées par cette agence.');if(mask&&!provider.supportsMasks)fail(503,'La suppression d’objet n’est pas encore activée sur le backend IA. Votre sélection reste disponible.');if(input.inspiration&&!provider.supportsReferences)fail(503,'Les images d’inspiration ne sont pas encore activées.');}
  if(parent)input.sourceImage=parent.image;
  if(!Number.isInteger(p.credits)||p.credits<=0)fail(429,'Le budget IA de ce bien est épuisé.');
  if(!s.agent&&!buyerAllowance(db,p,s).remaining)fail(429,buyerAllowance(db,p,s).identified?'Vous avez utilisé les cinq transformations de votre visite.':'Vos deux transformations sont utilisées. Renseignez vos coordonnées pour en obtenir trois de plus.');
  if(s.generating||clock()-(s.lastGeneration||0)<30000)fail(429,'Patientez quelques instants avant une nouvelle transformation.');
  const job={id:id(),agencyId:stores.current().id,slug:p.slug,userId:s.agent?principal:null,sessionId:s.id,
   agent:Boolean(s.agent),principal,idempotencyKey:key,signature,input,label:toolLabel(input),
   status:'queued',createdAt:now(),creditsReserved:1,creditsCharged:0,creditsRefunded:0,
   provider:provider.name,model:null,actualProviderCost:null};
  db.jobs.push(job);s.generating=true;s.lastGeneration=clock();p.credits--;
  const committed=stores.save();reservations.set(job.id,committed);
  try{await committed;}catch(error){db.jobs.splice(db.jobs.indexOf(job),1);p.credits++;s.generating=false;s.lastGeneration=0;throw error;}
  finally{reservations.delete(job.id);}
  ready.add(job.id);schedule();return job;
 }
 async function wait(job){if(stores.kind==='postgres'){const base=await stores.load(job.agencyId);for(;;){const current=await stores.run(base,null,()=>structuredClone(db.jobs.find(j=>j.id===job.id)));if(!current)throw Error('Transformation introuvable.');if(!active(current))return current;await new Promise(resolve=>setTimeout(resolve,500));}}if(!active(job))return Promise.resolve(job);return new Promise(resolve=>{const pending=completions.get(job.id)||[];pending.push(resolve);completions.set(job.id,pending);});}
 function list(predicate){return db.jobs.filter(predicate).map(expose);}
 let timer,polling=false;
 if(stores.kind==='postgres'){timer=setInterval(async()=>{if(polling||closed)return;polling=true;try{await stores.refreshAll();await recover();}catch{console.error('AI queue refresh failed.');}finally{polling=false;}},1000);timer.unref();}
 return {submit,wait,expose,list,recover,active,close:()=>{closed=true;clearInterval(timer);}};
}
