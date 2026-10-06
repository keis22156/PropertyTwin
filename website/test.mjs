import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'propertytwin-test-'));process.env.DATA_DIR=dir;process.env.ADMIN_TOKEN='test-agent-secret';
const {server}=await import('./server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
async function request(route,data,auth='',cookie=''){const response=await fetch(base+route,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
await test('Publication, confidentialité et sessions indépendantes',async()=>{
assert.equal((await request('/api/agent/properties')).status,401);
const qr=await request('/api/agent/qr',{url:'https://propertytwin.app/p/test'},process.env.ADMIN_TOKEN);assert.equal(qr.status,200);assert.ok(qr.data.image.startsWith('data:image/png;base64,'));
assert.equal((await fetch(base+'/vendor/model-viewer.min.js')).status,200);
assert.equal((await request('/api/agent/publish',{title:'Sans photo',rooms:[]},process.env.ADMIN_TOKEN)).status,400);
assert.equal((await request('/api/agent/upload',{type:'image/png',base64:'aGVsbG8='},process.env.ADMIN_TOKEN)).status,400);const imageData=(await (await import('sharp')).default({create:{width:1,height:1,channels:3,background:'#ccd7df'}}).png().toBuffer()).toString('base64');const uploaded=await request('/api/agent/upload',{type:'image/png',base64:imageData},process.env.ADMIN_TOKEN);assert.equal(uploaded.status,201);const downloaded=await fetch(base+uploaded.data.url);assert.equal(downloaded.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),Buffer.from(imageData,'base64'));const uploadedProperty=await request('/api/agent/publish',{title:'Photo importée',rooms:[{id:'salon',name:'Salon',photos:[uploaded.data.url]}]},process.env.ADMIN_TOKEN);assert.equal(uploadedProperty.status,201);
const sharp=(await import('sharp')).default;const editableData=await sharp({create:{width:120,height:80,channels:3,background:'#9faca3'}}).png().toBuffer();const editableUpload=await request('/api/agent/upload',{type:'image/png',base64:editableData.toString('base64')},process.env.ADMIN_TOKEN);const editProperty=await request('/api/agent/publish',{title:'Retouche',rooms:[{id:'salon',name:'Salon',photos:[editableUpload.data.url]}]},process.env.ADMIN_TOKEN);const retouched=await request('/api/agent/photo-edit',{slug:editProperty.data.slug,room:'salon',photo:editableUpload.data.url,brightness:1.2,saturation:.8,rotation:90,crop:'original'},process.env.ADMIN_TOKEN);assert.equal(retouched.status,201);assert.notEqual(retouched.data.url,editableUpload.data.url);const retouchedFile=await fetch(base+retouched.data.url);const metadata=await sharp(Buffer.from(await retouchedFile.arrayBuffer())).metadata();assert.equal(metadata.width,80);assert.equal(metadata.height,120);assert.equal(metadata.format,'webp');const originalAfterEdit=await fetch(base+editableUpload.data.url);assert.deepEqual(Buffer.from(await originalAfterEdit.arrayBuffer()),editableData);assert.equal((await request('/api/agent/photo-edit',{slug:editProperty.data.slug,room:'salon',photo:editableUpload.data.url,brightness:50},process.env.ADMIN_TOKEN)).status,400);
const draft=await request('/api/agent/draft',{title:'Préparation',rooms:[]},process.env.ADMIN_TOKEN);assert.equal(draft.status,201);assert.equal((await request('/api/open?slug='+draft.data.slug,{})).status,404);assert.equal((await request('/api/agent/status',{slug:draft.data.slug,status:'Unlisted'},process.env.ADMIN_TOKEN)).status,400);const updated=await request('/api/agent/update',{slug:draft.data.slug,property:{title:'Prêt',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/ready.jpg']}]}},process.env.ADMIN_TOKEN);assert.equal(updated.status,200);const publishedDraft=await request('/api/agent/status',{slug:draft.data.slug,status:'Unlisted'},process.env.ADMIN_TOKEN);assert.equal(publishedDraft.data.url,draft.data.url);assert.equal((await request('/api/open?slug='+draft.data.slug,{})).data.property.title,'Prêt');
const indexed=await request('/api/agent/publish',{title:'Public indexable',privacy:'Public',indexable:true,rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}]},process.env.ADMIN_TOKEN);const indexedPage=await fetch(base+indexed.data.url);assert.equal(indexedPage.headers.get('x-robots-tag'),'index, follow');assert.match(await indexedPage.text(),/content="index,follow"/);
const b=await request('/api/agent/publish',{title:'Test',privacy:'Private',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}]},process.env.ADMIN_TOKEN);assert.equal(b.status,201);const slug=b.data.slug;
assert.equal((await request('/api/open?slug='+slug,{})).data.gated,true);
const link=await request('/api/agent/link',{slug,name:'Paul',email:'paul@example.com',channel:'whatsapp'},process.env.ADMIN_TOKEN);
const first=await request('/api/open?slug='+slug,{link:link.data.url.split('/').at(-1),source:'email'});assert.equal(first.data.lead.name,'Paul');assert.ok(first.cookie);assert.equal(first.data.property.privacy,'Private');
const second=await request('/api/open?slug='+slug,{name:'Autre',email:'autre@example.com'});assert.notEqual(first.cookie,second.cookie);
const other=await request('/api/agent/publish',{title:'Second bien',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/second.jpg']}]},process.env.ADMIN_TOKEN);const otherSession=await request('/api/open?slug='+other.data.slug,{},'',first.cookie);assert.notEqual(otherSession.cookie.split('=')[0],first.cookie.split('=')[0]);const returning=await request('/api/open?slug='+slug,{},'',first.cookie+'; '+otherSession.cookie);assert.equal(returning.data.lead.name,'Paul');assert.equal(returning.cookie,first.cookie);
assert.equal((await request('/api/event?slug='+slug,{type:'floorplan_open'})).status,401);
assert.equal((await request('/api/contact?slug='+slug,{name:'Paul',email:'paul@example.com',kind:'interest',interest:'Très intéressé'},'',first.cookie)).status,200);
const contacts=await request('/api/agent/activity',null,process.env.ADMIN_TOKEN);const contact=contacts.data.leads.find(l=>l.name==='Paul');assert.ok(contact.id);assert.equal(contact.source,'whatsapp');const paulSession=contacts.data.sessions.find(s=>s.id===contact.sessionId);assert.equal(paulSession.source,'whatsapp');assert.ok(paulSession.events.filter(e=>['mini_site_open','property_return_visit'].includes(e.type)).every(e=>e.source==='whatsapp'));assert.equal((await request('/api/agent/lead',{id:contact.id,stage:'qualified',note:'Souhaite une seconde visite'},process.env.ADMIN_TOKEN)).status,200);const afterNote=await request('/api/agent/activity',null,process.env.ADMIN_TOKEN);const updatedContact=afterNote.data.leads.find(l=>l.id===contact.id);assert.equal(updatedContact.stage,'qualified');assert.equal(updatedContact.notes[0].text,'Souhaite une seconde visite');assert.equal((await request('/api/agent/lead',{id:contact.id,stage:'invalid'},process.env.ADMIN_TOKEN)).status,400);assert.equal((await request('/api/agent/lead',{id:contact.id,note:'Confidentiel'})).status,401);
assert.equal((await request('/api/generate?slug='+slug,{room:'salon',photo:'https://example.com/photo.jpg'},'',first.cookie)).status,503);
process.env.AI_ENDPOINT='https://ai.example.test/edit';const nativeFetch=globalThis.fetch;let aiPayload,invalidProvider=false;globalThis.fetch=async(input,options)=>{if(input===process.env.AI_ENDPOINT){aiPayload=JSON.parse(options.body);if(invalidProvider)return new Response(JSON.stringify({image_base64:'aGVsbG8='}));return new Response(JSON.stringify({image_url:'https://example.com/generated.png'}),{headers:{'Content-Type':'application/json'}});}return nativeFetch(input,options);};
try{const uploadedSession=await request('/api/open?slug='+uploadedProperty.data.slug,{});const localGeneration=await request('/api/generate?slug='+uploadedProperty.data.slug,{room:'salon',photo:uploaded.data.url,prompt:'Un bureau'},'',uploadedSession.cookie);assert.equal(localGeneration.status,201);assert.equal(aiPayload.image_base64,imageData);assert.equal(aiPayload.image_url,undefined);assert.equal(aiPayload.preserve_geometry,true);const generated=await request('/api/generate?slug='+slug,{room:'salon',photo:'https://example.com/photo.jpg',prompt:'Un bureau'},'',first.cookie);assert.equal(generated.status,201);assert.equal(generated.data.original,'https://example.com/photo.jpg');assert.equal(generated.data.sessionId,undefined);
assert.equal((await request('/api/generate?slug='+slug,{room:'salon',photo:'https://example.com/photo.jpg'},'',first.cookie)).status,429);
assert.equal((await request('/api/save?slug='+slug,{id:generated.data.id},'',second.cookie)).status,404);
assert.equal((await request('/api/save?slug='+slug,{id:generated.data.id},'',first.cookie)).data.saved,true);
assert.equal((await request('/api/share?slug='+slug,{id:generated.data.id},'',second.cookie)).status,404);const shared=await request('/api/share?slug='+slug,{id:generated.data.id},'',first.cookie);assert.equal(shared.status,200);const publicView=await request('/api/shared?token='+shared.data.url.split('/').at(-1));assert.equal(publicView.data.image,'https://example.com/generated.png');assert.equal(publicView.data.sessionId,undefined);assert.equal(publicView.data.lead,undefined);
const alternateLink=await request('/api/agent/link',{slug,name:'Marie',email:'marie@example.com'},process.env.ADMIN_TOKEN);const marie=await request('/api/open?slug='+slug,{link:alternateLink.data.url.split('/').at(-1)},'',first.cookie);assert.notEqual(marie.cookie,first.cookie);assert.equal(marie.data.lead.name,'Marie');assert.equal(marie.data.variants.length,0);const paulAgain=await request('/api/open?slug='+slug,{link:link.data.url.split('/').at(-1)},'',first.cookie);assert.equal(paulAgain.cookie,first.cookie);assert.equal(paulAgain.data.variants.length,1);assert.equal(paulAgain.data.lead.name,'Paul');
const props=await request('/api/agent/properties',null,process.env.ADMIN_TOKEN);assert.equal(props.data.find(p=>p.slug===slug).credits,4);
invalidProvider=true;const failed=await request('/api/generate?slug='+slug,{room:'salon',photo:'https://example.com/photo.jpg',prompt:'Bureau'},'',second.cookie);assert.equal(failed.status,502);const afterFailure=await request('/api/agent/properties',null,process.env.ADMIN_TOKEN);assert.equal(afterFailure.data.find(p=>p.slug===slug).credits,4);const failureSession=await request('/api/open?slug='+slug,{},'',second.cookie);assert.equal(failureSession.data.variants.length,0);assert.equal(failureSession.data.property.rooms[0].photos[0],'https://example.com/photo.jpg');
invalidProvider=false;assert.equal((await request('/api/agent/generate',{slug,room:'salon',photo:'https://example.com/photo.jpg',action:'Meubler',prompt:'Japandi'})).status,401);const agentGeneration=await request('/api/agent/generate',{slug,room:'salon',photo:'https://example.com/photo.jpg',action:'Meubler',prompt:'Japandi'},process.env.ADMIN_TOKEN);assert.equal(agentGeneration.status,201);assert.equal(agentGeneration.data.credits,(await request('/api/agent/properties',null,process.env.ADMIN_TOKEN)).data.find(p=>p.slug===slug).credits);const agentVersions=await request('/api/agent/variants',null,process.env.ADMIN_TOKEN);assert.equal(agentVersions.data.length,1);const buyerVersions=await request('/api/open?slug='+slug,{},'',first.cookie);assert.equal(buyerVersions.data.variants.length,1);const agentActivity=await request('/api/agent/activity',null,process.env.ADMIN_TOKEN);assert.ok(agentActivity.data.sessions.every(s=>!s.agent));
}finally{globalThis.fetch=nativeFetch;delete process.env.AI_ENDPOINT;}
await request('/api/agent/status',{slug,status:'Archived'},process.env.ADMIN_TOKEN);assert.equal((await request('/api/open?slug='+slug,{})).status,404);
});
await test('Les retouches avancées exportent le cadrage choisi sans crédit IA et refusent les paramètres invalides',async()=>{
 const sharp=(await import('sharp')).default,source=await sharp({create:{width:200,height:100,channels:3,background:'#687482'}}).png().toBuffer(),credential=process.env.ADMIN_TOKEN;
 const uploaded=await request('/api/agent/upload',{type:'image/png',base64:source.toString('base64')},credential);
 const created=await request('/api/agent/draft',{title:'Retouche avancée',credits:7,rooms:[{id:'salon',name:'Salon',photos:[uploaded.data.url]}]},credential),slug=created.data.slug;
 const input={slug,room:'salon',photo:uploaded.data.url,exposure:.4,contrast:15,highlights:-20,shadows:30,temperature:12,tint:-5,sharpness:20,straighten:3,rotation:90,crop:'4:3',cropRect:{x:.1,y:.1,width:.8,height:.8}};
 const before=await request('/api/agent/jobs',undefined,credential);
 for(const bad of [{exposure:5},{contrast:'15'},{sharpness:101},{straighten:20},{tint:null},{cropRect:{x:.8,y:0,width:.5,height:1}}])assert.equal((await request('/api/agent/photo-edit',{...input,...bad},credential)).status,400);
 assert.equal((await request('/api/agent/photo-edit',input)).status,401);
 const retouched=await request('/api/agent/photo-edit',input,credential);assert.equal(retouched.status,201);assert.equal(retouched.data.original,input.photo);assert.equal(retouched.data.settings.exposure,.4);assert.equal(retouched.data.width,80);assert.equal(retouched.data.height,60);
 const meta=await sharp(Buffer.from(await (await fetch(base+retouched.data.url)).arrayBuffer())).metadata();assert.equal(meta.width,80);assert.equal(meta.height,60);assert.equal(meta.format,'webp');
 assert.deepEqual(Buffer.from(await (await fetch(base+input.photo)).arrayBuffer()),source);
 const saved=(await request('/api/agent/properties',undefined,credential)).data.find(p=>p.slug===slug);assert.equal(saved.credits,7);assert.deepEqual(saved.rooms[0].photos,[input.photo]);assert.deepEqual((await request('/api/agent/jobs',undefined,credential)).data,before.data);
 const module=await fetch(base+'/retouch-engine.mjs');assert.equal(module.headers.get('content-type'),'text/javascript');assert.match(await module.text(),/export function renderPixels/);
});

await test('Synchronisation idempotente, édition web et publication automatique au partage',async()=>{
const clientKey='device-property-opaque-123';const initial={title:'Depuis app',description:'Initial',rooms:[],agency:{name:''},agent:{name:''}};const created=await request('/api/agent/sync',{clientKey,patch:initial},process.env.ADMIN_TOKEN);assert.equal(created.status,200);const slug=created.data.property.slug;assert.equal(created.data.property.status,'Draft');const retry=await request('/api/agent/sync',{clientKey,patch:initial},process.env.ADMIN_TOKEN);assert.equal(retry.data.property.slug,slug);assert.equal((await request('/api/agent/prepare-share',{slug},process.env.ADMIN_TOKEN)).status,400);
await request('/api/agent/update',{slug,property:{...created.data.property,title:'Depuis web',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}]}},process.env.ADMIN_TOKEN);
const pull=await request('/api/agent/sync',{clientKey,slug,patch:{}},process.env.ADMIN_TOKEN);assert.equal(pull.data.property.title,'Depuis web');assert.equal(pull.data.property.rooms[0].name,'Salon');
const conflict=await request('/api/agent/sync',{clientKey,slug,patch:{title:'Conflit app'},baseline:{title:'Depuis app'}},process.env.ADMIN_TOKEN);assert.equal(conflict.status,409);assert.equal(conflict.data.field,'title');
const changed=await request('/api/agent/sync',{clientKey,slug,patch:{description:'Modification app'},baseline:{description:'Initial'}},process.env.ADMIN_TOKEN);assert.equal(changed.data.property.title,'Depuis web');assert.equal(changed.data.property.description,'Modification app');const resolution=await request('/api/agent/sync',{clientKey,slug,patch:{title:'Version app choisie'},baseline:{title:'Depuis web'}},process.env.ADMIN_TOKEN);assert.equal(resolution.data.property.title,'Version app choisie');assert.equal(resolution.data.property.description,'Modification app');assert.equal(resolution.data.property.rooms[0].photos[0],'https://example.com/photo.jpg');const removed=await request('/api/agent/sync',{clientKey,slug,patch:{description:null},baseline:{description:'Modification app'}},process.env.ADMIN_TOKEN);assert.equal(removed.data.property.description,'');const share=await request('/api/agent/prepare-share',{slug},process.env.ADMIN_TOKEN);assert.equal(share.status,200);const opened=await request('/api/open?slug='+slug,{});assert.equal(opened.data.property.title,'Version app choisie');assert.equal(opened.data.property.syncKey,undefined);assert.equal((await request('/api/agent/sync-feed',null,process.env.ADMIN_TOKEN)).data.properties.filter(p=>p.syncKey===clientKey).length,1);
});
await test('L’éditeur web fusionne les champs et refuse les conflits avec l’app',async()=>{
 const credential=process.env.ADMIN_TOKEN;
 const created=await request('/api/agent/sync',{clientKey:'web-editor-concurrency-test',patch:{title:'Titre initial',description:'Texte initial',price:100000,floor:2,rooms:[]}},credential);
 const baseline=structuredClone(created.data.property),slug=baseline.slug;
 await request('/api/agent/sync',{clientKey:'web-editor-concurrency-test',slug,patch:{price:120000,credits:4},baseline},credential);
 const webEdit=await request('/api/agent/update',{slug,baseline,property:{...baseline,description:'Description web'}},credential);
 assert.equal(webEdit.status,200);assert.equal(webEdit.data.property.price,120000);assert.equal(webEdit.data.property.credits,4);assert.equal(webEdit.data.property.description,'Description web');
 const next=structuredClone(webEdit.data.property);
 await request('/api/agent/sync',{clientKey:'web-editor-concurrency-test',slug,patch:{title:'Titre app'},baseline:next},credential);
 const stale=await request('/api/agent/update',{slug,baseline:next,property:{...next,title:'Titre web',description:'Autre description web'}},credential);
 assert.equal(stale.status,409);assert.equal(stale.data.field,'title');
 let fresh=(await request('/api/agent/properties',null,credential)).data.find(p=>p.slug===slug);
 assert.equal(fresh.title,'Titre app');assert.equal(fresh.description,'Description web');
 const resolved=await request('/api/agent/update',{slug,baseline:{...next,title:fresh.title},property:{...next,title:'Titre web',description:'Autre description web'}},credential);
 assert.equal(resolved.status,200);assert.equal(resolved.data.property.title,'Titre web');
 fresh=structuredClone(resolved.data.property);
 const cleared={...fresh};delete cleared.floor;
 const removal=await request('/api/agent/update',{slug,baseline:fresh,property:cleared},credential);
 assert.equal(removal.status,200);assert.equal(removal.data.property.floor,undefined);assert.equal(removal.data.property.price,120000);
});

await test('Les contacts app et web partagent leur fiche sans perdre le suivi CRM',async()=>{
const created=await request('/api/agent/sync',{clientKey:'contacts-property-test',patch:{title:'Contacts',rooms:[]}},process.env.ADMIN_TOKEN);const slug=created.data.property.slug;const key='native-contact-opaque-key';const fields={name:'Paul Dupont',email:'paul@example.com',phone:'',message:'Premier message',kind:'question'};
const lead=await request('/api/agent/sync-lead',{slug,clientKey:key,patch:fields},process.env.ADMIN_TOKEN);assert.equal(lead.status,200);const id=lead.data.lead.id;await request('/api/agent/lead',{id,stage:'qualified',note:'Visite mardi'},process.env.ADMIN_TOKEN);const retry=await request('/api/agent/sync-lead',{slug,clientKey:key,patch:{}},process.env.ADMIN_TOKEN);assert.equal(retry.data.lead.id,id);assert.equal(retry.data.lead.notes[0].text,'Visite mardi');assert.equal(retry.data.lead.stage,'qualified');const updated=await request('/api/agent/sync-lead',{slug,id,clientKey:key,patch:{message:'Message mis à jour'},baseline:{message:'Premier message'}},process.env.ADMIN_TOKEN);assert.equal(updated.data.lead.message,'Message mis à jour');assert.equal(updated.data.lead.stage,'qualified');assert.equal((await request('/api/agent/activity',null,process.env.ADMIN_TOKEN)).data.leads.filter(l=>l.id===id).length,1);
});
await test('Les offres, mesures et variantes conservent leur identité entre les deux interfaces',async()=>{
const property=await request('/api/agent/sync',{clientKey:'business-property-key',patch:{title:'Dossier complet',rooms:[{id:'salon',name:'Salon',photos:[]}],address:'Rue Victor Hugo',city:'Paris',postalCode:'75016'}},process.env.ADMIN_TOKEN);const slug=property.data.property.slug;
assert.equal((await request('/api/agent/status',{slug,status:'Archived'},process.env.ADMIN_TOKEN)).status,200);const archived=await request('/api/agent/sync',{clientKey:'business-property-key',slug,patch:{city:'Lyon'},baseline:property.data.property},process.env.ADMIN_TOKEN);assert.equal(archived.status,200);assert.equal(archived.data.property.status,'Archived');assert.equal(archived.data.property.city,'Lyon');
for(const [kind,data] of [['offer',{amount:250000,financing:'Crédit',message:'Intéressé'}],['measurement',{name:'Canapé',widthCM:200,depthCM:90,heightCM:75,room:'salon'}],['variant',{title:'Salon clair',style:'Japandi',prompt:'Parquet clair',image:'https://example.com/variant.jpg',isFavorite:true,room:'salon'}]]){const clientKey='business-record-key-'+kind;const first=await request('/api/agent/sync-record',{slug,kind,clientKey,patch:data},process.env.ADMIN_TOKEN);assert.equal(first.status,200);const repeated=await request('/api/agent/sync-record',{slug,kind,clientKey,patch:{}},process.env.ADMIN_TOKEN);assert.equal(repeated.data.record.id,first.data.record.id);const field=kind==='offer'?'message':kind==='measurement'?'name':'title';const updated=await request('/api/agent/sync-record',{id:first.data.record.id,patch:{[field]:'Modifié depuis le dashboard'},baseline:{[field]:data[field]}},process.env.ADMIN_TOKEN);assert.equal(updated.data.record.data[field],'Modifié depuis le dashboard');assert.equal((await request('/api/agent/sync-record',{id:first.data.record.id,patch:{[field]:'Conflit app'},baseline:{[field]:data[field]}},process.env.ADMIN_TOKEN)).status,409);}
const records=(await request('/api/agent/records',null,process.env.ADMIN_TOKEN)).data.records.filter(r=>r.slug===slug);assert.equal(records.length,3);const measurement=records.find(r=>r.kind==='measurement');const detached=await request('/api/agent/sync-record',{id:measurement.id,patch:{room:null},baseline:measurement.data},process.env.ADMIN_TOKEN);assert.equal(detached.status,200);assert.equal(detached.data.record.data.room,undefined);assert.equal((await request('/api/agent/sync-record',{id:measurement.id,patch:{name:null},baseline:detached.data.record.data},process.env.ADMIN_TOKEN)).status,400);assert.equal((await request('/api/agent/records')).status,401);
});
await test('La corbeille conserve le dossier, empêche sa recréation et restaure son lien',async()=>{
 const auth=process.env.ADMIN_TOKEN,clientKey='reversible-property-key';
 const created=await request('/api/agent/sync',{clientKey,patch:{title:'Bien récupérable',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}]}},auth);
 const slug=created.data.property.slug;await request('/api/agent/prepare-share',{slug},auth);
 const lead=await request('/api/agent/sync-lead',{slug,clientKey:'reversible-contact-key',patch:{name:'Paul',kind:'question',message:'À conserver'}},auth);assert.equal(lead.status,200);
 await request('/api/agent/lead',{id:lead.data.lead.id,note:'Deuxième visite'},auth);
 let baseline=(await request('/api/agent/properties',null,auth)).data.find(p=>p.slug===slug);
 const agency=await request('/api/agent/sync-record',{slug,kind:'agency',clientKey:'reversible-agency-key',patch:{name:'Agence commune',phone:'0123456789'}},auth);assert.equal(agency.status,200);
 const offer=await request('/api/agent/sync-record',{slug,kind:'offer',clientKey:'reversible-offer-key',patch:{amount:100000,financing:'Crédit',message:'À conserver'}},auth);
 await request('/api/agent/sync',{clientKey,slug,patch:{title:'Modifié récemment'},baseline},auth);
 const conflict=await request('/api/agent/removal',{slug,removed:true,baseline},auth);assert.equal(conflict.status,409);assert.equal(conflict.data.field,'removal');
 baseline=(await request('/api/agent/properties',null,auth)).data.find(p=>p.slug===slug);
 const removed=await request('/api/agent/removal',{slug,removed:true,baseline},auth);assert.equal(removed.status,200);assert.ok(removed.data.property.deletedAt);
 const repeated=await request('/api/agent/removal',{slug,removed:true,baseline},auth);assert.equal(repeated.data.property.deletedAt,removed.data.property.deletedAt);
 assert.equal((await request('/api/agent/properties',null,auth)).data.some(p=>p.slug===slug),false);
 assert.equal((await request('/api/open?slug='+slug,{})).status,404);
 assert.equal((await request('/api/agent/activity',null,auth)).data.leads.some(l=>l.id===lead.data.lead.id),false);
 assert.equal((await request('/api/agent/lead',{id:lead.data.lead.id,note:'Modification obsolète'},auth)).status,404);
 assert.equal((await request('/api/agent/sync',{clientKey,patch:{title:'Ancien retry',rooms:[]}},auth)).status,410);
 assert.equal((await request('/api/agent/prepare-share',{slug},auth)).status,404);
 assert.equal((await request('/api/agent/records',null,auth)).data.records.some(r=>r.id===offer.data.record.id),false);
 const agencyEdit=await request('/api/agent/sync-record',{id:agency.data.record.id,patch:{phone:'0987654321'},baseline:agency.data.record.data},auth);assert.equal(agencyEdit.status,200);assert.equal((await request('/api/agent/records',null,auth)).data.records.find(r=>r.id===agency.data.record.id).data.phone,'0987654321');
 const feed=await request('/api/agent/sync-feed',null,auth);assert.ok(feed.data.properties.find(p=>p.slug===slug).deletedAt);
 const trash=await request('/api/agent/trash',null,auth);assert.ok(trash.data.properties.some(p=>p.slug===slug));
 const persisted=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir,'store.json'),'utf8'));assert.ok(persisted.properties.find(p=>p.slug===slug).deletedAt);
 const restored=await request('/api/agent/removal',{slug,removed:false,baseline:removed.data.property},auth);assert.equal(restored.status,200);assert.equal(restored.data.property.deletedAt,undefined);assert.equal(restored.data.property.slug,slug);assert.equal(restored.data.property.title,'Modifié récemment');
 assert.equal((await request('/api/open?slug='+slug,{})).status,200);
 assert.equal((await request('/api/agent/records',null,auth)).data.records.find(r=>r.id===offer.data.record.id).data.message,'À conserver');
 const restoredLead=(await request('/api/agent/activity',null,auth)).data.leads.find(l=>l.id===lead.data.lead.id);assert.equal(restoredLead.message,'À conserver');assert.deepEqual(restoredLead.notes.map(n=>n.text),['Deuxième visite']);
 assert.equal((await request('/api/agent/trash')).status,401);
});
await test('L’identité commune fusionne les éditions et suit les biens sans toucher aux présentations personnalisées',async()=>{
 const auth=process.env.ADMIN_TOKEN;
 assert.equal((await request('/api/agent/workspace')).status,401);
 const initial={name:'Agence commune',agentName:'Sophie Martin',email:'agence@example.com',phone:'0123456789',color:'#5865e9',logo:'https://example.com/logo.png'};
 const shared=await request('/api/agent/sync-workspace',{patch:initial,baseline:{}},auth);assert.equal(shared.status,200);
 const linked=await request('/api/agent/sync',{clientKey:'identity-linked-property',patch:{title:'Identité partagée',rooms:[],brandingMode:'workspace'}},auth);assert.equal(linked.data.property.agency.name,initial.name);assert.equal(linked.data.property.agent.name,initial.agentName);assert.equal(linked.data.property.agent.email,initial.email);assert.equal(linked.data.property.agent.phone,initial.phone);
 const custom=await request('/api/agent/sync',{clientKey:'identity-custom-property',patch:{title:'Identité spécifique',rooms:[],brandingMode:'custom',agency:{name:'Agence particulière'},agent:{name:'Présentateur spécifique'}}},auth);
 const renamed=await request('/api/agent/sync-workspace',{patch:{name:'Nouvelle agence'},baseline:initial},auth);assert.equal(renamed.status,200);
 const merged=await request('/api/agent/sync-workspace',{patch:{phone:'0987654321'},baseline:initial},auth);assert.equal(merged.data.workspace.name,'Nouvelle agence');assert.equal(merged.data.workspace.phone,'0987654321');
 const conflict=await request('/api/agent/sync-workspace',{patch:{name:'Valeur obsolète'},baseline:initial},auth);assert.equal(conflict.status,409);assert.equal(conflict.data.field,'workspace.name');
 const properties=(await request('/api/agent/properties',null,auth)).data;assert.equal(properties.find(p=>p.slug===linked.data.property.slug).agency.name,'Nouvelle agence');assert.equal(properties.find(p=>p.slug===custom.data.property.slug).agency.name,'Agence particulière');
 const retry=await request('/api/agent/sync',{clientKey:'identity-linked-property',slug:linked.data.property.slug,patch:{agency:{name:'Ancienne copie app'}},baseline:linked.data.property},auth);assert.equal(retry.status,200);assert.equal(retry.data.property.agency.name,'Nouvelle agence');
 const cleared=await request('/api/agent/sync-workspace',{patch:{logo:''},baseline:merged.data.workspace},auth);assert.equal(cleared.status,200);assert.equal((await request('/api/agent/properties',null,auth)).data.find(p=>p.slug===linked.data.property.slug).agency.logo,undefined);
 assert.equal((await request('/api/agent/sync-workspace',{patch:{logo:'javascript:alert(1)'}},auth)).status,400);
 assert.equal((await request('/api/agent/sync-workspace',{patch:{unknown:'x'}},auth)).status,400);for(const patch of [{color:'red'},{email:'invalid-email'},{website:'javascript:alert(1)'},{logo:'/media/'+'a'.repeat(32)+'.usdz'}])assert.equal((await request('/api/agent/sync-workspace',{patch},auth)).status,400);
 const stored=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir,'store.json'),'utf8'));assert.equal(stored.workspace.name,'Nouvelle agence');
});
await test('Les demandes acheteur conservent coordonnées et disponibilités sans inventer un intérêt',async()=>{
const created=await request('/api/agent/publish',{title:'Demandes client',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}]},process.env.ADMIN_TOKEN);
const slug=created.data.slug,opened=await request('/api/open?slug='+slug,{}),cookie=opened.cookie;
for(const kind of ['visit','callback','question','interest']){
 const response=await request('/api/contact?slug='+slug,{kind,name:'  Camille  ',email:' camille@example.com ',phone:' 0601020304 ',availability:'Vendredi après 18 h',message:'Demande '+kind,interest:'Très intéressé'},'',cookie);assert.equal(response.status,200);
}
const before=await request('/api/agent/activity',null,process.env.ADMIN_TOKEN);const leads=before.data.leads.filter(lead=>lead.slug===slug);assert.equal(leads.length,4);
for(const lead of leads){assert.equal(lead.name,'Camille');assert.equal(lead.email,'camille@example.com');assert.equal(lead.phone,'0601020304');assert.equal(lead.availability,'Vendredi après 18 h');assert.equal(lead.message,'Demande '+lead.kind);assert.equal(lead.interest,lead.kind==='interest'?'Très intéressé':'');}
const session=before.data.sessions.find(session=>session.id===leads[0].sessionId);assert.ok(session.events.some(event=>event.type==='visit_requested'));assert.ok(session.events.some(event=>event.type==='interest_submitted'));
for(const patch of [{email:'incorrect'},{email:'',phone:'   '},{phone:{}},{name:[]},{kind:'interest',interest:{unexpected:true}}])assert.equal((await request('/api/contact?slug='+slug,{kind:'question',name:'Camille',email:'camille@example.com',...patch},'',cookie)).status,400);
const after=await request('/api/agent/activity',null,process.env.ADMIN_TOKEN);assert.equal(after.data.leads.filter(lead=>lead.slug===slug).length,4);assert.deepEqual(after.data.sessions.find(item=>item.id===session.id).events,session.events);
});

