import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import * as maskEngine from './public/mask-history.mjs';
import {defaultRouting} from './ai-routing.mjs';
import * as retouchEngine from './public/retouch-engine.mjs';
const html=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
const fastJobTimers=w=>{const timeout=w.setTimeout.bind(w);w.setTimeout=(callback,delay,...args)=>timeout(callback,delay===1000?0:delay,...args);};

await test('L’historique agent conserve les branches, renomme, favorise, supprime et restaure sans déclencher de génération',async()=>{
 const photo='https://example.com/root.jpg',calls=[],property={slug:'history',title:'Historique',status:'Draft',privacy:'Unlisted',credits:8,agency:{},agent:{},features:[],rooms:[{id:'salon',name:'Salon',photos:[photo]}]};
 const variants=[{id:'parent',slug:'history',room:'salon',original:photo,image:'https://example.com/parent.png',label:'Japandi',revision:1},{id:'child',slug:'history',room:'salon',original:photo,image:'https://example.com/child.png',label:'Japandi et parquet',parentVariantId:'parent',revision:1}];
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  calls.push({url,body});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/variants')return variants.map(v=>v.deletedAt?{...v,image:undefined,label:'Version supprimée'}:v);
  if(url==='/api/agent/variant'){const v=variants.find(v=>v.id===body.id);assert.equal(body.slug,'history');assert.equal(body.revision,v.revision);Object.assign(v,body.patch);v.revision++;if(body.patch.deleted)v.deletedAt='2026-10-06T12:00:00Z';if(body.patch.deleted===false)delete v.deletedAt;return v.deletedAt?{...v,image:undefined,label:'Version supprimée'}:v;}return {};
 },w=>{w.confirm=()=>true;});
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();await settle();
  assert.match(d.querySelector('[data-variant-node="child"] .variant-parent-label').textContent,/Japandi/);assert.equal(d.querySelector('[data-variant-node="child"]').style.getPropertyValue('--variant-depth'),'1');
  d.querySelector('[data-variant-favorite="parent"]').click();await settle();assert.equal(d.querySelector('[data-variant-favorite="parent"]').getAttribute('aria-pressed'),'true');
  d.querySelector('[data-variant-rename="parent"]').click();const dialog=d.querySelector('.variant-rename-dialog');dialog.querySelector('input').value='Salon <Japandi>';dialog.querySelector('form').requestSubmit();await settle();assert.equal(d.querySelector('.variant-rename-dialog'),null);assert.equal(d.querySelector('[data-variant-node="parent"] strong').textContent,'Salon <Japandi>');assert.match(d.querySelector('[data-variant-node="child"] .variant-parent-label').textContent,/Salon <Japandi>/);
  d.querySelector('[data-agent-variant="parent"]').click();assert.equal(d.querySelector('#agent-compare .agent-after').getAttribute('src'),variants[0].image);
  d.querySelector('[data-variant-delete="parent"]').click();await settle();assert.equal(d.querySelector('[data-variant-node="parent"] img'),null);assert.ok(d.querySelector('[data-variant-node="child"] img'));assert.equal(d.querySelector('#agent-compare .agent-after'),null);
  d.querySelector('[data-variant-restore="parent"]').click();await settle();assert.ok(d.querySelector('[data-variant-node="parent"] img'));assert.equal(variants[0].revision,5);assert.equal(property.credits,8);assert.equal(calls.some(c=>c.url==='/api/agent/generate'),false);
 }finally{dom.window.close();}
});

await test('Un conflit de nom conserve la saisie, montre la valeur distante et permet une nouvelle sauvegarde vérifiée',async()=>{
 const photo='https://example.com/photo.jpg',property={slug:'rename-conflict',title:'Conflit',status:'Draft',privacy:'Unlisted',credits:4,agency:{},agent:{},features:[],rooms:[{id:'salon',name:'Salon',photos:[photo]}]};
 const variant={id:'version',slug:property.slug,room:'salon',original:photo,image:photo,label:'Initial',revision:1};let mutations=0;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/variants')return [{...variant}];
  if(url==='/api/agent/variant'){mutations++;if(mutations===1){variant.label='Autre agent';variant.revision=2;return new Response(JSON.stringify({message:'Modification simultanée'}),{status:409});}assert.equal(body.revision,2);variant.label=body.patch.label;variant.revision=3;return variant;}return {};
 });
 try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();await settle();d.querySelector('[data-variant-rename]').click();const dialog=d.querySelector('.variant-rename-dialog');dialog.querySelector('input').value='Mon nom souhaité';dialog.querySelector('form').requestSubmit();await settle();assert.equal(dialog.querySelector('input').value,'Mon nom souhaité');assert.match(dialog.querySelector('[role=alert]').textContent,/Autre agent/);dialog.querySelector('form').requestSubmit();await settle();assert.equal(d.querySelector('.variant-rename-dialog'),null);assert.equal(d.querySelector('[data-variant-node] strong').textContent,'Mon nom souhaité');assert.equal(mutations,2);}finally{dom.window.close();}
});

await test('Continuer une version envoie son identifiant avec l’original et le téléchargement conserve les octets sans transmettre le jeton',async()=>{
 const photo='/media/'+'a'.repeat(32)+'.png',resultImage='data:image/png;base64,AQIDBA==',calls=[],downloads=[],property={slug:'branch',title:'Branches',status:'Draft',privacy:'Unlisted',credits:8,agency:{},agent:{},features:[],rooms:[{id:'salon',name:'Salon',photos:[photo]}]};
 const variants=[{id:'parent',slug:'branch',room:'salon',original:photo,image:resultImage,label:'Japandi',revision:1}];let maskPhoto,maskSubmit;
 const dom=await domAt('http://localhost/agent',async(url,body,options)=>{
  calls.push({url,body,options});if(url===resultImage)return new Response(Uint8Array.from([1,2,3,4]),{headers:{'Content-Type':'image/png'}});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/variants')return variants;
  if(url==='/api/agent/generate')return {id:'child',slug:'branch',room:body.room,original:body.photo,image:resultImage,label:'Parquet',parentVariantId:body.parentVariantId,credits:7};return {};
 },w=>{w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:http://localhost/fixture';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,href:this.href});};});
 try{
  const w=dom.window,d=w.document;w.PropertyTwinMaskEditor=({photo,onSubmit})=>{maskPhoto=photo;maskSubmit=onSubmit;};
  d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();await settle();
  d.querySelector('[data-variant-download="parent"]').click();await settle();assert.equal(downloads[0].size,4);assert.equal(downloads[1].name,'propertytwin-parent.png');const download=calls.find(c=>c.url===resultImage);assert.equal(download.options.credentials,'omit');assert.equal(download.options.headers,undefined);
  d.querySelector('[data-variant-source="parent"]').click();assert.match(d.querySelector('.studio-source-context').textContent,/Japandi/);d.querySelector('#magic-eraser').click();assert.equal(maskPhoto.url,resultImage);
  await maskSubmit({base64:'technical-mask',width:20,height:20},'Retirer un objet',()=>{});await settle();const request=calls.find(c=>c.url==='/api/agent/generate').body;assert.equal(request.parentVariantId,'parent');assert.equal(request.photo,photo);assert.equal(request.sourceImage,undefined);assert.equal(request.mask.base64,'technical-mask');assert.ok(d.querySelector('[data-variant-node="child"]'));
  d.querySelector('[data-variant-original]').click();assert.match(d.querySelector('.studio-source-context').textContent,/photo originale/);await settle();
 }finally{dom.window.close();}
});
function setupRetouchPreview(w){
 w.PropertyTwinRetouch=retouchEngine;w.requestAnimationFrame=callback=>{callback();return 1;};w.cancelAnimationFrame=()=>{};
 w.Image=class{naturalWidth=20;naturalHeight=20;set src(value){this.url=value;queueMicrotask(()=>this.onload());}};
 w.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
 w.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {drawImage(){},getImageData(_x,_y,width,height){return {width,height,data:Uint8ClampedArray.from(Array(width*height).fill([70,75,85,255]).flat())};},putImageData(image){canvas.pixels=image;}};};
 w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
}
async function domAt(url,handler,setup=()=>{}){const dom=new JSDOM(html,{url,runScripts:'outside-only'});const w=dom.window;w.structuredClone=structuredClone;w.crypto.randomUUID=()=> 'test-room-'+Math.random().toString(36).slice(2);w.fetch=async(url,options={})=>{const result=await handler(url,typeof options.body==='string'?JSON.parse(options.body):options.body,options);return result instanceof Response?result:new Response(JSON.stringify(result));};w.IntersectionObserver=class{observe(){}unobserve(){}};w.ResizeObserver=class{observe(){}};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;this.dispatchEvent(new w.Event('close'));};setup(w);vm.runInContext(script,dom.getInternalVMContext());await settle();return dom;}
await test('Le dashboard agent édite un bien et conserve ses identifiants de pièces',async()=>{const calls=[];const saved={title:'Bien préparé',slug:'bien-test',status:'Draft',privacy:'Unlisted',agency:{name:'Agence'},agent:{name:'Sophie'},credits:3,features:[],rooms:[{id:'original-room',name:'Salon',photos:['https://example.com/one.jpg']}]};const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return [saved];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/update'){Object.assign(saved,body.property);return {url:'/p/bien-test'};}return {url:'/p/bien-test'};});try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();assert.ok(d.querySelector('.agent-sidebar'));d.querySelector('[data-open]').click();const form=d.querySelector('#editor-form');assert.equal(form.elements.title.value,'Bien préparé');form.elements.title.value='Titre modifié';form.elements['agency.name'].value='Agence Victor';form.elements['agent.firstName'].value='Sophie';form.elements['agent.email'].value='sophie@example.com';form.elements.transaction.value='Location';form.elements.listingType.value='Maison';form.elements.floor.value='-1';form.elements.charges.value='1200';form.elements.title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.querySelector('#save-draft').click();await settle();const update=calls.find(c=>c.url==='/api/agent/update');assert.ok(update);assert.equal(update.body.slug,'bien-test');assert.equal(update.body.property.title,'Titre modifié');assert.equal(update.body.property.agency.name,'Agence Victor');assert.equal(update.body.property.agent.firstName,'Sophie');assert.equal(update.body.property.agent.email,'sophie@example.com');assert.equal(update.body.property['agency.name'],undefined);assert.equal(update.body.property.transaction,'Location');assert.equal(update.body.property.listingType,'Maison');assert.equal(update.body.property.floor,-1);assert.equal(update.body.property.charges,1200);assert.equal(update.body.property.rooms[0].id,'original-room');assert.match(d.querySelector('#notice').textContent,/Dossier enregistré/);}finally{dom.window.close();}});

await test('La médiathèque déplace les photos entre pièces, annule et enregistre sans toucher au scan ni aux originaux',async()=>{
 const a='https://example.com/a.jpg',b='https://example.com/b.jpg',calls=[];
 const property={title:'Photos',slug:'photos',status:'Draft',privacy:'Unlisted',credits:5,features:[],agency:{},agent:{},hero:a,rooms:[{id:'salon',name:'Salon',photos:[a,b]},{id:'chambre',name:'Chambre',photos:[]}],media:{[a]:{thumbnail:'https://example.com/thumb.jpg'}},scans:[{room:'salon',geometry:'source-untouched'}],floorplan:{image:'https://example.com/plan.png',zones:[{room:'salon',x:0,y:0,width:20,height:30}]}};
 const originalData=structuredClone({scans:property.scans,floorplan:property.floorplan,media:property.media});
 const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/update')Object.assign(property,body.property);return {ok:true};});
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Photos"]').click();
  assert.equal(d.querySelector('#undo-photos').disabled,true);
  const move=()=>{const field=d.querySelector('[data-photo-room="0,0"]');field.value='chambre';field.dispatchEvent(new dom.window.Event('change'));};move();
  assert.equal(d.querySelectorAll('[data-room-editor="salon"] article').length,1);assert.equal(d.querySelectorAll('[data-room-editor="chambre"] article').length,1);
  d.querySelector('#undo-photos').click();assert.equal(d.querySelectorAll('[data-room-editor="salon"] article').length,2);assert.equal(d.querySelector('#redo-photos').disabled,false);
  d.querySelector('#redo-photos').click();d.querySelector('[data-duplicate-photo="1,0"]').click();d.querySelector('[data-remove-photo="1,0"]').click();assert.match(d.querySelector('[data-cover="1,0"]').textContent,/★/);
  d.querySelector('#undo-photos').click();d.querySelector('#undo-photos').click();d.querySelector('[data-cover="0,0"]').click();assert.equal(d.querySelector('#redo-photos').disabled,true);
  d.querySelector('[data-editor-tab="Informations"]').click();d.querySelector('#editor-form').elements.title.value='Titre conservé';d.querySelector('[data-editor-tab="Photos"]').click();d.querySelector('#undo-photos').click();
  assert.match(d.querySelector('[data-cover="1,0"]').textContent,/★/);d.querySelector('#save-draft').click();await settle();
  const saved=calls.find(c=>c.url==='/api/agent/update').body.property;
  assert.deepEqual(saved.rooms.map(r=>({id:r.id,photos:r.photos})),[{id:'salon',photos:[b]},{id:'chambre',photos:[a]}]);assert.equal(saved.hero,a);assert.equal(saved.title,'Titre conservé');assert.equal(saved.credits,5);
  assert.deepEqual(saved.scans,originalData.scans);assert.deepEqual(saved.floorplan,originalData.floorplan);assert.deepEqual(saved.media,originalData.media);assert.equal(calls.some(c=>/upload|generate|photo-edit/.test(c.url)),false);
  assert.equal(d.querySelector('#undo-photos').disabled,true);
 }finally{dom.window.close();}
});

await test('La médiathèque refuse une pièce pleine et réinitialise l’historique après un changement de pièces',async()=>{
 const a='https://example.com/a.jpg',b='https://example.com/b.jpg';
 const property={title:'Photos',slug:'photos',status:'Draft',privacy:'Unlisted',credits:5,features:[],agency:{},agent:{},hero:a,rooms:[{id:'salon',name:'Salon',photos:[a]},{id:'chambre',name:'Chambre',photos:Array(100).fill(b)}]};let saved;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/update'){saved=body.property;Object.assign(property,saved);}return {ok:true};},w=>{w.confirm=()=>true;});
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Photos"]').click();
  const destination=d.querySelector('[data-photo-room="0,0"]');destination.value='chambre';destination.dispatchEvent(new dom.window.Event('change'));assert.match(d.querySelector('#notice').textContent,/100 photos/);assert.equal(d.querySelector('#undo-photos').disabled,true);assert.equal(d.querySelectorAll('[data-room-editor="salon"] article').length,1);
  d.querySelector('[data-duplicate-photo="1,0"]').click();assert.equal(d.querySelectorAll('[data-room-editor="chambre"] article').length,100);
  d.querySelector('[data-duplicate-photo="0,0"]').click();d.querySelector('[data-room-name="0"]').value='Salon renommé';d.querySelector('[data-room-name="0"]').dispatchEvent(new dom.window.Event('input'));d.querySelector('#undo-photos').click();assert.equal(d.querySelector('[data-room-name="0"]').value,'Salon renommé');
  d.querySelector('[data-duplicate-photo="0,0"]').click();d.querySelector('#add-room').click();assert.equal(d.querySelector('#undo-photos').disabled,true);assert.equal(d.querySelector('#redo-photos').disabled,true);
  d.querySelector('[data-remove-room="0"]').click();d.querySelector('#save-draft').click();await settle();assert.equal(saved.hero,b);assert.equal(saved.rooms.length,2);assert.equal(saved.rooms.some(r=>r.id==='salon'),false);
 }finally{dom.window.close();}
});
await test('Le studio transforme la photo choisie et rouvre la bonne pièce pour une variante',async()=>{const calls=[];const property={title:'Appartement',hero:'https://example.com/one.jpg',agency:{name:'Agence'},agent:{firstName:'Sophie'},rooms:[{id:'salon',name:'Salon',photos:['https://example.com/one.jpg','https://example.com/two.jpg']},{id:'chambre',name:'Chambre',photos:['https://example.com/three.jpg']}],features:[],privacy:'Unlisted'};const dom=await domAt('http://localhost/p/appartement',async(url,body)=>{calls.push({url,body});if(url.startsWith('/api/open'))return {property,variants:[]};if(url.startsWith('/api/generate'))return {id:'variant-one',room:body.room,original:body.photo,image:'https://example.com/variant.jpg',label:body.prompt};return {ok:true};});try{await settle();const d=dom.window.document;assert.ok(d.querySelector('#generate'));d.querySelector('[data-source="1"]').click();d.querySelector('#prompt').value='Un bureau';d.querySelector('#generate').click();await settle();assert.equal(calls.find(c=>c.url.startsWith('/api/generate')).body.photo,'https://example.com/two.jpg');assert.ok(d.querySelector('.compare'));d.querySelector('#studio-tabs [data-room="chambre"]').click();d.querySelector('[data-version]').click();assert.equal(d.querySelector('#room-name').textContent,'Salon');d.querySelector('#interest-cta').click();assert.equal(d.querySelector('[name=kind]').value,'interest');assert.equal(d.querySelector('[name=interest]').closest('label').hidden,false);}finally{dom.window.close();}});

