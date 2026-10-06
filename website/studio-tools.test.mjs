import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {tools,styles,floors,walls,normalizeTool,toolInstruction} from './public/ai-tools.mjs';
import {providerCatalog} from './image-providers.mjs';
import {imageEditingProvider} from './image-provider.mjs';
import {createStores} from './data-store.mjs';
import {createAIJobs} from './ai-jobs.mjs';

const photo='/media/'+'a'.repeat(32)+'.png',inspiration='/media/'+'b'.repeat(32)+'.png';
const image=await sharp({create:{width:20,height:20,channels:3,background:'#ccc'}}).png().toBuffer();
const reference=await sharp({create:{width:20,height:20,channels:3,background:'#579'}}).png().toBuffer();
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('All studio presets normalize deterministically; invalid or unrelated fields never become a paid request',()=>{
 assert.equal(tools.length,13);assert.equal(styles.length,8);assert.equal(floors.length,7);assert.equal(Object.keys(walls).length,6);
 for(const tool of tools){const input=normalizeTool({action:tool.action,prompt:'Une idée',photo,...(tool.action==='Image inspiration'?{inspiration}:{})});assert.equal(input.action,tool.action);assert.match(toolInstruction(input),/Conserver la géométrie/);}
 const plain=normalizeTool({action:'Changer le sol'});assert.deepEqual(plain,normalizeTool({action:'Changer le sol',options:{floor:'Chêne clair'}}));
 assert.match(toolInstruction(normalizeTool({action:'Ranger'})),/Garder les meubles principaux/);assert.match(toolInstruction(normalizeTool({action:'Vider la pièce'})),/Retirer tous les meubles/);
 assert.match(toolInstruction(normalizeTool({action:'Changer les murs',options:{wall:'Personnalisée',wallColor:'#ABC123'}})),/#abc123/);
 for(const invalid of [{action:'Inconnu'},{action:'Prompt personnalisé'},{action:'Changer le sol',options:{wall:'Beige'}},{action:'Meubler',options:{style:'Inconnu'}},{action:'Changer les murs',options:{wallColor:null}},{action:'Changer les murs',options:{wall:'Personnalisée',wallColor:'red'}},{action:'Meubler',prompt:42},{action:'Image inspiration',inspiration:'https://untrusted.test/image.png'},{action:'Image inspiration',photo,inspiration:photo}])assert.throws(()=>normalizeTool(invalid),{status:400});
 assert.equal(normalizeTool({action:'Transforme cette pièce',prompt:'Transforme cette pièce'},{agent:false}).action,'Prompt personnalisé');
 assert.equal(normalizeTool({action:'Japandi'},{agent:false}).options.style,'Japandi');assert.equal(normalizeTool({action:'Bureau'},{agent:false}).options.usage,'Bureau');
 assert.throws(()=>normalizeTool({action:'Image inspiration',inspiration},{agent:false}),{status:400});
});
test('Inspiration is a separate second input for OpenAI, Gemini, FLUX.2 and explicitly capable HTTP backends',async()=>{
 const input={...normalizeTool({action:'Image inspiration',photo,inspiration}),quality:'preview',instruction:'Image 1 originale ; image 2 ambiance.',image:{image_base64:image.toString('base64')},dataURL:'data:image/png;base64,'+image.toString('base64'),mime:'image/png',reference:{image_base64:reference.toString('base64'),dataURL:'data:image/png;base64,'+reference.toString('base64'),mime:'image/png'}};
 const sent=[];const catalog=providerCatalog({OPENAI_API_KEY:'fixture',GEMINI_API_KEY:'fixture',BFL_API_KEY:'fixture',AI_ENDPOINT:'https://fixture.test',AI_SUPPORTS_REFERENCE:'1'},{sleep:async()=>{},fetcher:async(url,options)=>{
  if(url==='https://api.bfl.ai/poll')return json({status:'Ready',result:{sample:'https://delivery.bfl.ai/image.png'}});
  if(url==='https://delivery.bfl.ai/image.png')return new Response(image);
  sent.push({url,body:JSON.parse(options.body)});
  if(url.includes('openai.com'))return json({data:[{b64_json:image.toString('base64')}]});
  if(url.includes('googleapis.com'))return json({status:'completed',steps:[{type:'model_output',content:[{type:'image',data:image.toString('base64')}]}]});
  if(url.includes('bfl.ai'))return json({id:'fixture-id',polling_url:'https://api.bfl.ai/poll'});
  return json({image_base64:image.toString('base64')});
 }});
 for(const [type,model] of [['openai','gpt-image-2.5-sunburst'],['gemini','gemini-3.1-flash-image'],['flux','flux-2-pro'],['http','']])await catalog.edit({type,model,enabled:true},input,{signal:AbortSignal.timeout(10000),attemptKey:'fixture'});
 assert.equal(sent[0].body.images.length,2);assert.equal(sent[0].body.images[0].image_url,input.dataURL);assert.equal(sent[0].body.images[1].image_url,input.reference.dataURL);
 assert.equal(sent[1].body.input[1].data,image.toString('base64'));assert.equal(sent[1].body.input[2].data,reference.toString('base64'));
 assert.equal(sent[2].body.input_image_2,reference.toString('base64'));assert.equal(sent[3].body.reference_image_base64,reference.toString('base64'));
 assert.equal(catalog.accepts({type:'flux',model:'flux-kontext-pro'},input),false);
 const unsupported=providerCatalog({AI_ENDPOINT:'https://fixture.test'});assert.equal(unsupported.accepts({type:'http'},input),false);
});
test('Owned references remain private, options persist, replay does not bill twice, and unsupported reference routes reserve no credits',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-studio-tools-')),stores=await createStores(directory),base=stores.local,reads=[],calls=[];
 Object.assign(base.db,{properties:[{slug:'studio',title:'Technical fixture',credits:10,rooms:[{id:'salon',photos:[photo]}]}],sessions:[{id:'agent',slug:'studio',agent:true,events:[]}]});base.files.add(photo);base.files.add(inspiration);
 const env={AI_ENDPOINT:'https://fixture.test',AI_SUPPORTS_REFERENCE:'1'};
 const provider=imageEditingProvider(env,{readMedia:async url=>{reads.push(url);return url===photo?image:reference;},catalog:providerCatalog(env,{fetcher:async(_url,options)=>{calls.push(JSON.parse(options.body));return json({image_base64:image.toString('base64')});}})});
 const jobs=createAIJobs({stores,provider});
 try{
  const request={room:'salon',photo,action:'Image inspiration',inspiration,prompt:'Palette claire',async:true,idempotencyKey:'reference-intention-0001'};
  await stores.run(base,null,async()=>{
   const p=base.db.properties[0],s=base.db.sessions[0];await assert.rejects(jobs.submit(p,s,{...request,inspiration:'/media/'+'c'.repeat(32)+'.png'}),{status:400});assert.equal(p.credits,10);
   delete env.AI_SUPPORTS_REFERENCE;await assert.rejects(jobs.submit(p,s,request),{status:503});assert.equal(p.credits,10);env.AI_SUPPORTS_REFERENCE='1';
  });
  const job=await stores.run(base,null,()=>jobs.submit(base.db.properties[0],base.db.sessions[0],request));await jobs.wait(job);
  assert.equal(job.status,'completed');assert.deepEqual(reads,[photo,inspiration]);assert.equal(calls.length,1);assert.match(calls[0].instruction,/Image 2 : référence d’ambiance/);
  const exposed=await stores.run(base,null,()=>jobs.expose(job));assert.equal(exposed.result.original,photo);assert.equal(JSON.stringify(exposed).includes(inspiration),false);assert.equal(base.db.properties[0].credits,9);
  assert.equal((await stores.run(base,null,()=>jobs.submit(base.db.properties[0],base.db.sessions[0],request))).id,job.id);assert.equal(calls.length,1);
  await assert.rejects(stores.run(base,null,()=>jobs.submit(base.db.properties[0],base.db.sessions[0],{...request,prompt:'Autre ambiance'})),{status:409});
  const restored=await createStores(directory);assert.equal(restored.local.db.jobs[0].input.inspiration,inspiration);
 }finally{jobs.close();await rm(directory,{recursive:true,force:true});}
});