await test('Le passage en privé bloque une ancienne session anonyme et conserve son identité après identification',async()=>{
const created=await request('/api/agent/publish',{title:'Invitation privée',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}]},process.env.ADMIN_TOKEN),slug=created.data.slug;
const anonymous=await request('/api/open?slug='+slug,{}),cookie=anonymous.cookie;
const properties=await request('/api/agent/properties',null,process.env.ADMIN_TOKEN),property=properties.data.find(item=>item.slug===slug);
assert.equal((await request('/api/agent/update',{slug,property:{...property,privacy:'Private'},baseline:property},process.env.ADMIN_TOKEN)).status,200);
assert.deepEqual((await request('/api/open?slug='+slug,{},'',cookie)).data,{gated:true});
assert.equal((await request('/api/event?slug='+slug,{type:'gallery_open'},'',cookie)).status,401);
for(const data of [{name:'   ',email:'camille@example.com'},{name:{},email:'camille@example.com'},{name:'Camille',email:'incorrect'}])assert.equal((await request('/api/open?slug='+slug,data,'',cookie)).status,400);
const accepted=await request('/api/open?slug='+slug,{name:'  Camille  ',email:' camille@example.com '},'',cookie);assert.equal(accepted.status,200);assert.deepEqual(accepted.data.lead,{name:'Camille',email:'camille@example.com'});assert.equal(accepted.cookie,cookie);
const again=await request('/api/open?slug='+slug,{},'',cookie);assert.equal(again.data.lead.name,'Camille');assert.ok(again.data.property);assert.equal((await request('/api/event?slug='+slug,{type:'gallery_open'},'',cookie)).status,200);
const activity=await request('/api/agent/activity',null,process.env.ADMIN_TOKEN);const sessions=activity.data.sessions.filter(item=>item.slug===slug);assert.equal(sessions.length,1);assert.equal(sessions[0].visits,3);assert.equal(sessions[0].lead.name,'Camille');
});