await test('La fiche prospect enregistre le statut et la note et le filtre suit le changement',async()=>{
const lead={id:'lead-one',name:'Paul',email:'paul@example.com',slug:'bien',sessionId:'session-paul',stage:'new',notes:[],kind:'interest'};const calls=[];
const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return [];if(url==='/api/agent/activity')return {sessions:[{id:'session-paul',visits:4,events:[{type:'session_duration',duration:758},{type:'ai_generation',room:'salon',at:'2026-10-05T14:08:00Z'}]}],variants:[],leads:[lead]};if(url==='/api/agent/lead'){if(body.stage)lead.stage=body.stage;if(body.note)lead.notes.push({text:body.note,at:new Date().toISOString()});}return {ok:true};});
try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-page="leads"]').click();assert.ok(d.querySelector('#lead-filter'));d.querySelector('[data-lead]').click();assert.match(d.querySelector('.lead-activity-summary').textContent,/12 min 38 s/);assert.match(d.querySelector('.lead-timeline').textContent,/Transformation créée/);const stage=d.querySelector('#lead-stage');stage.value='qualified';stage.dispatchEvent(new dom.window.Event('change'));await settle();assert.equal(lead.stage,'qualified');assert.match(d.querySelector('.lead-stage-badge').textContent,/Qualifié/);const form=d.querySelector('#lead-note-form');form.elements.note.value='Deuxième visite souhaitée';form.requestSubmit();await settle();assert.equal(lead.notes[0].text,'Deuxième visite souhaitée');assert.ok(calls.some(c=>c.url==='/api/agent/lead'&&c.body.note==='Deuxième visite souhaitée'));}finally{dom.window.close();}
});

