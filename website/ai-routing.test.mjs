import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {defaultRouting,validateRouting,operationRoute,createRoutingStore} from './ai-routing.mjs';
import {providerCatalog,ProviderError} from './image-providers.mjs';
import {imageEditingProvider} from './image-provider.mjs';
import {createStores} from './data-store.mjs';
import {createAIJobs} from './ai-jobs.mjs';
import {validateAIMask} from './ai-mask.mjs';

const image=await sharp({create:{width:40,height:30,channels:3,background:'#9fadc2'}}).png().toBuffer();
const imageURL='data:image/png;base64,'+image.toString('base64');
const raw=Buffer.alloc(40*30);raw[15*40+20]=255;
const mask=await validateAIMask({base64:(await sharp(raw,{raw:{width:40,height:30,channels:1}}).png().toBuffer()).toString('base64'),width:40,height:30});
const photo='/media/'+'X'.repeat(32)+'.png';
const baseInput={room:'salon',photo,action:'Meubler',prompt:'Salon clair',quality:'preview'};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const profile=(type,model)=>({id:type,name:type,type,model,enabled:true});
const context={attemptKey:'fixture-attempt-key',signal:AbortSignal.timeout(120000)};

await test('Routing rejects credentials, arbitrary URLs, unknown models and inconsistent routes; revisions prevent lost edits',async()=>{
 const config=defaultRouting();assert.deepEqual(validateRouting(config),config);
 for(const change of [c=>c.secret='private',c=>c.profiles[0].endpoint='https://evil.test',c=>c.profiles[1].model='../other',c=>c.profiles[2].id=c.profiles[1].id,c=>c.routes.magicErase.primary='missing',c=>c.routes.agentPreview.fallback='http',c=>delete c.routes.finalHD,c=>c.enabled=1]){const invalid=structuredClone(config);change(invalid);assert.throws(()=>validateRouting(invalid),{status:400});}
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-routing-store-')),store=createRoutingStore({directory});
 try{
  const [a,b]=await Promise.allSettled([store.write({...config,enabled:false},0),store.write({...config,buyerEnabled:false},0)]);assert.equal(a.status,'fulfilled');assert.equal(b.reason.status,409);
  const restored=await createRoutingStore({directory}).read();assert.equal(restored.config.revision,1);assert.equal(restored.config.enabled,false);assert.equal((await readFile(path.join(directory,'platform-ai.json'),'utf8')).includes('API_KEY'),false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('Operations route buyers separately from home staging, manual masks and future HD',()=>{
 assert.equal(operationRoute(baseInput),'homeStaging');assert.equal(operationRoute({...baseInput,action:'Rénover'}),'agentPreview');assert.equal(operationRoute({...baseInput,mask}),'magicErase');assert.equal(operationRoute({...baseInput,mask},{agent:false}),'buyerPreview');assert.equal(operationRoute({...baseInput,quality:'hd'}),'finalHD');
});
await test('OpenAI receives the original reference, transparent edit mask and a single preview result; no cost is fabricated',async()=>{
 let sent,headers;const catalog=providerCatalog({OPENAI_API_KEY:'TEST_ONLY_OPENAI_KEY'},{fetcher:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/images/edits');sent=JSON.parse(options.body);headers=options.headers;return new Response(JSON.stringify({data:[{b64_json:image.toString('base64')}],usage:{total_tokens:42,input_tokens:12,private_text:'hidden'}}),{headers:{'Content-Type':'application/json','x-request-id':'req-test-only'}});}});
 const result=await catalog.edit(profile('openai','gpt-image-2.5-sunburst'),{...baseInput,mask,image:{image_base64:image.toString('base64')},dataURL:imageURL,instruction:'Préserver les murs'},context);
 assert.equal(sent.n,1);assert.equal(sent.quality,'low');assert.equal(sent.images[0].image_url,imageURL);assert.match(sent.prompt,/Préserver les murs/);assert.equal(headers.Authorization,'Bearer TEST_ONLY_OPENAI_KEY');assert.equal(headers['Idempotency-Key'],context.attemptKey);
 const converted=await sharp(Buffer.from(sent.mask.image_url.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();assert.equal(converted[(15*40+20)*4+3],0);assert.equal(converted[3],255);assert.deepEqual(result.usage,{total_tokens:42,input_tokens:12});assert.equal(result.actualProviderCost,null);assert.equal(result.image,imageURL);assert.equal(result.providerRequestId,'req-test-only');
 await catalog.edit(profile('openai','gpt-image-2.5-flare'),{...baseInput,quality:'hd',image:{image_url:'https://example.test/photo.png'},instruction:'Préserver les murs'},context);assert.equal(sent.quality,'high');assert.equal(sent.mask,undefined);
});
await test('Gemini uses image interactions, extracts only model image outputs, and rejects incomplete or text-only results',async()=>{
 let sent,response={status:'completed',id:'fixture-interaction',steps:[{type:'model_output',content:[{type:'text',text:'hidden'},{type:'image',data:image.toString('base64'),mime_type:'image/png'}]}],usage:{total_tokens:9}};
 const catalog=providerCatalog({GEMINI_API_KEY:'TEST_ONLY_GEMINI_KEY'},{fetcher:async(url,options)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');assert.equal(options.headers['x-goog-api-key'],'TEST_ONLY_GEMINI_KEY');sent=JSON.parse(options.body);return json(response);}});
 const input={...baseInput,image:{image_base64:image.toString('base64')},mime:'image/png',instruction:'Conserver la perspective'};
 const result=await catalog.edit(profile('gemini','gemini-3.1-flash-image'),input,context);assert.equal(sent.store,false);assert.equal(sent.input[1].data,image.toString('base64'));assert.equal(sent.response_format.image_size,'1K');assert.equal(result.image,imageURL);assert.equal(result.model,'gemini-3.1-flash-image');assert.equal(catalog.accepts(profile('gemini','gemini-3.1-flash-image'),{mask}),false);
 response={status:'completed',steps:[{type:'model_output',content:[{type:'text',text:'no image'}]}]};await assert.rejects(catalog.edit(profile('gemini','gemini-3.1-flash-image'),input,context),{code:'invalid_result'});response={status:'incomplete'};await assert.rejects(catalog.edit(profile('gemini','gemini-3.1-flash-image'),input,context),{code:'incomplete_result'});
});
await test('Flux submits once, polls safely, downloads expiring results without forwarding the key, and never falls back after acceptance',async()=>{
 let posts=0,polls=0,lastInput,pollError=false,badPoll=false,badResult=false;
 const catalog=providerCatalog({BFL_API_KEY:'TEST_ONLY_FLUX_KEY'},{sleep:async()=>{},fetcher:async(url,options)=>{
  if(options.method==='POST'){posts++;lastInput=JSON.parse(options.body);assert.equal(options.headers['x-key'],'TEST_ONLY_FLUX_KEY');return json({id:'fixture-flux-task',polling_url:badPoll?'https://evil.test/poll':'https://api.us1.bfl.ai/v1/get_result?id=fixture'});}
  if(url.startsWith('https://api.us1.bfl.ai/')){polls++;if(pollError)return new Response('quota',{status:429});return json(polls%2?{status:'Processing'}:{status:'Ready',result:{sample:badResult?'https://127.0.0.1/image':'https://delivery.bfl.ai/fixture.png'}});}
  assert.equal(url,'https://delivery.bfl.ai/fixture.png');assert.deepEqual(options.headers,{});return new Response(image,{headers:{'Content-Type':'image/png'}});
 }});
 const input={...baseInput,image:{image_base64:image.toString('base64')},instruction:'Conserver les fenêtres'};
 const result=await catalog.edit(profile('flux','flux-2-pro'),input,context);assert.equal(posts,1);assert.equal(polls,2);assert.equal(lastInput.input_image,image.toString('base64'));assert.equal(result.image,imageURL);
 await catalog.edit(profile('flux','flux-pro-1.0-fill'),{...input,mask},context);assert.equal(lastInput.mask,mask.base64);assert.equal(lastInput.image,image.toString('base64'));assert.equal(lastInput.input_image,undefined);
 badPoll=true;await assert.rejects(catalog.edit(profile('flux','flux-2-pro'),input,context),{code:'invalid_polling_url'});badPoll=false;badResult=true;await assert.rejects(catalog.edit(profile('flux','flux-2-pro'),input,context),{code:'invalid_result'});badResult=false;pollError=true;
 await assert.rejects(catalog.edit(profile('flux','flux-2-pro'),input,context),e=>e.code==='http_429'&&e.safeFallback===false);
});
await test('Router keeps the queued model, reads the source once and uses a second provider only for a known rejection',async()=>{
 let config=defaultRouting(),reads=0,calls=[],mode='quota';config.routes.homeStaging={primary:'openai-premium',fallback:'gemini-preview'};
 const catalog=providerCatalog({OPENAI_API_KEY:'TEST_ONLY_OPENAI_KEY',GEMINI_API_KEY:'TEST_ONLY_GEMINI_KEY'},{fetcher:async(url,options)=>{calls.push({url,input:JSON.parse(options.body)});if(url.includes('openai')){if(mode==='quota')return new Response('quota',{status:429});if(mode==='timeout')throw Error('secret provider error');if(mode==='auth')return new Response('bad key',{status:401});if(mode==='ambiguous')return new Response('unavailable',{status:503});}return json({status:'completed',id:'fallback-fixture',steps:[{type:'model_output',content:[{type:'image',data:image.toString('base64')}]}]});}});
 const router=imageEditingProvider({}, {routing:{read:async()=>({config})},catalog,readMedia:async()=>{reads++;return image;}});
 const snapshot=await router.prepare(baseInput);config.profiles.find(p=>p.id==='openai-premium').model='gpt-image-2.5-flare';const attempts=[];
 const result=await router.edit({...baseInput,routing:snapshot},{jobId:'fixture-job-key',onAttempt:async a=>attempts.push(a)});assert.equal(result.provider,'gemini');assert.equal(reads,1);assert.equal(calls.length,2);assert.equal(calls[0].input.model,'gpt-image-2.5-sunburst');assert.equal(attempts.filter(a=>a.status==='failed').length,1);assert.equal(attempts.at(-1).status,'completed');
 for(mode of ['timeout','auth','ambiguous']){calls=[];await assert.rejects(router.edit({...baseInput,routing:snapshot},{jobId:'fixture-job-key'}));assert.equal(calls.length,1);}
 config.enabled=false;calls=[];await assert.rejects(router.prepare(baseInput),{status:503});await assert.rejects(router.edit({...baseInput,routing:snapshot},{jobId:'fixture-job-key'}),{code:'disabled'});assert.equal(calls.length,0);
});
await test('Unavailable or incompatible primaries fall back before payment, and buyer/provider switches are honored',async()=>{
 let config=defaultRouting(),calls=0;config.routes.magicErase={primary:'gemini-preview',fallback:'openai-premium'};
 const catalog={configured:p=>p.type!=='http'&&p.enabled,masks:p=>p.type==='openai',accepts(p,i){return !i.mask||this.masks(p);},async edit(p){calls++;assert.equal(p.type,'openai');return {image:imageURL,provider:'openai',model:p.model};}};
 const router=imageEditingProvider({}, {routing:{read:async()=>({config})},catalog,readMedia:async()=>image});const input={...baseInput,mask};const snapshot=await router.prepare(input);const attempts=[];
 await router.edit({...input,routing:snapshot},{jobId:'fixture',onAttempt:async a=>attempts.push(a)});assert.equal(calls,1);assert.equal(attempts[0].status,'skipped');
 config.profiles.find(p=>p.id==='openai-premium').enabled=false;await assert.rejects(router.prepare(input),{status:503});await assert.rejects(router.edit({...input,routing:snapshot},{jobId:'fixture'}),{code:'unavailable'});assert.equal(calls,1);
 config.buyerEnabled=false;await assert.rejects(router.prepare(baseInput,{agent:false}),{status:503});
});
await test('Fallback attempts are private and persist in a single charged job; routing changes never break replay',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pt-routed-job-'));const stores=await createStores(directory),config=defaultRouting();config.routes.homeStaging={primary:'openai-premium',fallback:'gemini-preview'};let calls=0;
 const catalog={configured:()=>true,masks:()=>false,accepts:()=>true,async edit(p){calls++;if(p.type==='openai')throw new ProviderError('http_429',{safeFallback:true,status:429});return {image:imageURL,provider:'gemini',model:p.model,usage:{total_tokens:5},actualProviderCost:null};}};
 const router=imageEditingProvider({}, {routing:{read:async()=>({config})},catalog,readMedia:async()=>image}),jobs=createAIJobs({stores,provider:router});const db=stores.state,p={slug:'routed',credits:4,rooms:[{id:'salon',photos:[photo]}]},s={id:'agent-fixture',agent:true,events:[]};db.properties.push(p);db.sessions.push(s);
 try{
  const request={...baseInput,async:true,idempotencyKey:'routed-job-intent-0001'},[job,replay]=await Promise.all([jobs.submit(p,s,request),jobs.submit(p,s,request)]);assert.equal(job.id,replay.id);await jobs.wait(job);assert.equal(job.status,'completed');assert.equal(calls,2);assert.equal(p.credits,3);assert.equal(job.attempts.length,2);assert.equal(job.attempts[0].status,'failed');assert.equal(job.attempts[1].status,'completed');assert.equal(job.model,'gemini-3.1-flash-image');assert.equal(job.actualProviderCost,null);assert.deepEqual(job.usage,{total_tokens:5});assert.equal(jobs.expose(job).attempts,undefined);
  config.enabled=false;assert.equal((await jobs.submit(p,s,request)).id,job.id);assert.equal(calls,2);const disk=JSON.parse(await readFile(path.join(directory,'store.json'),'utf8'));assert.equal(disk.jobs[0].input.routing.revision,0);assert.equal(disk.jobs[0].attempts.length,2);
 }finally{jobs.close();await stores.local.pending;await rm(directory,{recursive:true,force:true});}
});