await test('Les photos importées produisent des formats mobiles sans modifier l’original ni exposer les médias d’un autre bien',async()=>{
const sharp=(await import('sharp')).default;const source=await sharp({create:{width:2400,height:1600,channels:3,background:'#9faca3'}}).jpeg({quality:95}).toBuffer();
const uploaded=await request('/api/agent/upload',{type:'image/jpeg',base64:source.toString('base64')},process.env.ADMIN_TOKEN);assert.equal(uploaded.status,201);assert.deepEqual(uploaded.data.media.sources.map(item=>item.width),[320,640,1280,1920]);
assert.deepEqual(Buffer.from(await (await fetch(base+uploaded.data.url)).arrayBuffer()),source);
for(const item of uploaded.data.media.sources){const buffer=Buffer.from(await (await fetch(base+item.url)).arrayBuffer());const meta=await sharp(buffer).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,item.width);assert.ok(Math.abs(meta.width/meta.height-1.5)<.01);if(item.width===320)assert.ok(buffer.length<source.length);}
const other=await request('/api/agent/upload',{type:'image/jpeg',base64:source.toString('base64')},process.env.ADMIN_TOKEN);
const property=await request('/api/agent/publish',{title:'Photos adaptées',rooms:[{id:'salon',name:'Salon',photos:[uploaded.data.url]}]},process.env.ADMIN_TOKEN);
const opened=await request('/api/open?slug='+property.data.slug,{});assert.deepEqual(opened.data.property.media[uploaded.data.url],uploaded.data.media);assert.equal(opened.data.property.media[other.data.url],undefined);
const disk=JSON.parse(await readFile(path.join(dir,'store.json'),'utf8'));assert.deepEqual(disk.media[uploaded.data.url],uploaded.data.media);
const {imageRenditions}=await import('./image-renditions.mjs');const oriented=await sharp({create:{width:400,height:200,channels:3,background:'#c0ccd0'}}).jpeg().withMetadata({orientation:6}).toBuffer();const outputs=await imageRenditions(oriented);assert.equal(outputs.length,1);assert.equal(outputs[0].width,200);assert.equal(outputs[0].height,400);
});