await test('Le partage après visite utilise le message modifié dans chaque canal',async()=>{
const property={title:'Victor Hugo',slug:'victor',status:'Unlisted',privacy:'Unlisted',rooms:[],features:[],agency:{},agent:{name:'Sophie'}};
const dom=await domAt('http://localhost/agent',async(url)=>{if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/qr')return {image:'data:image/png;base64,fixture'};return {url:'/v/victor/secure-link'};});
try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Diffusion"]').click();const visibility=d.querySelector('#property-privacy');visibility.value='Public';visibility.dispatchEvent(new dom.window.Event('change'));assert.equal(d.querySelector('#indexable-control').hidden,false);d.querySelector('#property-indexable').checked=true;d.querySelector('#property-indexable').dispatchEvent(new dom.window.Event('change'));visibility.value='Unlisted';visibility.dispatchEvent(new dom.window.Event('change'));assert.equal(d.querySelector('#indexable-control').hidden,true);assert.equal(d.querySelector('#property-indexable').checked,false);const form=d.querySelector('#client-link-form');form.elements.name.value='Paul';form.elements.email.value='paul@example.com';form.elements.phone.value='+33612345678';form.requestSubmit();await settle();assert.equal(d.querySelector('#property-qr a').download,'propertytwin-victor.png');assert.match(d.querySelector('#property-qr img').src,/data:image\/png/);const message=d.querySelector('#client-share-message');assert.match(message.value,/Bonjour Paul/);assert.match(message.value,/http:\/\/localhost\/v\/victor\/secure-link/);message.value='Paul, voici votre logement & vos photos.';message.dispatchEvent(new dom.window.Event('input'));for(const id of ['client-whatsapp','client-email','client-sms']){const url=new URL(d.querySelector('#'+id).href);assert.equal(url.searchParams.get(id==='client-whatsapp'?'text':'body'),message.value);}assert.match(d.querySelector('#client-email').href,/paul%40example.com/);assert.match(d.querySelector('#client-whatsapp').href,/wa.me\/33612345678/);}finally{dom.window.close();}
});

await test('L’import USDZ conserve les octets et enregistre le modèle sur le bien',async()=>{
const calls=[],property={title:'Scan',slug:'scan',status:'Draft',privacy:'Unlisted',rooms:[],features:[],agency:{},agent:{},credits:3};
const bytes=Uint8Array.from([80,75,3,4,0,0,0,0,0,0,0,0]);
const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/upload')return {url:'/media/'+ 'a'.repeat(32)+'.usdz'};if(url==='/api/agent/update')Object.assign(property,body.property);return {ok:true};});
try{const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Plans & 3D"]').click();const input=d.querySelector('#upload-model');Object.defineProperty(input,'files',{value:[new w.File([bytes],'scan.usdz',{type:'application/octet-stream'})]});input.dispatchEvent(new w.Event('change'));for(let i=0;i<30&&!calls.some(c=>c.url==='/api/agent/upload');i++)await new Promise(resolve=>setTimeout(resolve,5));await settle();const upload=calls.find(c=>c.url==='/api/agent/upload');assert.equal(upload.body.type,'model/vnd.usdz+zip');assert.deepEqual(Buffer.from(upload.body.base64,'base64'),Buffer.from(bytes));d.querySelector('#save-draft').click();await settle();assert.equal(calls.find(c=>c.url==='/api/agent/update').body.property.model3d,'/media/'+ 'a'.repeat(32)+'.usdz');}finally{dom.window.close();}
});

await test('Modifier le modèle web conserve le modèle iPhone associé',async()=>{
const property={title:'Modèle',slug:'model',status:'Draft',privacy:'Unlisted',rooms:[{id:'salon',name:'Salon',photos:[]}],floorplan:{image:'https://example.com/plan.png',zones:[]},features:[],agency:{},agent:{},model3d:{src:'https://example.com/old.glb',iosSrc:'https://example.com/scan.usdz'}};let updated;
const dom=await domAt('http://localhost/agent',async(url,body)=>{if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/update'){updated=body.property;Object.assign(property,updated);}return {ok:true};});
try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Plans & 3D"]').click();const canvas=d.querySelector('#plan-zone-canvas');canvas.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});canvas.setPointerCapture=()=>{};canvas.onpointerdown({clientX:20,clientY:10,button:0,pointerId:1,preventDefault(){}});canvas.onpointerup({clientX:100,clientY:60});assert.equal(d.querySelectorAll('#plan-zone-overlays span').length,1);const input=d.querySelector('[data-asset="model"]');input.value='https://example.com/new.glb';input.dispatchEvent(new dom.window.Event('change'));d.querySelector('#save-draft').click();await settle();assert.deepEqual(updated.floorplan.zones,[{room:'salon',x:10,y:10,width:40,height:50}]);assert.deepEqual(updated.model3d,{src:'https://example.com/new.glb',iosSrc:'https://example.com/scan.usdz'});}finally{dom.window.close();}
});

await test('Les nouvelles demandes arrivent sans rechargement et sans interrompre l’éditeur',async()=>{
let tick,leads=[],activityCalls=0;
const dom=await domAt('http://localhost/agent',async(url)=>{if(url==='/api/agent/properties')return [];if(url==='/api/agent/activity'){activityCalls++;return {sessions:[],variants:[],leads};}return {ok:true};},w=>{w.setInterval=(fn,ms)=>{if(ms===10000)tick=fn;return 1;};Object.defineProperty(w.document,'hidden',{value:false});});
try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-page="leads"]').click();leads=[{id:'new-lead',name:'Paul',slug:'bien',kind:'visit',stage:'new'}];await tick();assert.match(d.querySelector('.agent-table').textContent,/Paul/);assert.equal(d.querySelector('[data-page="leads"] small').textContent,'1');d.querySelector('#new-property').click();const before=activityCalls;await tick();assert.equal(activityCalls,before);assert.ok(d.querySelector('#editor-form'));}finally{dom.window.close();}
});

await test('Les données app restent éditables sur le web avec leur état précédent',async()=>{
const property={title:'Dossier synchronisé',slug:'shared',status:'Draft',privacy:'Unlisted',rooms:[],agency:{},agent:{},features:[]};
const record={id:'shared-variant',slug:'shared',kind:'variant',data:{title:'Salon',style:'Japandi',isFavorite:false}};let saved;
const dom=await domAt('http://localhost/agent',async(url,body)=>{if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/records')return {records:[record]};if(url==='/api/agent/sync-record'){saved=structuredClone(body);Object.assign(record.data,body.patch);return {record};}return {};});
try{const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Données app"]').click();await settle();const form=d.querySelector('[data-business-record]');form.elements.title.value='Salon révisé';form.elements.isFavorite.value='true';form.requestSubmit();await settle();assert.equal(saved.id,'shared-variant');assert.equal(saved.patch.title,'Salon révisé');assert.equal(saved.patch.isFavorite,true);assert.equal(saved.baseline.title,'Salon');assert.equal(saved.baseline.isFavorite,false);assert.match(d.querySelector('#notice').textContent,/disponibles pour l’app/);}finally{dom.window.close();}
});

await test('La corbeille du dashboard retire et restaure le même dossier',async()=>{
const property={slug:'trash-example',title:'Bien conservé',location:'Lyon',status:'Unlisted',privacy:'Unlisted',rooms:[],agency:{},agent:{},features:[]};let removed=false;const calls=[];
const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return removed?[]:[property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/trash')return {properties:removed?[{...property,deletedAt:'2026-10-05T18:00:00Z'}]:[]};if(url==='/api/agent/removal'){removed=body.removed;return {property:{...property,...(removed?{deletedAt:'2026-10-05T18:00:00Z'}:{})}};}return {};},w=>{w.confirm=()=>true;});
try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('#delete-property').click();await settle();assert.equal(removed,true);assert.equal(d.querySelector('[data-open]'),null);d.querySelector('[data-page="trash"]').click();await settle();assert.match(d.querySelector('#property-trash').textContent,/Bien conservé/);d.querySelector('[data-restore-property]').click();await settle();assert.equal(removed,false);d.querySelector('[data-page="properties"]').click();assert.ok(d.querySelector('[data-open="trash-example"]'));assert.deepEqual(calls.filter(c=>c.url==='/api/agent/removal').map(c=>c.body.removed),[true,false]);}finally{dom.window.close();}
});

await test('Les paramètres d’agence viennent du serveur et alimentent les nouveaux biens',async()=>{
let workspace={name:'Agence commune',agentName:'Sophie Martin',email:'agence@example.com',color:'#5865e9'};const calls=[];
const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return [];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/workspace')return {workspace};if(url==='/api/agent/sync-workspace'){Object.assign(workspace,body.patch);return {workspace};}return {};});
try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-page="settings"]').click();const form=d.querySelector('#agency-settings');assert.equal(form.elements.name.value,'Agence commune');form.elements.agentEmail.value='sophie@example.com';form.requestSubmit();await settle();const saved=calls.find(c=>c.url==='/api/agent/sync-workspace');assert.deepEqual(saved.body.patch,{agentEmail:'sophie@example.com'});assert.equal(saved.body.baseline.name,'Agence commune');assert.equal(dom.window.localStorage.getItem('pt-agency-settings'),null);d.querySelector('#new-property').click();assert.equal(d.querySelector('#property-branding-mode').value,'workspace');assert.equal(d.querySelector('[name="agency.name"]').value,'Agence commune');assert.equal(d.querySelector('[name="agency.name"]').disabled,true);d.querySelector('#property-branding-mode').value='custom';d.querySelector('#property-branding-mode').dispatchEvent(new dom.window.Event('change'));assert.equal(d.querySelector('[name="agency.name"]').disabled,false);}finally{dom.window.close();}
});

await test('Choisir la valeur commune après conflit conserve les autres changements du formulaire',async()=>{
let workspace={name:'Nom initial',agentEmail:'old@example.com'};
const dom=await domAt('http://localhost/agent',async(url,body)=>{if(url==='/api/agent/properties')return [];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/workspace')return {workspace};if(url==='/api/agent/sync-workspace'){for(const [field,value] of Object.entries(body.patch))if((workspace[field]||'')!==(body.baseline[field]||'')&&(workspace[field]||'')!==value)return new Response(JSON.stringify({message:'Modification simultanée',field:'workspace.'+field}),{status:409});Object.assign(workspace,body.patch);return {workspace};}return {};});
try{const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-page="settings"]').click();let form=d.querySelector('#agency-settings');form.elements.name.value='Nom local';form.elements.agentEmail.value='new@example.com';workspace.name='Nom sur le serveur';form.requestSubmit();await settle();assert.ok(d.querySelector('#workspace-conflict'));d.querySelector('[data-workspace-choice="web"]').click();await settle();assert.equal(workspace.name,'Nom sur le serveur');assert.equal(workspace.agentEmail,'new@example.com');form=d.querySelector('#agency-settings');form.elements.name.value='Nom local choisi';workspace.name='Autre nom serveur';form.requestSubmit();await settle();d.querySelector('[data-workspace-choice="local"]').click();await settle();assert.equal(workspace.name,'Nom local choisi');}finally{dom.window.close();}
});

await test('Le conflit du bien conserve les autres saisies et propose les deux versions',async()=>{
 let property={slug:'concurrent-property',title:'Titre initial',location:'Paris',description:'Initial',status:'Draft',credits:5,privacy:'Unlisted',rooms:[],agency:{},agent:{},features:[]};
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return [property];
  if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};
  if(url==='/api/agent/workspace')return {workspace:{}};
  if(url==='/api/agent/update'){
   assert.ok(body.baseline);
   for(const field of ['title','description'])if(body.property[field]!==body.baseline[field]&&property[field]!==body.baseline[field]&&property[field]!==body.property[field])return new Response(JSON.stringify({message:'Conflit',field}),{status:409});
   for(const field of ['title','description'])if(body.property[field]!==body.baseline[field])property[field]=body.property[field];
   return {ok:true,property};
  }
  return {};
 });
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();
  d.querySelector('[name="title"]').value='Titre saisi sur le web';d.querySelector('[name="description"]').value='Description à garder';property.title='Titre app';
  d.querySelector('#save-draft').click();await settle();assert.ok(d.querySelector('#property-conflict'));assert.equal(dom.window.document.querySelector('#app').inert,false);
  d.querySelector('[data-property-choice="server"]').click();await settle();assert.equal(property.title,'Titre app');assert.equal(property.description,'Description à garder');assert.equal(d.querySelector('[name="title"]').value,'Titre app');
  d.querySelector('[name="title"]').value='Titre web choisi';property.title='Autre titre app';d.querySelector('#save-draft').click();await settle();d.querySelector('[data-property-choice="local"]').click();await settle();assert.equal(property.title,'Titre web choisi');
 }finally{dom.window.close();}
});

await test('Une requête bloquée expire et rend la main sans perdre les saisies',async()=>{
 const property={slug:'timeout-property',title:'Titre initial',location:'Paris',description:'',status:'Draft',credits:5,privacy:'Unlisted',rooms:[],agency:{},agent:{},features:[]};
 let hanging=true,saved=false;const timers=new Map();let timerID=-1;
 const dom=await domAt('http://localhost/agent',async(url,body,options)=>{
  if(url==='/api/agent/properties')return [property];
  if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};
  if(url==='/api/agent/workspace')return {workspace:{}};
  if(url==='/api/agent/update'){
   if(hanging)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Aborted transport')),{once:true}));
   Object.assign(property,body.property);saved=true;return {ok:true};
  }
  return {};
 },w=>{
  const schedule=w.setTimeout.bind(w),clear=w.clearTimeout.bind(w);
  w.setTimeout=(callback,delay,...args)=>{if(delay===120000||delay===180000){const id=timerID--;timers.set(id,callback);return id;}return schedule(callback,delay,...args);};
  w.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else clear(id);};
 });
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();assert.equal(timers.size,0);
  d.querySelector('[data-open]').click();d.querySelector('[name="title"]').value='Saisie à conserver';d.querySelector('#save-draft').click();await settle();
  assert.equal(d.querySelector('#app').inert,true);assert.equal(timers.size,1);[...timers.values()][0]();await settle();
  assert.equal(d.querySelector('#app').inert,false);assert.equal(d.querySelector('#save-draft').disabled,false);assert.equal(d.querySelector('[name="title"]').value,'Saisie à conserver');assert.match(d.querySelector('#notice').textContent,/serveur tarde/);assert.match(d.querySelector('#save-state').textContent,/reprendre/);assert.equal(timers.size,0);
  hanging=false;d.querySelector('#save-draft').click();await settle();assert.equal(saved,true);assert.equal(property.title,'Saisie à conserver');assert.equal(timers.size,0);
 }finally{dom.window.close();}
});

await test('La création web retrouve le dossier après une réponse perdue sans doublon',async()=>{
 const properties=[];let createCalls=0,updateCalls=0;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return properties;
  if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};
  if(url==='/api/agent/workspace')return {workspace:{}};
  if(url==='/api/agent/sync'){
   createCalls++;properties.push({...body.patch,slug:'created-on-web',syncKey:body.clientKey,status:'Draft'});
   throw new TypeError('Response lost after server commit');
  }
  if(url==='/api/agent/update'){
   updateCalls++;assert.equal(body.baseline.title,'Premier titre envoyé');assert.equal(body.property.title,'Titre modifié après l’échec');
   Object.assign(properties[0],body.property);return {ok:true};
  }
  return {};
 });
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('#new-property').click();
  d.querySelector('[name="title"]').value='Premier titre envoyé';d.querySelector('#save-draft').click();await settle();assert.equal(properties.length,1);assert.equal(d.querySelector('#app').inert,false);assert.equal(d.querySelector('[name="title"]').value,'Premier titre envoyé');
  d.querySelector('[name="title"]').value='Titre modifié après l’échec';d.querySelector('#save-draft').click();await settle();
  assert.equal(createCalls,1);assert.equal(updateCalls,1);assert.equal(properties.length,1);assert.equal(properties[0].title,'Titre modifié après l’échec');assert.match(d.querySelector('#notice').textContent,/Dossier enregistré/);
 }finally{dom.window.close();}
});

await test('Un import partiellement échoué garde les photos reçues et bloque un enregistrement prématuré',async()=>{
 const property={slug:'photo-upload-property',title:'Bien',location:'Paris',description:'',status:'Draft',credits:5,privacy:'Unlisted',rooms:[{id:'salon',name:'Salon',photos:[]}],agency:{},agent:{},features:[]};
 let release,uploads=0,saves=0;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/workspace')return {workspace:{}};
  if(url==='/api/agent/upload'){uploads++;if(uploads===1)return new Promise(resolve=>release=resolve);throw Error('Le second fichier a échoué.');}
  if(url==='/api/agent/update'){saves++;Object.assign(property,body.property);return {ok:true};}return {};
 },w=>{w.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,aGVsbG8=';queueMicrotask(()=>this.onload());}};});
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Photos"]').click();
  const input=d.querySelector('[data-upload]');Object.defineProperty(input,'files',{value:[new dom.window.File(['first'],'first.png',{type:'image/png'}),new dom.window.File(['second'],'second.png',{type:'image/png'})]});input.dispatchEvent(new dom.window.Event('change'));await settle();
  assert.equal(d.querySelector('#app').inert,true);d.querySelector('#save-draft').click();await settle();assert.equal(saves,0);
  release({url:'https://example.com/imported.png'});await settle();assert.equal(d.querySelector('#app').inert,false);assert.equal(d.querySelectorAll('.editor-photo-grid img').length,1);assert.match(d.querySelector('#save-state').textContent,/Modifications non enregistrées/);assert.match(d.querySelector('#notice').textContent,/second fichier/);
  d.querySelector('#save-draft').click();await settle();assert.equal(saves,1);assert.deepEqual(property.rooms[0].photos,['https://example.com/imported.png']);assert.equal(property.hero,'https://example.com/imported.png');
 }finally{dom.window.close();}
});

await test('La retouche conserve l’original et protège le dossier pendant sa requête',async()=>{
 const original='/media/'+ 'a'.repeat(32)+'.png',version='/media/'+ 'b'.repeat(32)+'.webp';
 const property={slug:'photo-retouch-property',title:'Bien',hero:original,location:'Paris',description:'',status:'Draft',credits:5,privacy:'Unlisted',rooms:[{id:'salon',name:'Salon',photos:[original]}],agency:{},agent:{},features:[]};
 let release,retouch;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/workspace')return {workspace:{}};
  if(url==='/api/agent/photo-edit'){retouch=body;return new Promise(resolve=>release=resolve);}
  if(url==='/api/agent/update'){Object.assign(property,body.property);return {ok:true};}return {};
 },setupRetouchPreview);
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Photos"]').click();d.querySelector('[data-retouch]').click();
  await settle();const dialog=d.querySelector('.photo-editor-dialog'),form=dialog.querySelector('form');form.elements.brightness.value='1.2';form.elements.rotation.value='90';form.elements.crop.value='4:3';form.requestSubmit();await settle();
  assert.equal(d.querySelector('#app').inert,true);assert.equal(dialog.inert,true);assert.equal(retouch.photo,original);assert.equal(retouch.slug,property.slug);assert.equal(retouch.rotation,90);assert.equal(retouch.brightness,1.2);assert.equal(retouch.crop,'4:3');
  const cancel=new dom.window.Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);
  release({url:version});await settle();assert.equal(d.querySelector('#app').inert,false);assert.equal(d.querySelector('.photo-editor-dialog'),null);assert.equal(d.querySelectorAll('.editor-photo-grid img').length,2);
  d.querySelector('#save-draft').click();await settle();assert.deepEqual(property.rooms[0].photos,[original,version]);assert.equal(property.hero,original);
 }finally{dom.window.close();}
});

await test('Le Photo Studio annule les réglages, recadre, améliore localement et sauvegarde dans la pièce choisie',async()=>{
 const a='/media/'+'a'.repeat(32)+'.png',b='/media/'+'b'.repeat(32)+'.png',version='/media/'+'v'.repeat(32)+'.webp',calls=[];
 const property={slug:'photo-studio',title:'Studio',hero:a,status:'Draft',privacy:'Unlisted',credits:7,agency:{},agent:{},features:[],rooms:[{id:'salon',name:'Salon',photos:[a]},{id:'chambre',name:'Chambre',photos:[b]}]};
 const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/photo-edit')return {url:version};if(url==='/api/agent/update')Object.assign(property,body.property);return {};},setupRetouchPreview);
 try{
  const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Photos"]').click();d.querySelector('[data-retouch]').click();await settle();
  const form=d.querySelector('#retouch-form'),set=(key,value)=>{form.elements[key].value=value;form.elements[key].dispatchEvent(new w.Event('change',{bubbles:true}));};
  set('exposure','.5');set('contrast','20');d.querySelector('#retouch-undo').click();assert.equal(form.elements.contrast.value,'0');assert.equal(form.elements.exposure.value,'0.5');d.querySelector('#retouch-redo').click();assert.equal(form.elements.contrast.value,'20');
  d.querySelector('#retouch-original').click();assert.equal(d.querySelector('#retouch-original').getAttribute('aria-pressed'),'true');d.querySelector('#retouch-compare').click();assert.equal(d.querySelector('#retouch-comparison').hidden,false);
  const compare=d.querySelector('#retouch-comparison-range');compare.value='80';compare.dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('#retouch-after-canvas').style.clipPath,'inset(0 20% 0 0)');
  d.querySelector('#retouch-crop').click();const canvas=d.querySelector('#retouch-preview-canvas');canvas.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});canvas.onpointerdown({button:0,pointerId:1,clientX:20,clientY:10,preventDefault(){}});canvas.onpointerup({clientX:180,clientY:90});d.querySelector('#retouch-crop').click();assert.equal(canvas.width,16);assert.equal(canvas.height,16);
  d.querySelector('#auto-enhance').click();assert.ok(Number(form.elements.exposure.value)>0);assert.equal(calls.some(c=>c.url==='/api/agent/photo-edit'),false);assert.equal(calls.some(c=>c.url.includes('generate')),false);
  form.querySelector('[type=reset]').click();assert.equal(form.elements.exposure.value,'0');assert.equal(canvas.width,20);d.querySelector('#retouch-undo').click();assert.ok(Number(form.elements.exposure.value)>0);assert.equal(canvas.width,16);
  d.querySelector('[data-retouch-source="1"]').click();await settle();assert.equal(form.elements.exposure.value,'0');set('temperature','15');set('sharpness','30');form.requestSubmit();await settle();
  const request=calls.find(c=>c.url==='/api/agent/photo-edit');assert.equal(request.body.room,'chambre');assert.equal(request.body.photo,b);assert.equal(request.body.temperature,15);assert.equal(request.body.sharpness,30);
  d.querySelector('#save-draft').click();await settle();assert.deepEqual(property.rooms[0].photos,[a]);assert.deepEqual(property.rooms[1].photos,[b,version]);assert.equal(property.credits,7);assert.equal(property.hero,a);
 }finally{dom.window.close();}
});

await test('Le Photo Studio reprend un chargement échoué et conserve les réglages après une sauvegarde refusée',async()=>{
 const original='/media/'+'c'.repeat(32)+'.png',version='/media/'+'d'.repeat(32)+'.webp';let previews=0,attempts=0;const calls=[];
 const property={slug:'retry-retouch',title:'Retouche',hero:original,status:'Draft',privacy:'Unlisted',credits:5,agency:{},agent:{},features:[],rooms:[{id:'salon',name:'Salon',photos:[original]}]};
 const dom=await domAt('http://localhost/agent',async(url,body)=>{if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/photo-edit'){calls.push(body);if(++attempts===1)return new Response(JSON.stringify({message:'Retouche indisponible, réessayez.'}),{status:503});return {url:version};}return {};},w=>{setupRetouchPreview(w);const Base=w.Image;w.Image=class extends Base{set src(value){if(++previews===1)queueMicrotask(()=>this.onerror());else super.src=value;}};});
 try{
  const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Photos"]').click();d.querySelector('[data-retouch]').click();await settle();
  assert.equal(d.querySelector('#retouch-form .agent-primary').disabled,true);assert.equal(d.querySelector('#retry-retouch').hidden,false);d.querySelector('#retry-retouch').click();await settle();
  const form=d.querySelector('#retouch-form');assert.equal(form.querySelector('.agent-primary').disabled,false);form.elements.exposure.value='.7';form.elements.temperature.value='8';form.requestSubmit();await settle();
  assert.ok(d.querySelector('.photo-editor-dialog'));assert.equal(d.querySelector('#app').inert,false);assert.match(d.querySelector('#retouch-error').textContent,/indisponible/);assert.equal(form.elements.exposure.value,'0.7');assert.equal(d.querySelectorAll('.editor-photo-grid img').length,1);
  form.requestSubmit();await settle();assert.equal(d.querySelector('.photo-editor-dialog'),null);assert.equal(d.querySelectorAll('.editor-photo-grid img').length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(property.credits,5);
 }finally{dom.window.close();}
});

await test('Les générations restent liées à leur bien pendant la navigation et les réponses tardives',async()=>{
 const shared='https://example.com/shared.jpg',second='https://example.com/second.jpg';
 const properties=[{slug:'studio-a',title:'Bien A',credits:5,rooms:[{id:'salon',name:'Salon',photos:[shared,second]}]},{slug:'studio-b',title:'Bien B',credits:11,rooms:[{id:'cuisine',name:'Cuisine',photos:[shared]}]}].map(p=>({...p,status:'Draft',location:'',description:'',privacy:'Unlisted',agency:{},agent:{},features:[]}));
 const pending=new Map(),requests=[];let lateVariants,variantCalls=0;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return properties;if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/workspace')return {workspace:{}};
  if(url==='/api/agent/variants'){variantCalls++;if(variantCalls===1)return new Promise(resolve=>lateVariants=resolve);return [];}
  if(url==='/api/agent/generate'){requests.push(body);return new Promise((resolve,reject)=>pending.set(body.slug,{resolve,reject}));}return {};
 });
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open="studio-a"]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();
  d.querySelector('[data-studio-photo="1"]').click();d.querySelector('[name="prompt"]').value='Créer un bureau';d.querySelector('#agent-generate-form').requestSubmit();await settle();assert.equal(requests[0].photo,second);assert.equal(requests[0].room,'salon');
  d.querySelector('[data-studio-photo="0"]').click();assert.equal(d.querySelector('#agent-generate-form button').disabled,true);
  d.querySelector('[data-page="properties"]').click();d.querySelector('[data-open="studio-b"]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();d.querySelector('[name="prompt"]').value='Rénover la cuisine';d.querySelector('#agent-generate-form').requestSubmit();await settle();assert.equal(requests[1].slug,'studio-b');assert.equal(requests[1].room,'cuisine');
  pending.get('studio-a').resolve({id:'variant-a',slug:'studio-a',room:'salon',original:second,image:'https://example.com/after-a.jpg',label:'Bureau',credits:4});await settle();
  assert.equal(d.querySelector('#agent-compare img').getAttribute('src'),shared);assert.equal(d.querySelector('#agent-generate-form button').disabled,true);assert.match(d.querySelector('#agent-generate-form .muted').textContent,/11/);assert.equal(d.querySelector('[data-agent-variant="variant-a"]'),null);
  lateVariants([]);await settle();d.querySelector('[data-page="properties"]').click();d.querySelector('[data-open="studio-a"]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();await settle();assert.ok(d.querySelector('[data-agent-variant="variant-a"]'));assert.match(d.querySelector('#agent-generate-form .muted').textContent,/4/);
  pending.get('studio-b').reject(Error('Erreur du moteur B'));await settle();assert.doesNotMatch(d.querySelector('#agent-ai-message').textContent,/moteur B/);
  d.querySelector('[data-page="properties"]').click();d.querySelector('[data-open="studio-b"]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();await settle();assert.match(d.querySelector('#agent-ai-message').textContent,/moteur B/);assert.equal(d.querySelector('#agent-generate-form button').disabled,false);
  d.querySelector('[name="prompt"]').value='Nouvelle cuisine';d.querySelector('#agent-generate-form').requestSubmit();await settle();pending.get('studio-b').resolve({id:'variant-b',slug:'studio-b',room:'cuisine',original:shared,image:'https://example.com/after-b.jpg',label:'Cuisine',credits:9});await settle();assert.match(d.querySelector('#agent-generate-form .muted').textContent,/9/);
  const slider=d.querySelector('#agent-compare input');assert.ok(slider);slider.value='75';slider.dispatchEvent(new dom.window.Event('input'));assert.match(d.querySelector('.agent-after').style.clipPath,/25%/);
  d.querySelector('[data-page="properties"]').click();d.querySelector('[data-open="studio-a"]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();d.querySelector('[data-studio-photo="1"]').click();d.querySelector('[name="prompt"]').value='Autre bureau';d.querySelector('#agent-generate-form').requestSubmit();await settle();d.querySelector('[data-studio-photo="0"]').click();
  pending.get('studio-a').resolve({id:'variant-a-two',slug:'studio-a',room:'salon',original:second,image:'https://example.com/after-a-two.jpg',label:'Autre bureau',credits:3});await settle();assert.equal(d.querySelector('#agent-compare img').getAttribute('src'),shared);assert.equal(d.querySelector('.agent-after'),null);assert.ok(d.querySelector('[data-agent-variant="variant-a-two"]'));

 }finally{dom.window.close();}
});

await test('Le débit IA ne remplace pas une saisie de crédits en cours dans les informations',async()=>{
 const original='https://example.com/original.jpg';const property={slug:'studio-credit',title:'Bien',credits:5,rooms:[{id:'salon',name:'Salon',photos:[original]}],status:'Draft',location:'',description:'',privacy:'Unlisted',agency:{},agent:{},features:[]};let release,update;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/workspace')return {workspace:{}};if(url==='/api/agent/variants')return [];
  if(url==='/api/agent/generate')return new Promise(resolve=>release=resolve);
  if(url==='/api/agent/update'){update=body;return new Response(JSON.stringify({message:'Crédits modifiés',field:'credits'}),{status:409});}return {};
 });
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();d.querySelector('[name="prompt"]').value='Salon';d.querySelector('#agent-generate-form').requestSubmit();await settle();
  d.querySelector('[data-editor-tab="Informations"]').click();d.querySelector('[name="credits"]').value='20';d.querySelector('[name="credits"]').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  release({id:'credit-variant',slug:property.slug,room:'salon',original,image:'https://example.com/after.jpg',label:'Salon',credits:4});await settle();assert.equal(d.querySelector('[name="credits"]').value,'20');
  d.querySelector('#save-draft').click();await settle();assert.equal(update.property.credits,20);assert.equal(update.baseline.credits,5);assert.ok(d.querySelector('#property-conflict'));
 }finally{dom.window.close();}
});