await test('L’import GLB valide le conteneur autonome et conserve ses octets',async()=>{
const {technicalGLB}=await import('./scripts/fixtures/technical-model.mjs');const model=technicalGLB();
const upload=await request('/api/agent/upload',{type:'model/gltf-binary',base64:model.toString('base64')},process.env.ADMIN_TOKEN);assert.equal(upload.status,201);assert.match(upload.data.url,/\.glb$/);assert.equal(upload.data.media,undefined);
const file=await fetch(base+upload.data.url);assert.equal(file.headers.get('content-type'),'model/gltf-binary');assert.deepEqual(Buffer.from(await file.arrayBuffer()),model);
const invalidLength=Buffer.from(model);invalidLength.writeUInt32LE(model.length+4,8);const invalidVersion=Buffer.from(model);invalidVersion.writeUInt32LE(1,4);
for(const invalid of [invalidLength,invalidVersion,model.subarray(0,20),technicalGLB({asset:{version:'1.0'}}),technicalGLB({buffers:[{uri:'missing.bin',byteLength:864}]})])assert.equal((await request('/api/agent/upload',{type:'model/gltf-binary',base64:invalid.toString('base64')},process.env.ADMIN_TOKEN)).status,400);
const property=await request('/api/agent/publish',{title:'Modèle technique',model3d:upload.data.url,rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}]},process.env.ADMIN_TOKEN);assert.equal(property.status,201);assert.equal((await request('/api/open?slug='+property.data.slug,{})).data.property.model3d,upload.data.url);
});