await test('Le partage acheteur gère annulation, erreurs et copie manuelle sans perdre la version',async()=>{
 const property={title:'Appartement',hero:'https://example.com/photo.jpg',agency:{},agent:{firstName:'Sophie'},rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}],features:[],privacy:'Unlisted'};
 const variant={id:'version',room:'salon',original:property.hero,image:'https://example.com/version.jpg',label:'Bureau',saved:true};
 let failServer=false,shareMode='cancel',clipboardMode='deny',copies=0,nativeCalls=0;
 const dom=await domAt('http://localhost/p/appartement',async(url,body)=>{
  if(url.startsWith('/api/open'))return {property,variants:[variant]};
  if(url.startsWith('/api/share')){assert.equal(body.id,'version');if(failServer)return new Response(JSON.stringify({message:'Service temporairement indisponible'}),{status:503});return {url:'/share/'+ 'a'.repeat(32)};}
  return {ok:true};
 },w=>{
  w.navigator.share=async()=>{nativeCalls++;if(shareMode==='cancel')throw new w.DOMException('Annulé','AbortError');if(shareMode==='error')throw new Error('Refus');};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async url=>{copies++;assert.equal(url,'http://localhost/share/'+ 'a'.repeat(32));if(clipboardMode==='deny')throw new Error('Refus');}}});
 });
 try{
  await settle();const d=dom.window.document;d.querySelector('[data-version]').click();const share=d.querySelector('#share');
  share.click();await settle();assert.equal(nativeCalls,1);assert.equal(copies,0);assert.equal(d.querySelector('#buyer-share-dialog'),null);assert.equal(share.disabled,false);
  shareMode='success';share.click();await settle();assert.equal(nativeCalls,2);assert.equal(copies,0);
  failServer=true;share.click();await settle();assert.match(d.querySelector('#notice').textContent,/temporairement indisponible/);assert.equal(share.disabled,false);assert.equal(d.querySelector('#buyer-share-dialog'),null);
  failServer=false;shareMode='error';share.click();await settle();const dialog=d.querySelector('#buyer-share-dialog');assert.ok(dialog.open);assert.equal(dialog.querySelector('input').value,'http://localhost/share/'+ 'a'.repeat(32));assert.ok(d.querySelector('.compare'));
  dialog.querySelector('#buyer-copy-version').click();await settle();assert.match(dialog.querySelector('[role=status]').textContent,/Sélectionnez/);assert.equal(dialog.querySelector('input').selectionEnd,dialog.querySelector('input').value.length);
  clipboardMode='allow';dialog.querySelector('#buyer-copy-version').click();await settle();assert.match(dialog.querySelector('[role=status]').textContent,/Lien copié/);dialog.close();assert.equal(d.querySelector('#buyer-share-dialog'),null);
  dom.window.navigator.share=undefined;share.click();await settle();assert.match(d.querySelector('#notice').textContent,/Lien de votre version copié/);assert.equal(d.querySelector('#buyer-share-dialog'),null);
 }finally{dom.window.close();}
});

await test('Le formulaire acheteur réserve le niveau d’intérêt à une demande d’intérêt et conserve la saisie après échec',async()=>{
 const property={title:'Appartement',hero:'https://example.com/photo.jpg',agency:{},agent:{firstName:'Sophie'},rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}],features:[],privacy:'Unlisted'};
 const requests=[];let complete;
 const dom=await domAt('http://localhost/p/appartement',async(url,body)=>{
  if(url.startsWith('/api/open'))return {property,variants:[],lead:{name:'Camille',email:'camille@example.com',phone:'0601020304'}};
  if(url.startsWith('/api/contact')){requests.push(body);if(requests.length===1)return await new Promise(resolve=>complete=resolve);return {ok:true};}
  return {ok:true};
 });
 try{
  await settle();const d=dom.window.document,w=dom.window,form=d.querySelector('#contact-form');assert.equal(form.elements.name.value,'Camille');assert.equal(form.elements.interest.disabled,true);
  form.elements.availability.value='Vendredi après 18 h';form.elements.message.value='Une seconde visite';form.requestSubmit();await settle();assert.equal(form.querySelector('button').disabled,true);form.requestSubmit();await settle();assert.equal(requests.length,1);assert.equal(requests[0].interest,undefined);assert.equal(requests[0].availability,'Vendredi après 18 h');
  complete(new Response(JSON.stringify({message:'Connexion interrompue'}),{status:503}));await settle();assert.equal(form.querySelector('button').disabled,false);assert.equal(form.elements.message.value,'Une seconde visite');assert.match(d.querySelector('#notice').textContent,/Connexion interrompue/);
  for(const kind of ['callback','question']){form.elements.kind.value=kind;form.elements.kind.dispatchEvent(new w.Event('change'));assert.equal(form.elements.interest.disabled,true);form.requestSubmit();await settle();assert.equal(requests.at(-1).kind,kind);assert.equal(requests.at(-1).interest,undefined);}
  d.querySelector('#interest-cta').click();assert.equal(form.elements.interest.disabled,false);form.elements.interest.value='J’aimerais une seconde visite';form.requestSubmit();await settle();assert.equal(requests.at(-1).interest,'J’aimerais une seconde visite');
  form.elements.kind.value='visit';form.elements.kind.dispatchEvent(new w.Event('change'));assert.equal(form.elements.interest.disabled,true);form.requestSubmit();await settle();assert.equal(requests.at(-1).interest,undefined);
 }finally{dom.window.close();}
});

await test('L’accès privé conserve les coordonnées après une erreur et permet une nouvelle tentative sans double envoi',async()=>{
 const property={title:'Appartement privé',hero:'https://example.com/photo.jpg',agency:{},agent:{firstName:'Sophie'},rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}],features:[],privacy:'Private'};
 let attempts=0,complete,tick,now=1000;const durations=[];const dom=await domAt('http://localhost/p/prive',async(url,body)=>{
  if(url.startsWith('/api/open')){if(!body.name)return {gated:true};attempts++;if(attempts===1)return await new Promise(resolve=>complete=resolve);return {property,variants:[],lead:{name:body.name,email:body.email}};}
  if(url.startsWith('/api/event')&&body.type==='session_duration')durations.push(body.duration);return {ok:true};
 },w=>{w.Date.now=()=>now;Object.defineProperty(w.document,'visibilityState',{value:'visible'});w.setInterval=fn=>{tick=fn;return 1;};});
 try{
  await settle();const d=dom.window.document,form=d.querySelector('#gate');assert.ok(form);assert.equal(d.querySelector('.hero'),null);form.elements.name.value='Camille';form.elements.email.value='camille@example.com';form.requestSubmit();await settle();assert.equal(form.querySelector('button').disabled,true);form.requestSubmit();await settle();assert.equal(attempts,1);
  complete(new Response(JSON.stringify({message:'Connexion interrompue'}),{status:503}));await settle();assert.equal(d.querySelector('#gate'),form);assert.equal(form.elements.email.value,'camille@example.com');assert.match(form.querySelector('[role=alert]').textContent,/Connexion interrompue/);assert.equal(form.querySelector('button').disabled,false);
  now=400000;form.requestSubmit();await settle();assert.equal(attempts,2);assert.equal(d.querySelector('#gate'),null);assert.equal(d.querySelector('#contact-form').elements.name.value,'Camille');assert.equal(d.querySelector('#contact-form').elements.email.value,'camille@example.com');now+=5000;tick();await settle();assert.deepEqual(durations,[5]);
 }finally{dom.window.close();}
});

await test('Le mini-site adapte les photos à l’écran et conserve l’original en plein écran',async()=>{
 const original='https://example.com/original.jpg',small='https://example.com/320.webp',large='https://example.com/1920.webp';
 const property={title:'Appartement',hero:original,agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:[original]}],features:[],privacy:'Unlisted',media:{[original]:{thumbnail:small,sources:[{url:small,width:320},{url:large,width:1920}]}}};
 const dom=await domAt('http://localhost/p/photos',async url=>url.startsWith('/api/open')?{property,variants:[]}:{ok:true});
 try{await settle();const d=dom.window.document,hero=d.querySelector('.hero>img');assert.equal(hero.getAttribute('src'),large);assert.equal(hero.getAttribute('sizes'),'100vw');assert.match(hero.getAttribute('srcset'),/320w/);assert.equal(d.querySelector('.studio-thumbnails img').getAttribute('sizes'),'100px');assert.equal(d.querySelector('#gallery img').getAttribute('loading'),'lazy');d.querySelector('[data-photo]').click();assert.equal(d.querySelector('#lightbox img').getAttribute('src'),original);}finally{dom.window.close();}
});