await test('Le lien iPhone exige une clé agent, se consomme une fois et expose le stockage réel',async()=>{
 assert.equal((await request('/api/agent/pair',{})).status,401);
 const config=await request('/api/agent/connection',null,process.env.ADMIN_TOKEN);assert.equal(config.data.database,'json');
 const pair=await request('/api/agent/pair',{},process.env.ADMIN_TOKEN);assert.equal(pair.status,201);assert.equal(pair.data.token,undefined);
 const redeemed=await request('/api/mobile/pair',{code:pair.data.code});assert.equal(redeemed.status,200);assert.equal(redeemed.data.token,process.env.ADMIN_TOKEN);
 assert.equal((await request('/api/mobile/pair',{code:pair.data.code})).status,401);
});

await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});

await test('Les imports rejettent les médias dangereux et ne publient aucun identifiant interne',async()=>{const {validateProperty}=await import('./property-data.mjs');const base={title:'Bien',rooms:[{id:'salon',name:'Salon',photos:['https://example.com/a.jpg']}]};assert.throws(()=>validateProperty({...base,hero:'javascript:alert(1)'}));assert.throws(()=>validateProperty({...base,rooms:[...base.rooms,...base.rooms]}));assert.throws(()=>validateProperty({...base,floorplan:{image:'https://example.com/plan.png',zones:[{room:'salon',x:90,y:0,width:20,height:10}]}}));assert.equal(validateProperty({...base,internalId:'secret'}).internalId,undefined);const details=validateProperty({...base,listingType:'Maison',transaction:'Location',floor:-1,bathrooms:2,charges:1200});assert.equal(details.floor,-1);assert.equal(details.transaction,'Location');assert.equal(details.charges,1200);assert.throws(()=>validateProperty({...base,bedrooms:2.5}));});

await test('Une génération interrompue restitue le crédit au redémarrage',async()=>{
const {writeFile,readFile}=await import('node:fs/promises');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const recoveryDir=await mkdtemp(path.join(os.tmpdir(),'propertytwin-recovery-'));
try{await writeFile(path.join(recoveryDir,'store.json'),JSON.stringify({properties:[{slug:'test',credits:2}],sessions:[{slug:'test',generating:true}],variants:[],leads:[],links:[]}));await promisify(execFile)(process.execPath,['--input-type=module','-e',"await import('./server.mjs')"],{cwd:path.dirname(new URL(import.meta.url).pathname),env:{...process.env,DATA_DIR:recoveryDir}});const store=JSON.parse(await readFile(path.join(recoveryDir,'store.json'),'utf8'));assert.equal(store.properties[0].credits,3);assert.equal(store.sessions[0].generating,false);}finally{await rm(recoveryDir,{recursive:true,force:true});}
});

await test('Le backend peut renvoyer une image binaire, base64 ou URL HTTPS',async()=>{
const {providerImage}=await import('./image-result.mjs');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS6kAAAAASUVORK5CYII=','base64');
assert.ok((await providerImage(new Response(png,{headers:{'content-type':'image/png'}}))).startsWith('data:image/png;base64,'));
assert.ok((await providerImage(new Response(JSON.stringify({image_base64:png.toString('base64')})))).startsWith('data:image/png;base64,'));
assert.equal(await providerImage(new Response(JSON.stringify({image_url:'https://example.com/variant.jpg'}))),'https://example.com/variant.jpg');
await assert.rejects(providerImage(new Response(JSON.stringify({image_base64:'aGVsbG8='}))));
await assert.rejects(providerImage(new Response(JSON.stringify({image_url:'http://example.com/variant.jpg'}))));
});