await test('La génération acheteur reste associée à sa photo pendant la navigation et ne remplace pas une autre version',async()=>{
 const first='https://example.com/one.jpg',second='https://example.com/two.jpg',third='https://example.com/three.jpg';
 const property={title:'Appartement',hero:first,agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:[first,second]},{id:'chambre',name:'Chambre',photos:[third]}],features:[],privacy:'Unlisted'};
 const old={id:'old-version',room:'salon',original:first,image:'https://example.com/old.jpg',label:'Ancienne idée'};
 const requests=[];let complete;const dom=await domAt('http://localhost/p/appartement',async(url,body)=>{
  if(url.startsWith('/api/open'))return {property,variants:[old]};
  if(url.startsWith('/api/generate')){requests.push(body);return await new Promise(resolve=>complete=resolve);}
  return {ok:true};
 });
 try{
  await settle();const d=dom.window.document;d.querySelector('[data-source="1"]').click();d.querySelector('#prompt').value='Un bureau';d.querySelector('#generate').click();await settle();d.querySelector('#generate').dispatchEvent(new dom.window.Event('click'));await settle();assert.equal(requests.length,1);assert.equal(requests[0].photo,second);
  d.querySelector('#gallery-tabs [data-room=chambre]').click();assert.equal(d.querySelector('#room-name').textContent,'Chambre');assert.equal(d.querySelector('#studio-image>img').getAttribute('src'),third);
  complete({id:'new-one',slug:'appartement',room:'salon',original:second,image:'https://example.com/new-one.jpg',label:'Bureau'});await settle();assert.equal(d.querySelector('#room-name').textContent,'Chambre');assert.equal(d.querySelector('.compare'),null);assert.ok(d.querySelector('[data-version="new-one"]'));assert.match(d.querySelector('#notice').textContent,/Salon/);
  d.querySelector('[data-version="new-one"]').click();assert.equal(d.querySelector('#room-name').textContent,'Salon');assert.equal(d.querySelector('.compare>img').getAttribute('src'),second);
  d.querySelector('#generate').click();await settle();d.querySelector('[data-version="old-version"]').click();complete({id:'new-two',room:'salon',original:second,image:'https://example.com/new-two.jpg',label:'Autre bureau'});await settle();assert.equal(d.querySelector('.after').getAttribute('src'),old.image);assert.ok(d.querySelector('[data-version="new-two"]'));
  d.querySelector('#generate').click();await settle();complete(new Response(JSON.stringify({message:'Transformation interrompue'}),{status:503}));await settle();assert.equal(d.querySelector('#generate').disabled,false);assert.match(d.querySelector('#notice').textContent,/interrompue/);assert.equal(d.querySelector('.after').getAttribute('src'),old.image);
  d.querySelector('#generate').click();await settle();complete({id:'wrong',room:'chambre',original:third,image:'https://example.com/wrong.jpg'});await settle();assert.equal(d.querySelector('[data-version="wrong"]'),null);assert.match(d.querySelector('#notice').textContent,/ne correspond pas/);assert.equal(d.querySelector('#generate').disabled,false);
 }finally{dom.window.close();}
});

await test('Le plan conserve son ratio et ses zones et sa consultation est comptée après chargement',async()=>{
 const property={title:'Plan',hero:'https://example.com/photo.jpg',agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']},{id:'chambre',name:'Chambre',photos:['https://example.com/chambre.jpg']}],features:[],privacy:'Unlisted',floorplan:{image:'https://example.com/plan.png',zones:[{room:'salon',x:10,y:20,width:45,height:65},{room:'chambre',x:60,y:20,width:30,height:65}]}};
 const events=[];let observe;
 const dom=await domAt('http://localhost/p/plan',async(url,body)=>{if(url.startsWith('/api/open'))return {property,variants:[]};if(url.startsWith('/api/event'))events.push(body);return {ok:true};},w=>{w.IntersectionObserver=class{constructor(fn){observe=fn;}observe(){}unobserve(){}};});
 try{
  await settle();const d=dom.window.document,stage=d.querySelector('.plan-stage'),image=stage.querySelector('img'),canvas=stage.querySelector('.plan-canvas');Object.defineProperty(stage,'clientWidth',{value:500});Object.defineProperty(stage,'clientHeight',{value:420});
  observe([{target:d.querySelector('#plan'),isIntersecting:true}]);await settle();assert.equal(events.filter(event=>event.type==='floorplan_open').length,0);
  Object.defineProperty(image,'naturalWidth',{value:1280});Object.defineProperty(image,'naturalHeight',{value:800});image.onload();await settle();assert.equal(canvas.style.width,'500px');assert.equal(canvas.style.height,'312.5px');assert.equal(canvas.style.top,'53.75px');assert.equal(events.filter(event=>event.type==='floorplan_open').length,1);
  const zone=canvas.querySelectorAll('.plan-zone')[1];assert.equal(zone.style.left,'60%');assert.equal(zone.style.width,'30%');d.querySelector('#zoom-in').click();assert.match(canvas.style.transform,/scale\(1.25\)/);d.querySelector('#reset-plan').click();assert.equal(canvas.style.transform,'translate(0px,0px) scale(1)');
  zone.click();assert.equal(d.querySelector('#room-name').textContent,'Chambre');assert.equal(d.querySelector('#gallery img').getAttribute('src'),'https://example.com/chambre.jpg');assert.equal(d.querySelector('#plan-rooms').textContent.includes('m²'),false);
  observe([{target:d.querySelector('#plan'),isIntersecting:false},{target:d.querySelector('#plan'),isIntersecting:true}]);await settle();assert.equal(events.filter(event=>event.type==='floorplan_open').length,1);assert.ok(events.some(event=>event.type==='room_view'&&event.room==='chambre'));
 }finally{dom.window.close();}
});

await test('Le plan distingue un toucher de pièce d’un glissement ou pincement et poursuit avec un doigt',async()=>{
 const property={title:'Plan tactile',hero:'https://example.com/photo.jpg',agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']},{id:'chambre',name:'Chambre',photos:['https://example.com/chambre.jpg']}],features:[],privacy:'Unlisted',floorplan:{image:'https://example.com/plan.png',zones:[{room:'chambre',x:60,y:20,width:30,height:65}]}};
 const dom=await domAt('http://localhost/p/tactile',async url=>url.startsWith('/api/open')?{property,variants:[]}:{ok:true});
 try{
  await settle();const d=dom.window.document,stage=d.querySelector('.plan-stage'),zone=d.querySelector('.plan-zone'),canvas=d.querySelector('.plan-canvas'),captured=[];stage.setPointerCapture=id=>captured.push(id);
  const point=(id,x,y,type='pointermove')=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',button:0,target:zone,type});
  stage.onpointerdown(point(1,50,100,'pointerdown'));assert.deepEqual(captured,[]);stage.onpointerdown(point(2,150,100,'pointerdown'));assert.ok(captured.includes(1)&&captured.includes(2));
  stage.onpointermove(point(1,0,100));stage.onpointermove(point(2,200,100));assert.match(canvas.style.transform,/scale\(2\)/);zone.onclick({detail:1});assert.equal(d.querySelector('#room-name').textContent,'Salon');
  stage.onpointerup(point(2,200,100,'pointerup'));const before=canvas.style.transform;stage.onpointermove(point(1,20,115));assert.notEqual(canvas.style.transform,before);assert.match(canvas.style.transform,/translate\(-80px,-85px\) scale\(2\)/);stage.onpointerup(point(1,20,115,'pointerup'));
  stage.onpointerdown(point(3,80,100,'pointerdown'));stage.onpointermove(point(3,84,100));stage.onpointerup(point(3,84,100,'pointerup'));zone.onclick({detail:1});assert.equal(d.querySelector('#room-name').textContent,'Chambre');
  d.querySelector('#plan-rooms [data-room=salon]').click();stage.onpointerdown(point(4,80,100,'pointerdown'));stage.onpointermove(point(4,120,125));stage.onpointerup(point(4,120,125,'pointerup'));zone.onclick({detail:1});assert.equal(d.querySelector('#room-name').textContent,'Salon');
  zone.onclick({detail:0});assert.equal(d.querySelector('#room-name').textContent,'Chambre');
 }finally{dom.window.close();}
});

await test('L’éditeur agent importe un GLB avec le type attendu et l’enregistre',async()=>{
 const {technicalGLB}=await import('./scripts/fixtures/technical-model.mjs');const bytes=technicalGLB(),calls=[];
 const property={title:'Modèle technique',slug:'modele',status:'Draft',privacy:'Unlisted',rooms:[],features:[],agency:{},agent:{},credits:3};
 const dom=await domAt('http://localhost/agent',async(url,body)=>{calls.push({url,body});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/upload')return {url:'/media/'+ 'a'.repeat(32)+'.glb'};return {ok:true};});
 try{const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Plans & 3D"]').click();const input=d.querySelector('#upload-model');assert.match(input.accept,/\.glb/);Object.defineProperty(input,'files',{value:[new w.File([bytes],'modele.glb',{type:'application/octet-stream'})]});input.dispatchEvent(new w.Event('change'));for(let i=0;i<30&&!calls.some(c=>c.url==='/api/agent/upload');i++)await new Promise(resolve=>setTimeout(resolve,5));await settle();const upload=calls.find(c=>c.url==='/api/agent/upload');assert.equal(upload.body.type,'model/gltf-binary');assert.deepEqual(Buffer.from(upload.body.base64,'base64'),bytes);d.querySelector('#save-draft').click();await settle();assert.equal(calls.find(c=>c.url==='/api/agent/update').body.property.model3d,'/media/'+ 'a'.repeat(32)+'.glb');}finally{dom.window.close();}
});

await test('Le modèle USDZ prépare Quick Look uniquement à la demande',async()=>{
 const model='/media/'+ 'a'.repeat(32)+'.usdz',events=[];const property={title:'Scan',hero:'https://example.com/photo.jpg',agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:['https://example.com/photo.jpg']}],features:[],privacy:'Unlisted',model3d:model};
 const dom=await domAt('http://localhost/p/scan',async(url,body)=>{if(url.startsWith('/api/open'))return {property,variants:[]};if(url.startsWith('/api/event'))events.push(body);return {ok:true};});
 try{await settle();const d=dom.window.document;assert.equal(d.querySelector('#model a'),null);assert.equal(events.some(event=>event.type==='3d_open'),false);d.querySelector('#load3d').click();await settle();assert.equal(d.querySelector('#model a').getAttribute('href'),model);assert.equal(d.querySelector('#model a').rel,'ar');assert.equal(d.querySelector('#load3d').hidden,true);assert.equal(d.querySelector('model-viewer'),null);assert.equal(events.filter(event=>event.type==='3d_open').length,1);}finally{dom.window.close();}
});

await test('La connexion SaaS conserve les saisies après refus et garde les jetons hors du navigateur',async()=>{
 const calls=[];let reject=true;
 const dom=await domAt('http://localhost/auth/login',async(url,body,options)=>{
  calls.push({url,body,options});if(url==='/api/auth/config')return {enabled:true};
  if(url==='/api/auth/login')return new Response(JSON.stringify({message:'Vérifiez vos informations.'}),{status:reject?400:200});
  return {ok:true};
 });
 try{
  const d=dom.window.document,form=d.querySelector('#saas-auth-form');assert.ok(form);assert.equal(d.querySelector('#agent-token'),null);
  form.elements.email.value='agent@example.test';form.elements.password.value='valid-password';form.requestSubmit();await settle();
  assert.match(d.querySelector('#auth-status').textContent,/Vérifiez/);assert.equal(form.elements.email.value,'agent@example.test');assert.equal(form.elements.password.value,'valid-password');assert.equal(form.querySelector('button').disabled,false);
  assert.equal(dom.window.sessionStorage.getItem('pt-agent-key'),null);assert.equal(calls.find(c=>c.url==='/api/auth/login').options.credentials,'same-origin');reject=false;
 }finally{dom.window.close();}
});

await test('L’inscription SaaS et les liens email rendent leurs états sans inventer une session',async()=>{
 for(const action of ['signup','magic','recover']){
  const calls=[];const dom=await domAt('http://localhost/auth/'+action,async(url,body)=>{calls.push({url,body});if(url==='/api/auth/config')return {enabled:true};return {ok:true,confirmationRequired:true};});
  try{const d=dom.window.document,form=d.querySelector('#saas-auth-form');form.elements.email.value='agent@example.test';if(action==='signup')form.elements.password.value='long-valid-password';form.requestSubmit();await settle();assert.ok(calls.some(c=>c.url==='/api/auth/'+action));assert.match(d.querySelector('#auth-status').textContent,/email/);assert.equal(dom.window.sessionStorage.getItem('pt-agent-key'),null);}finally{dom.window.close();}
 }
});

await test('L’espace SaaS utilise sa session serveur et propose un onboarding sans appartenance',async()=>{
 const agency='11111111-1111-4111-8111-111111111111',calls=[];
 const dom=await domAt('http://localhost/agent',async(url,body,options)=>{
  calls.push({url,body,options});if(url==='/api/auth/config')return {enabled:true};if(url==='/api/auth/me')return {user:{id:'user',email:'agent@example.test'},agency,role:'viewer',memberships:[{agency_id:agency,role:'viewer',agencies:{name:'Agence'}}]};
  if(url==='/api/agent/properties')return [];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/workspace')return {workspace:{name:'Agence'}};return {ok:true};
 });
 try{const d=dom.window.document;assert.ok(d.querySelector('.agent-shell'));assert.equal(d.querySelector('#agent-token'),null);assert.match(d.querySelector('.topbar-actions').textContent,/Lecture seule/);assert.ok(calls.filter(c=>c.url.startsWith('/api/agent')).every(c=>!c.options.headers.Authorization));d.querySelector('#new-property').click();assert.match(d.querySelector('#notice').textContent,/consultation/);assert.equal(d.querySelector('#editor-form'),null);}finally{dom.window.close();}
 const onboarding=await domAt('http://localhost/agent',async url=>url==='/api/auth/config'?{enabled:true}:url==='/api/auth/me'?{user:{id:'user'},memberships:[]}:{ok:true});
 try{assert.equal(onboarding.window.document.querySelector('input[name=name]').autocomplete,'organization');assert.match(onboarding.window.document.querySelector('h1').textContent,/Bienvenue/);assert.equal(onboarding.window.document.querySelector('.agent-shell'),null);}finally{onboarding.window.close();}
});

await test('Le buyer retrouve une tâche persistante après rechargement et conserve la photo consultée',async()=>{
 const property={title:'Technical fixture',slug:'fixture',hero:'https://example.test/one.jpg',rooms:[{id:'salon',name:'Salon',photos:['https://example.test/one.jpg']},{id:'chambre',name:'Chambre',photos:['https://example.test/two.jpg']}],agency:{},agent:{}};
 const job={id:'persisted-job',slug:'fixture',room:'salon',original:property.hero,status:'processing'};let finish;const calls=[];
 const dom=await domAt('http://localhost/p/fixture',async(url,body)=>{
  calls.push({url,body});if(url.startsWith('/api/open'))return {property,variants:[],jobs:[job],aiAllowance:{remaining:1,identified:false}};
  if(url.startsWith('/api/jobs?id='))return new Promise(resolve=>finish=resolve);return {ok:true};
 },fastJobTimers);
 try{
  const d=dom.window.document;assert.equal(d.querySelector('#generate').disabled,true);assert.match(d.querySelector('#buyer-ai-status').textContent,/en cours/);
  d.querySelector('#studio-tabs [data-room="chambre"]').click();
  for(let i=0;i<20&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);
  finish({jobs:[{...job,status:'completed',credits:4,result:{id:'restored',slug:'fixture',room:'salon',original:property.hero,image:'https://example.test/result.jpg',label:'Salon clair'}}]});await settle();
  assert.equal(d.querySelector('#room-name').textContent,'Chambre');assert.equal(d.querySelector('[data-version="restored"]')!==null,true);assert.equal(d.querySelector('#generate').disabled,false);assert.ok(!calls.some(c=>c.url.startsWith('/api/generate')));
 }finally{dom.window.close();}
});

await test('Une réponse perdue réutilise la clé IA et sauvegarder un projet ne demande aucune visite',async()=>{
 const property={title:'Technical fixture',slug:'fixture',hero:'https://example.test/photo.jpg',rooms:[{id:'salon',name:'Salon',photos:['https://example.test/photo.jpg']}],agency:{},agent:{}};
 const requests=[];let identified;
 const dom=await domAt('http://localhost/p/fixture',async(url,body)=>{
  if(url.startsWith('/api/open'))return {property,variants:[],aiAllowance:{remaining:2,identified:false}};
  if(url.startsWith('/api/generate')){requests.push(body);if(requests.length===1)throw TypeError('Connection lost');return {id:'recovered',room:'salon',original:property.hero,image:'https://example.test/result.jpg'};}
  if(url.startsWith('/api/identify')){identified=body;return {lead:body,aiAllowance:{remaining:4,identified:true}};}return {ok:true};
 });
 try{
  const d=dom.window.document;d.querySelector('#prompt').value='Salon clair';d.querySelector('#generate').click();await settle();assert.equal(d.querySelector('#generate').disabled,false);
  d.querySelector('#generate').click();await settle();assert.equal(requests.length,2);assert.equal(requests[0].idempotencyKey,requests[1].idempotencyKey);assert.equal(requests[0].async,true);assert.ok(d.querySelector('.compare'));
  d.querySelector('#save-buyer-project').click();const form=d.querySelector('#identify-form');form.elements.name.value='Buyer';form.elements.email.value='buyer@example.test';assert.equal(form.elements.marketingConsent.checked,false);form.requestSubmit();await settle();
  assert.equal(identified.marketingConsent,false);assert.equal(identified.kind,undefined);assert.equal(d.querySelector('#identify-buyer'),null);assert.match(d.querySelector('#buyer-ai-allowance').textContent,/4 transformations/);
 }finally{dom.window.close();}
});

await test('Le studio agent reprend la tâche du serveur sans nouvelle génération payante',async()=>{
 const property={slug:'fixture',title:'Technical fixture',status:'Draft',credits:4,hero:'https://example.test/photo.jpg',rooms:[{id:'salon',name:'Salon',photos:['https://example.test/photo.jpg']}],agency:{},agent:{}};
 const job={id:'agent-job',slug:property.slug,room:'salon',original:property.hero,status:'processing'};const calls=[];let finish;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  calls.push({url,body});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/jobs')return {jobs:[job]};
  if(url.startsWith('/api/agent/jobs?id='))return new Promise(resolve=>finish=resolve);if(url==='/api/agent/variants')return [];return {ok:true};
 },fastJobTimers);
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='fixture-key';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();assert.equal(d.querySelector('#agent-generate-form button').disabled,true);
  for(let i=0;i<20&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);
  finish({jobs:[{...job,status:'completed',credits:4,result:{id:'agent-restored',slug:property.slug,room:'salon',original:property.hero,image:'https://example.test/result.jpg',label:'Salon clair'}}]});await settle();
  assert.ok(d.querySelector('[data-agent-variant="agent-restored"]'));assert.equal(d.querySelector('#agent-generate-form button').disabled,false);assert.ok(!calls.some(c=>c.url==='/api/agent/generate'));assert.match(d.querySelector('#notice').textContent,/prête/);
 }finally{dom.window.close();}
});

await test('Le dashboard importe le binaire avec une URL signée sans envoyer sa session au Storage',async()=>{
 const calls=[],property={title:'Import signé',slug:'signed-property',status:'Draft',privacy:'Unlisted',rooms:[],agency:{},agent:{},features:[]};
 const result={url:'/media/'+'s'.repeat(32)+'.usdz'};
 const dom=await domAt('http://localhost/agent',async(url,body,options)=>{
  calls.push({url,body,options});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/media-config')return {signedUploads:true};
  if(url==='/api/agent/upload-url')return {uploadId:'upload-fixture',status:'pending',uploadURL:'https://storage.example.test/signed-upload?token=fixture',headers:{'Content-Type':'model/vnd.usdz+zip'}};
  if(String(url).startsWith('https://storage.example.test/'))return new Response('{}');
  if(url==='/api/agent/upload-complete')return result;return {ok:true};
 });
 try{const w=dom.window,d=w.document;d.querySelector('#agent-token').value='local-test-token';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Plans & 3D"]').click();
  const file=new w.File([new Uint8Array(20)],'scan.usdz',{type:'application/octet-stream'}),input=d.querySelector('#upload-model');Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new w.Event('change'));await settle();
  const begin=calls.find(c=>c.url==='/api/agent/upload-url');assert.equal(begin.body.slug,property.slug);assert.equal(begin.body.type,'model/vnd.usdz+zip');assert.equal(begin.body.size,20);assert.ok(begin.body.idempotencyKey.length>=16);
  const put=calls.find(c=>String(c.url).startsWith('https://storage.example.test/'));assert.equal(put.body,file);assert.equal(put.options.method,'PUT');assert.equal(put.options.credentials,'omit');assert.equal(put.options.headers.Authorization,undefined);
  assert.equal(calls.find(c=>c.url==='/api/agent/upload-complete').body.uploadId,'upload-fixture');assert.equal(calls.some(c=>c.url==='/api/agent/upload'),false);assert.equal(d.querySelector('[data-asset="model"]').value,result.url);
 }finally{dom.window.close();}
});

await test('Un premier upload signé crée le brouillon et conserve titre, pièce et photo jusqu’à l’enregistrement',async()=>{
 const calls=[],props=[];const url='/media/'+'p'.repeat(32)+'.png';
 const dom=await domAt('http://localhost/agent',async(endpoint,body,options)=>{
  calls.push({endpoint,body,options});if(endpoint==='/api/agent/properties')return props;if(endpoint==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(endpoint==='/api/agent/media-config')return {signedUploads:true};
  if(endpoint==='/api/agent/sync'){const property={...body.patch,slug:'first-signed-draft'};props.push(property);return {property};}
  if(endpoint==='/api/agent/upload-url')return {uploadId:'first-upload',status:'pending',uploadURL:'https://storage.example.test/first',headers:{'Content-Type':'image/png'}};
  if(String(endpoint).startsWith('https://storage.example.test/'))return new Response('{}');if(endpoint==='/api/agent/upload-complete')return {url};
  if(endpoint==='/api/agent/update'){Object.assign(props[0],body.property);return {property:props[0]};}return {ok:true};
 });
 try{const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('#new-property').click();const title=d.querySelector('[name="title"]');title.value='Maison conservée';title.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-editor-tab="Photos"]').click();d.querySelector('#add-room').click();const name=d.querySelector('[data-room-name]');name.value='Salon';name.dispatchEvent(new w.Event('input'));
  const input=d.querySelector('[data-upload]');Object.defineProperty(input,'files',{value:[new w.File([new Uint8Array(20)],'salon.png',{type:'image/png'})]});input.dispatchEvent(new w.Event('change'));await settle();
  assert.equal(calls.find(c=>c.endpoint==='/api/agent/sync').body.patch.title,'Maison conservée');assert.equal(calls.find(c=>c.endpoint==='/api/agent/upload-url').body.slug,'first-signed-draft');assert.equal(d.querySelector('.editor-photo-grid img').getAttribute('src'),url);
  d.querySelector('#save-draft').click();await settle();assert.equal(props.length,1);assert.equal(props[0].title,'Maison conservée');assert.equal(props[0].rooms[0].name,'Salon');assert.deepEqual(props[0].rooms[0].photos,[url]);assert.equal(props[0].hero,url);
 }finally{dom.window.close();}
});

await test('Le dashboard propose un lien iPhone temporaire sans révéler la clé serveur',async()=>{
 const calls=[],code='temporary-pairing-code';
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  calls.push({url,body});
  if(url==='/api/agent/properties')return [];
  if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};
  if(url==='/api/agent/pair')return {code,origins:['http://192.168.1.10:3000'],expiresAt:'2026-10-06T10:00:00Z'};
  if(url==='/api/agent/connection')return {database:'postgres',shared:true,accounts:false};return {};
 });
 try{
  const d=dom.window.document;d.querySelector('#agent-token').value='private-test-key';d.querySelector('#agent-login').requestSubmit();await settle();
  d.querySelector('#connect-iphone').click();await settle();
  const dialog=d.querySelector('.iphone-connection');assert.ok(dialog.open);assert.match(dialog.textContent,/PostgreSQL commune active/);
  const link=new URL(dialog.querySelector('a').href);assert.equal(link.protocol,'propertytwin:');assert.equal(link.searchParams.get('origin'),'http://192.168.1.10:3000');assert.equal(link.searchParams.get('code'),code);
  assert.equal(dialog.innerHTML.includes('private-test-key'),false);assert.ok(calls.some(call=>call.url==='/api/agent/pair'&&call.body));
  dialog.close();assert.equal(d.querySelector('.iphone-connection'),null);
 }finally{dom.window.close();}
});

function setupMaskCanvas(w){
 w.PropertyTwinMask=maskEngine;w.requestAnimationFrame=callback=>{callback();return 1;};w.cancelAnimationFrame=()=>{};
 Object.defineProperty(w.HTMLImageElement.prototype,'naturalWidth',{get:()=>80});Object.defineProperty(w.HTMLImageElement.prototype,'naturalHeight',{get:()=>60});
 Object.defineProperty(w.HTMLImageElement.prototype,'src',{set(value){this.setAttribute('src',value);queueMicrotask(()=>{if(w.maskImageFailure)this.onerror?.();else this.onload?.();});},get(){return this.getAttribute('src');}});
 w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:80,height:60,right:80,bottom:60});w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
 w.HTMLCanvasElement.prototype.getContext=function(){if(!this.context){const canvas=this;this.context={clearRect(){canvas.selected=false;},fillRect(){},beginPath(){},arc(){},moveTo(){},lineTo(){},fill(){if(this.fillStyle==='#fff')canvas.selected=true;},stroke(){if(this.strokeStyle==='#fff')canvas.selected=true;},getImageData(){const data=new Uint8ClampedArray(80*60*4);if(canvas.selected)data[0]=255;return {data};}};}return this.context;};
 w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,dGVjaG5pY2FsLW1hc2stZml4dHVyZQ==';
}
function paintMask(w,{cancel=false}={}){
 const canvas=w.document.querySelector('#mask-overlay');for(const [type,x,y] of [['pointerdown',20,20],['pointermove',35,30],[cancel?'pointercancel':'pointerup',45,35]]){const event=new w.Event(type);Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});canvas['on'+type](event);}
}
await test('The agent mask dialog preserves a rejected selection, retries the same intention and releases navigation after acceptance',async()=>{
 const photo='/media/'+'M'.repeat(32)+'.png',property={title:'Masked fixture',slug:'masked',status:'Draft',privacy:'Unlisted',credits:4,features:[],agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:[photo]}]},calls=[];let rejected=true,finish;
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/variants')return [];
  if(url==='/api/agent/generate'){calls.push(body);if(rejected)return new Response(JSON.stringify({message:'Provider not enabled'}),{status:503});return {job:{id:'mask-job',slug:property.slug,room:'salon',original:photo,status:'queued'}};}
  if(url==='/api/agent/jobs?id=mask-job'){await new Promise(resolve=>finish=resolve);return {jobs:[{id:'mask-job',slug:property.slug,room:'salon',original:photo,status:'completed',credits:3,result:{id:'masked-result',slug:property.slug,room:'salon',original:photo,image:'https://example.test/masked.png',label:'Objet retiré',agent:true}}]};}
  return {};
 },w=>{setupMaskCanvas(w);fastJobTimers(w);});
 try{
  const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test-only';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();d.querySelector('#magic-eraser').click();await settle();
  assert.equal(d.querySelector('#submit-mask').disabled,true);paintMask(w,{cancel:true});assert.equal(d.querySelector('#undo-mask').disabled,true);
  paintMask(w);assert.equal(d.querySelector('#undo-mask').disabled,false);d.querySelector('#reset-mask').click();assert.equal(d.querySelector('#submit-mask').disabled,true);d.querySelector('#undo-mask').click();assert.equal(d.querySelector('#submit-mask').disabled,false);
  d.querySelector('#mask-form').elements.prompt.value='Retirer la table';d.querySelector('#mask-form').requestSubmit();await settle();
  assert.ok(d.querySelector('.mask-editor-dialog').open);assert.match(d.querySelector('#mask-error').textContent,/Provider not enabled/);assert.equal(d.querySelector('#undo-mask').disabled,false);
  rejected=false;d.querySelector('#mask-form').requestSubmit();await settle();assert.equal(d.querySelector('.mask-editor-dialog'),null);assert.equal(calls.length,2);assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey);assert.equal(calls[1].action,'Supprimer un objet');assert.equal(calls[1].mask.width,80);assert.equal(calls[1].mask.height,60);assert.equal(calls[1].prompt,'Retirer la table');
  d.querySelector('[data-page="properties"]').click();await settle();assert.ok(d.querySelector('.properties-grid')||d.querySelector('[data-open]'));
  for(let i=0;i<20&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);finish();await settle();assert.match(d.querySelector('#notice').textContent,/Transformation créée/);
 }finally{finish?.();dom.window.close();}
});
await test('Mask image loading is retryable and external photos require an import before masking',async()=>{
 const photo='/media/'+'N'.repeat(32)+'.png',property={title:'Mask loading fixture',slug:'loading',status:'Draft',credits:4,features:[],agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:[photo,'https://example.test/external.png']}]};
 const dom=await domAt('http://localhost/agent',async(url)=>{if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/variants')return [];return {};},w=>{setupMaskCanvas(w);w.maskImageFailure=true;});
 try{
  const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test-only';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();d.querySelector('#magic-eraser').click();await settle();
  assert.equal(d.querySelector('#retry-mask').hidden,false);assert.equal(d.querySelector('#submit-mask').disabled,true);w.maskImageFailure=false;d.querySelector('#retry-mask').click();await settle();assert.equal(d.querySelector('#mask-overlay').hidden,false);
  d.querySelector('#close-mask').click();d.querySelector('[data-studio-photo="1"]').click();d.querySelector('#magic-eraser').click();assert.equal(d.querySelector('.mask-editor-dialog'),null);assert.match(d.querySelector('#notice').textContent,/Importez cette photo/);await settle();
 }finally{dom.window.close();}
});

await test('Platform routing preserves edits after conflicts and saves only once while awaiting the server',async()=>{
 let config=defaultRouting(),reject=true,finish;const saves=[];
 const response=()=>({config:structuredClone(config),storageReady:true,profiles:config.profiles.map(p=>({...p,configured:p.type==='http',supportsMasks:p.type==='openai'}))});
 const dom=await domAt('http://localhost/admin',async(url,body,options)=>{
  assert.equal(url,'/api/admin/ai-routing');assert.equal(options.headers.Authorization,'Bearer PLATFORM_TEST_ONLY');
  if(body){saves.push(body);if(reject)return new Response(JSON.stringify({message:'Modified elsewhere'}),{status:409});await new Promise(resolve=>finish=resolve);config={...body.config,revision:config.revision+1};}
  return response();
 },w=>w.sessionStorage.setItem('pt-platform-key','PLATFORM_TEST_ONLY'));
 try{
  const d=dom.window.document,form=d.querySelector('#routing-form');assert.ok(form);assert.equal(d.querySelector('#agent-login'),null);
  form.elements['homeStaging-primary'].value='openai-premium';form.elements['homeStaging-fallback'].value='gemini-preview';form.elements.buyerEnabled.checked=false;form.requestSubmit();await settle();
  assert.equal(form.elements['homeStaging-primary'].value,'openai-premium');assert.match(d.querySelector('#routing-message').textContent,/Modified elsewhere/);assert.equal(form.inert,false);assert.equal(saves[0].baseline,0);
  reject=false;form.requestSubmit();form.requestSubmit();await settle();assert.equal(saves.length,2);assert.equal(form.inert,true);finish();await settle();
  assert.equal(d.querySelector('#routing-form').elements['homeStaging-primary'].value,'openai-premium');assert.equal(d.querySelector('#routing-form').elements.buyerEnabled.checked,false);assert.equal(config.revision,1);assert.match(d.querySelector('#routing-message').textContent,/Routage enregistré/);
  d.querySelector('#platform-logout').click();assert.ok(d.querySelector('#platform-login'));assert.equal(dom.window.sessionStorage.getItem('pt-platform-key'),null);
 }finally{finish?.();dom.window.close();}
});
await test('Platform access remains a separate login, retries errors and hides results that arrive after logout',async()=>{
 let hold=false,finish;const config=defaultRouting();
 const dom=await domAt('http://localhost/admin',async(_url,body,options)=>{
  if(options.headers.Authorization!=='Bearer PLATFORM_TEST_ONLY')return new Response(JSON.stringify({message:'Platform access required'}),{status:401});
  if(body&&hold)await new Promise(resolve=>finish=resolve);
  return {config,storageReady:true,profiles:[]};
 },w=>w.sessionStorage.setItem('pt-agent-key','AGENT_TEST_ONLY'));
 try{
  const d=dom.window.document;assert.ok(d.querySelector('#platform-login'));const login=d.querySelector('#platform-login');login.elements.credential.value='WRONG_TEST_ONLY';login.requestSubmit();await settle();assert.match(d.querySelector('#platform-error').textContent,/Platform access required/);
  login.elements.credential.value='PLATFORM_TEST_ONLY';login.requestSubmit();await settle();assert.ok(d.querySelector('#routing-form'));hold=true;d.querySelector('#routing-form').requestSubmit();await settle();assert.ok(finish);d.querySelector('#platform-logout').click();finish();await settle();assert.ok(d.querySelector('#platform-login'));assert.equal(d.querySelector('#routing-form'),null);
 }finally{finish?.();dom.window.close();}
});

await test('Le Studio conserve les presets par photo et transmet les options sans exiger un prompt pour les outils guidés',async()=>{
 const photo='/media/'+'x'.repeat(32)+'.png',calls=[];
 const property={slug:'presets',title:'Presets techniques',credits:8,status:'Draft',privacy:'Unlisted',features:[],agency:{},agent:{},rooms:[{id:'salon',name:'Salon',photos:[photo]}]};
 const dom=await domAt('http://localhost/agent',async(url,body)=>{
  calls.push({url,body});if(url==='/api/agent/properties')return [property];if(url==='/api/agent/activity')return {sessions:[],leads:[],variants:[]};if(url==='/api/agent/variants')return [];
  if(url==='/api/agent/generate')return new Response(JSON.stringify({message:'Provider indisponible'}),{status:503});return {};
 });
 try{
  const w=dom.window,d=w.document;d.querySelector('#agent-token').value='test';d.querySelector('#agent-login').requestSubmit();await settle();d.querySelector('[data-open]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();
  const choose=(name,value)=>{const input=d.querySelector('#agent-generate-form').elements[name];input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));};
  choose('action','Changer le sol');choose('floor','Point de Hongrie');let form=d.querySelector('#agent-generate-form');assert.equal(form.elements.prompt.required,false);assert.equal(form.elements.style.disabled,true);form.requestSubmit();await settle();
  assert.deepEqual(calls.find(c=>c.url==='/api/agent/generate').body.options,{floor:'Point de Hongrie'});assert.equal(form.elements.floor.value,'Point de Hongrie');assert.match(d.querySelector('#agent-ai-message').textContent,/Provider indisponible/);
  d.querySelector('[data-editor-tab="Photos"]').click();d.querySelector('[data-editor-tab="Studio IA"]').click();form=d.querySelector('#agent-generate-form');assert.equal(form.elements.floor.value,'Point de Hongrie');assert.equal(form.elements.action.value,'Changer le sol');
  choose('action','Changer les murs');form.elements.wallColor.value='#112233';form.elements.wallColor.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(form.elements.wall.value,'Personnalisée');form.requestSubmit();await settle();assert.deepEqual(calls.filter(c=>c.url==='/api/agent/generate').at(-1).body.options,{wall:'Personnalisée',wallColor:'#112233'});
  choose('action','Rénover');assert.equal(d.querySelector('#studio-renovation-notice').hidden,false);choose('action','Prompt personnalisé');assert.equal(form.elements.prompt.required,true);
  choose('action','Image inspiration');form.requestSubmit();await settle();assert.match(d.querySelector('#agent-ai-message').textContent,/Importez une image/);assert.equal(calls.filter(c=>c.url==='/api/agent/generate').length,2);
 }finally{dom.window.close();}
});
