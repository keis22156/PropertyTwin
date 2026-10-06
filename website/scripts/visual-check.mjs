import assert from 'node:assert/strict';
import sharp from 'sharp';
import {technicalRoomplan} from './fixtures/roomplan.mjs';
import {technicalGLB} from './fixtures/technical-model.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromeBinary,chromeSandboxArgs} from './runtime-tools.mjs';

// Isolated fixtures and browser profile; never uses the normal store or browser account.
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const browser=await chromeBinary(),sandboxArgs=chromeSandboxArgs();
const temporary=await mkdtemp(path.join(os.tmpdir(),'propertytwin-visual-'));
const output=path.join(root,'verification','screenshots');
const requestedCases=process.env.VISUAL_CASES?new Set(process.env.VISUAL_CASES.split(',').map(name=>name.trim()).filter(Boolean)):null;
await mkdir(output,{recursive:true});
process.env.DATA_DIR=path.join(temporary,'data');
process.env.ADMIN_TOKEN='isolated-visual-fixture-key';delete process.env.AI_TOKEN;delete process.env.AI_ENDPOINT;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;delete process.env.PUBLIC_SITE_URL;delete process.env.AUTH_COOKIE_SECRET;delete process.env.NODE_ENV;
for(const key of ['PLATFORM_ADMIN_TOKEN','OPENAI_API_KEY','GEMINI_API_KEY','BFL_API_KEY','BFL_RESULT_HOSTS'])delete process.env[key];process.env.PLATFORM_ADMIN_TOKEN=process.env.ADMIN_TOKEN;
delete process.env.SHARED_WORKSPACE_ID;process.env.AI_SUPPORTS_MASK='1';process.env.AI_SUPPORTS_HD='1';delete process.env.DATABASE_URL;delete process.env.MEDIA_STORAGE;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let holdFixtureGeneration=false,releaseFixtureGeneration,modelFixtureURL,failModelRequest=false;
const aiFixtureCalls=[];const aiFixtureImage=await sharp({create:{width:32,height:32,channels:3,background:'#b9d5c5'}}).png().toBuffer();
const aiFixtureHD=await sharp({create:{width:1920,height:1920,channels:3,background:'#b9d5c5'}}).png().toBuffer();
const {server}=await import('../server.mjs');
const shell=await readFile(path.join(root,'public','index.html'),'utf8');
const surface=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname===modelFixtureURL&&failModelRequest){failModelRequest=false;res.statusCode=503;res.setHeader('Cache-Control','no-store');res.end('Isolated model failure fixture');return;}
  if(url.pathname==='/fixture-ai'){const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{const input=JSON.parse(Buffer.concat(chunks).toString());aiFixtureCalls.push(input);const respond=()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({image_base64:(input.quality==='hd'?aiFixtureHD:aiFixtureImage).toString('base64')}));};if(holdFixtureGeneration)releaseFixtureGeneration=respond;else respond();});return;}
  if(url.pathname==='/agent'&&url.searchParams.has('visual')){
    const requested=url.searchParams.get('visual');const page=['lead-detail','lead-timeline'].includes(requested)?'leads':['trash','settings','properties','leads','distribution'].includes(requested)?requested:'properties';
    const bootstrap=`<script>sessionStorage.setItem('pt-agent-key','isolated-visual-fixture-key');const ready=setInterval(()=>{const button=document.querySelector('[data-page="${page}"]');if(button){clearInterval(ready);button.click();${['lead-detail','lead-timeline'].includes(requested)?`const leadReady=setInterval(()=>{const row=document.querySelector('[data-lead]');if(row){clearInterval(leadReady);row.click();}},50);`:['share-editor','photo-editor','studio-editor','mask-editor','roomplan-editor'].includes(requested)?`const editReady=setInterval(()=>{const row=[...document.querySelectorAll('.property-title')].find(button=>button.textContent===${JSON.stringify(['studio-editor','mask-editor'].includes(requested)?(requested==='mask-editor'?'Gomme technique · ':'Studio technique · ')+(url.searchParams.get('variant')==='mobile'?'Mobile':'Desktop'):'Appartement après visite')});if(row){clearInterval(editReady);row.click();}},50);`:requested==='new-editor'?`document.querySelector('#new-property').click();`:''}}},50);</script>`;
    res.setHeader('Content-Type','text/html');res.end(shell.replace('</body>',bootstrap+'</body>'));
  }else server.emit('request',req,res);
});
await new Promise(resolve=>surface.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+surface.address().port;process.env.AI_ENDPOINT=origin+'/fixture-ai';
async function call(endpoint,body){
  const response=await fetch(origin+'/api/agent/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw Error(await response.text());return response.json();
}
try{
  await call('sync-workspace',{patch:{name:'Maison Dupont',email:'agence@example.com',phone:'0123456789',address:'24 rue du Palais, Bordeaux',website:'https://example.com',agentName:'Sophie Martin',agentEmail:'sophie@example.com',color:'#5865e9'},baseline:{}});
  await call('sync',{clientKey:'visual-active-property',patch:{title:'Maison des Chartrons',location:'Bordeaux · Chartrons',city:'Bordeaux',price:645000,surface:128,roomsCount:5,rooms:[],agency:{name:'Maison Dupont'},agent:{name:'Sophie Martin'}}});
  const removed=await call('sync',{clientKey:'visual-removed-property',patch:{title:'Appartement Victor Hugo',location:'Paris 16e · Victor Hugo',city:'Paris',price:895000,surface:72,roomsCount:3,rooms:[]}});
  await call('removal',{slug:removed.property.slug,removed:true,baseline:removed.property});
  // Reach the CRM through the real publication, personalized link and buyer APIs.
  const image=await sharp({create:{width:2400,height:1600,channels:3,background:'#ccd7df'}}).png().toBuffer();
  const media=await call('upload',{type:'image/png',base64:image.toString('base64')});
  const dossier=await call('draft',{title:'Appartement après visite',location:'Paris 16e',price:895000,surface:72,roomsCount:3,rooms:[{id:'salon',name:'Salon',photos:[media.url]}],brandingMode:'workspace'});
  await call('prepare-share',{slug:dossier.slug});
  const invitation=await call('link',{slug:dossier.slug,name:'Paul Dupont',email:'paul@example.com',phone:'0601020304',channel:'whatsapp'});
  const link=invitation.url.split('/').at(-1);
  const opened=await fetch(origin+'/api/open?slug='+dossier.slug,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link})});
  assert.equal(opened.status,200);
  const cookie=opened.headers.get('set-cookie').split(';')[0];
  const openedBody=await opened.json();assert.equal(openedBody.lead.name,'Paul Dupont');
  const buyer=async(endpoint,body)=>{
    const response=await fetch(origin+'/api/'+endpoint+'?slug='+dossier.slug,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(response.status,200,await response.text());
  };
  await buyer('event',{type:'gallery_open'});
  await buyer('event',{type:'room_view',room:'salon'});
  await buyer('event',{type:'session_duration',duration:758});
  await buyer('contact',{kind:'interest',name:'Paul Dupont',email:'paul@example.com',phone:'0601020304',interest:'J’aimerais une seconde visite',message:'Disponible vendredi après-midi.'});
  const activityResponse=await fetch(origin+'/api/agent/activity',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}});
  const activity=await activityResponse.json();
  const prospect=activity.leads.find(lead=>lead.name==='Paul Dupont');assert.ok(prospect);
  const visit=activity.sessions.find(session=>session.id===prospect.sessionId);
  assert.equal(visit.source,'whatsapp');assert.ok(visit.events.some(event=>event.type==='interest_submitted'));
  await call('lead',{id:prospect.id,stage:'qualified',note:'Préparer la seconde visite.'});
  const planImage=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#faf9f5"/><text x="128" y="95" font-size="28" fill="#26372d">Plan technique de test — pas un scan réel</text><rect x="128" y="160" width="576" height="520" fill="#e9ece4" stroke="#26372d" stroke-width="12"/><rect x="768" y="160" width="384" height="520" fill="#e4e9ef" stroke="#26372d" stroke-width="12"/></svg>')).png().toBuffer();
  const planMedia=await call('upload',{type:'image/png',base64:planImage.toString('base64')});
  const modelMedia=await call('upload',{type:'model/gltf-binary',base64:technicalGLB().toString('base64')});modelFixtureURL=modelMedia.url;
  for(const [name,page,width,height] of [['platform-admin-desktop','platform-admin',1440,1000],['platform-admin-mobile','platform-admin',390,844],['agent-trash-desktop','trash',1440,1000],['agent-trash-mobile','trash',390,844],['agent-portfolio-desktop','properties',1440,1000],['agent-settings-desktop','settings',1440,1000],['agent-settings-mobile','settings',390,844],['agent-leads-desktop','leads',1440,1000],['agent-leads-mobile','leads',390,844],['agent-lead-detail-desktop','lead-detail',1440,1000],['agent-lead-detail-mobile','lead-detail',390,844],['agent-distribution-mobile','distribution',390,844],['agent-lead-timeline-desktop','lead-timeline',1440,1000],['agent-lead-timeline-mobile','lead-timeline',390,844],['agent-share-desktop','share-editor',1440,1000],['agent-share-mobile','share-editor',390,844],['agent-create-desktop','new-editor',1440,1000],['agent-create-mobile','new-editor',390,844],['agent-retouch-desktop','photo-editor',1440,1000],['agent-retouch-mobile','photo-editor',390,844],['agent-roomplan-desktop','roomplan-editor',1440,1000],['agent-roomplan-mobile','roomplan-editor',390,844],['agent-mask-desktop','mask-editor',1440,1000],['agent-mask-mobile','mask-editor',390,844],['agent-studio-desktop','studio-editor',1440,1000],['agent-studio-mobile','studio-editor',390,844],['buyer-experience-desktop','buyer-experience',1440,1000],['buyer-experience-mobile','buyer-experience',390,844],['buyer-private-desktop','buyer-private',1440,1000],['buyer-private-mobile','buyer-private',390,844]]){
    if(requestedCases&&!requestedCases.delete(name))continue;
    let buyerFixture;
    if(['buyer-experience','buyer-private'].includes(page)){
      const second=await call('upload',{type:'image/png',base64:aiFixtureImage.toString('base64')});
      const property=await call('draft',{title:'Appartement Victor Hugo · '+(width<500?'Mobile':'Desktop'),location:'Paris 16e · Victor Hugo',price:895000,surface:72,roomsCount:3,bedrooms:2,description:'Après votre visite, retrouvez les espaces et imaginez votre quotidien ici.',privacy:page==='buyer-private'?'Private':'Unlisted',features:['Balcon','Ascenseur'],rooms:[{id:'salon',name:'Salon',photos:[media.url,second.url]},{id:'chambre',name:'Chambre',photos:[second.url]}],model3d:modelMedia.url,floorplan:{image:planMedia.url,zones:[{room:'salon',x:10,y:20,width:45,height:65},{room:'chambre',x:60,y:20,width:30,height:65}]},brandingMode:'workspace'});
      await call('roomplan?slug='+property.slug,{roomplan:technicalRoomplan(),baseline:null});await call('prepare-share',{slug:property.slug});
      const link=await call('link',{slug:property.slug,name:'Camille Test · '+width,email:'camille'+width+'@example.com',phone:'0601020304',channel:'whatsapp'});
      buyerFixture={slug:property.slug,url:page==='buyer-private'?'/p/'+property.slug:link.url,private:page==='buyer-private',second:second.url,name:'Camille Test · '+width};
    }
    if(page==='roomplan-editor'){const current=(await (await fetch(origin+'/api/agent/properties',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json()).find(p=>p.slug===dossier.slug);const asset=technicalRoomplan();asset.rooms=asset.rooms.slice(0,1);await call('roomplan?slug='+dossier.slug,{roomplan:asset,baseline:current.roomplan??null});}
    if(['studio-editor','mask-editor'].includes(page))await call('draft',{title:(page==='mask-editor'?'Gomme technique · ':'Studio technique · ')+(width<500?'Mobile':'Desktop'),rooms:[{id:'salon',name:'Salon',photos:[media.url]}],brandingMode:'workspace'});
    if(page==='share-editor')await call('status',{slug:dossier.slug,status:'Draft'});
    const screenshot=path.join(output,name+'.png');
    await rm(screenshot,{force:true});
    if(!globalThis.WebSocket)throw Error('Lancez avec node --experimental-websocket sur Node 20.');
    const profile=path.join(temporary,name);
    const child=spawn(browser,[...sandboxArgs,'--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking','--no-first-run','--no-default-browser-check','--hide-scrollbars','--user-data-dir='+profile,'--remote-debugging-port=0','--window-size=1440,1000','about:blank'],{stdio:'ignore'});
    let failure,socket;child.on('error',error=>{failure=error;});
    try{
      let port;
      for(let attempt=0;attempt<100;attempt++){
        if(failure)throw failure;
        try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];if(port)break;}catch{/* Chrome has not written its port yet. */}
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      if(!port)throw Error('Le Chrome isolé ne répond pas.');
      const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
      socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
      await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
      let sequence=0;const pending=new Map();
      socket.addEventListener('message',event=>{const message=JSON.parse(event.data),callback=pending.get(message.id);if(callback){pending.delete(message.id);callback(message);}});
      const command=(method,params={})=>new Promise((resolve,reject)=>{
        const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Délai dépassé : '+method));},10000);
        pending.set(id,message=>{clearTimeout(timer);message.error?reject(Error(JSON.stringify(message.error))):message.result?.exceptionDetails?reject(Error(message.result.exceptionDetails.exception?.description||message.result.exceptionDetails.text)):resolve(message.result);});socket.send(JSON.stringify({id,method,params}));
      });
      const browserErrors=[];socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')browserErrors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});await command('Runtime.enable');
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
      if(width<500)await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      await command('Page.navigate',{url:buyerFixture?origin+new URL(buyerFixture.url,origin).pathname:page==='platform-admin'?origin+'/admin':origin+'/agent?visual='+page+'&variant='+(width<500?'mobile':'desktop')});
      const readyExpression=page==='platform-admin'?"Boolean(document.querySelector('#platform-login')||document.querySelector('#routing-form'))":buyerFixture?(buyerFixture.private?"Boolean(document.querySelector('#gate'))":"Boolean(document.querySelector('#contact-form'))"):['share-editor','new-editor','photo-editor','studio-editor','mask-editor','roomplan-editor'].includes(page)?"Boolean(document.querySelector('#publish-property'))":page==='trash'?"Boolean(document.querySelector('[data-restore-property]'))":page==='settings'?"Boolean(document.querySelector('#agency-settings'))":['lead-detail','lead-timeline'].includes(page)?"Boolean(document.querySelector('.lead-drawer[open]'))":page==='leads'?"Boolean(document.querySelector('[data-lead]'))":page==='distribution'?"Boolean(document.querySelector('.distribution-charts'))":"Boolean(document.querySelector('.property-card'))";
      let ready=false;
      for(let attempt=0;attempt<100;attempt++){
        const result=await command('Runtime.evaluate',{expression:readyExpression,returnByValue:true});
        if(result.result?.value){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!ready){const state=await command('Runtime.evaluate',{expression:'({url:location.href,content:document.querySelector("#app")?.textContent.slice(0,1500),rows:document.querySelectorAll("[data-lead]").length,dialogs:document.querySelectorAll("dialog[open]").length})',returnByValue:true});throw Error('Le dashboard n’a pas fini de charger : '+page+' '+JSON.stringify({state:state.result.value,browserErrors}));}
      await new Promise(resolve=>setTimeout(resolve,500));
      const evaluate=async expression=>(await command('Runtime.evaluate',{expression,returnByValue:true})).result.value;
      const until=async expression=>{for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Parcours incomplet : '+expression+' '+JSON.stringify(browserErrors));};
      if(page==='platform-admin'){
        await evaluate('document.querySelector("#platform-login").elements.credential.value="isolated-visual-fixture-key";document.querySelector("#platform-login").requestSubmit()');await until('Boolean(document.querySelector("#routing-form"))');
        const adminCall=async body=>{const response=await fetch(origin+'/api/admin/ai-routing',{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+process.env.PLATFORM_ADMIN_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.status,200);return response.json();};
        const original=await adminCall(),before=aiFixtureCalls.length;
        try{
          await evaluate('const f=document.querySelector("#routing-form");f.elements["homeStaging-primary"].value="openai-premium";f.elements["homeStaging-fallback"].value="gemini-preview";f.elements.buyerEnabled.checked=false;f.requestSubmit()');
          await until('document.querySelector("#routing-message").textContent.includes("Routage enregistré")');
          const saved=await adminCall();assert.equal(saved.config.revision,original.config.revision+1);assert.equal(saved.config.routes.homeStaging.primary,'openai-premium');assert.equal(saved.config.routes.homeStaging.fallback,'gemini-preview');assert.equal(saved.config.buyerEnabled,false);
          await command('Page.reload');await until('Boolean(document.querySelector("#routing-form"))');assert.equal(await evaluate('document.querySelector("#routing-form").elements["homeStaging-primary"].value'),'openai-premium');assert.equal(await evaluate('document.querySelector("#routing-form").elements.buyerEnabled.checked'),false);
          await evaluate('document.querySelector(".platform-routes").scrollIntoView({behavior:"instant",block:"center"})');const bounds=await evaluate('(()=>{const r=document.querySelector(".platform-routes").getBoundingClientRect();return {left:r.left,right:r.right,scroll:document.documentElement.scrollWidth,width:innerWidth}})()');assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.scroll<=width);
          const routingImage=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-routes.png'),Buffer.from(routingImage.data,'base64'));
          assert.equal(aiFixtureCalls.length,before);await writeFile(path.join(output,name+'-routing.json'),JSON.stringify({saved:true,reloaded:true,primary:'openai-premium',fallback:'gemini-preview',buyerPaused:true,providerCalls:0,bounds,browserErrors},null,2));
          await evaluate('window.scrollTo({top:0,behavior:"instant"})');
        }finally{const latest=await adminCall();await adminCall({config:original.config,baseline:latest.config.revision});}
      }
      const verifyRoomplan=async(selector,buyer=false)=>{
        const before=await evaluate('performance.getEntriesByType("resource").map(entry=>entry.name)');assert.ok(!before.some(url=>url.endsWith('/roomplan-viewer.js')));assert.ok(!before.some(url=>url.includes('/vendor/three.')));
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:"instant"});document.querySelector(${JSON.stringify(selector+' > button')}).click()`);
        await until('Boolean(document.querySelector(".roomplan-view[data-ready=true]"))');
        const initial=await evaluate('document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState()');assert.equal(initial.surfaces,6);assert.equal(initial.objects,1);assert.equal(initial.room,'salon');
        assert.ok((await evaluate('document.querySelector(".roomplan-measures").textContent')).includes('Aucune dimension'));
        await evaluate('document.querySelector(".roomplan-canvas").scrollIntoView({behavior:"instant",block:"center"})');await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const rect=await evaluate('(()=>{const r=document.querySelector(".roomplan-canvas").getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.tagName}})()');assert.equal(rect.hit,'CANVAS');
        if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:rect.x,y:rect.y}]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:rect.x+55,y:rect.y}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+55,y:rect.y,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+55,y:rect.y,button:'left',clickCount:1});}
        await until('JSON.stringify(document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState().camera)!=='+JSON.stringify(JSON.stringify(initial.camera)));
        const rotated=await evaluate('document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState()');
        await evaluate('document.querySelector("[data-view=reset]").click()');const reset=await evaluate('document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState()');for(let i=0;i<3;i++)assert.ok(Math.abs(initial.camera[i]-reset.camera[i])<1e-6);
        if(width<500){await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:rect.x-35,y:rect.y},{id:2,x:rect.x+35,y:rect.y}]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:rect.x-15,y:rect.y+15},{id:2,x:rect.x+55,y:rect.y+15}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'right',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+30,y:rect.y+20,button:'right',buttons:2});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+30,y:rect.y+20,button:'right',clickCount:1});}
        await until('JSON.stringify(document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState().target)!=='+JSON.stringify(JSON.stringify(reset.target)));const panned=await evaluate('document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState()');
        await evaluate('document.querySelector("[data-view=reset]").click()');
        await evaluate('document.querySelector("[data-view=zoom-in]").click()');const zoom=await evaluate('document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState()');assert.notDeepEqual(zoom.camera,reset.camera);
        await evaluate('document.querySelector("[data-view=top]").click()');
        await command('Runtime.evaluate',{expression:'document.querySelector("[data-view=fullscreen]").click()',userGesture:true});await until('Boolean(document.fullscreenElement)');await evaluate('document.exitFullscreen()');await until('!document.fullscreenElement');
        if(buyer){await evaluate('document.querySelector(".roomplan-toolbar select").value="chambre";document.querySelector(".roomplan-toolbar select").dispatchEvent(new Event("change"))');const second=await evaluate('document.querySelector(".roomplan-view").parentElement.roomplanViewer.getState()');assert.equal(second.room,'chambre');assert.equal(second.objects,0);assert.ok((await evaluate('document.querySelector(".roomplan-measures").textContent')).includes('5 m de largeur'));}
        await evaluate('document.querySelector("[data-view=reset]").click()');
        await evaluate('document.querySelector(".roomplan-canvas").scrollIntoView({behavior:"instant",block:"center"})');await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const capture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-roomplan.png'),Buffer.from(capture.data,'base64'));
        await writeFile(path.join(output,name+'-roomplan.json'),JSON.stringify({fixture:'technical-roomgeometry-not-real-capture',lazy:true,initial,rotated,reset,panned,zoom,fullscreen:true,browserErrors},null,2));
        if(buyer){await evaluate('document.querySelector("[data-view=photos]").click()');assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Chambre');await evaluate('document.querySelector("#studio-tabs [data-room=salon]").click()');}
      };
      if(page==='roomplan-editor'){
        await evaluate(`document.querySelector('[data-editor-tab="Plans & 3D"]').click()`);
        const uploadPath=path.join(temporary,name+'-roomplan.json'),source=technicalRoomplan();source.rooms=source.rooms.slice(0,1);await writeFile(uploadPath,JSON.stringify(source));
        const documentNode=await command('DOM.getDocument'),input=await command('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#upload-roomplan'});await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[uploadPath]});
        await until('document.querySelector("#notice").textContent.includes("RoomPlan importé")&&!document.querySelector("#app").inert');
        const stored=(await (await fetch(origin+'/api/agent/properties',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json()).find(p=>p.slug===dossier.slug);assert.deepEqual(stored.roomplan,source);
        await verifyRoomplan('#agent-roomplan');await evaluate(`window.roomplanPrevious=document.querySelector('.roomplan-view').parentElement.roomplanViewer;document.querySelector('[data-editor-tab="Informations"]').click()`);await until('window.roomplanPrevious.getState().disposed');
      }
      if(page==='new-editor'){
        const title='Mandat web · '+(width<500?'Mobile':'Desktop');
        await command('Runtime.evaluate',{expression:`document.querySelector('[name="title"]').value=${JSON.stringify(title)};document.querySelector('[name="city"]').value='Nantes';document.querySelector('[name="price"]').value='320000';document.querySelector('[name="title"]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#save-draft').click();`});
        let saved=false;
        for(let attempt=0;attempt<100;attempt++){
          const state=await command('Runtime.evaluate',{expression:"document.querySelector('#notice').textContent.includes('Dossier enregistré')&&!document.querySelector('#app').inert",returnByValue:true});
          if(state.result.value){saved=true;break;}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.ok(saved,'Le nouveau bien doit être enregistré depuis le formulaire.');
        const feed=await (await fetch(origin+'/api/agent/sync-feed',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();
        const matches=feed.properties.filter(property=>property.title===title);assert.equal(matches.length,1);
        assert.equal(matches[0].city,'Nantes');assert.equal(matches[0].price,320000);assert.equal(matches[0].status,'Draft');assert.ok(matches[0].syncKey);
        const publicResponse=await fetch(origin+'/api/open?slug='+matches[0].slug,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(publicResponse.status,404);
      }
      if(page==='share-editor'){
        await command('Runtime.evaluate',{expression:"document.querySelector('#publish-property').click();"});
        let published=false;
        for(let attempt=0;attempt<100;attempt++){
          const state=await command('Runtime.evaluate',{expression:"Boolean(document.querySelector('#client-link-form')&&document.querySelector('#property-qr img')?.naturalWidth>0)",returnByValue:true});
          if(state.result.value){published=true;break;}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.ok(published,'Le partage doit publier et afficher le QR code.');
        await command('Runtime.evaluate',{expression:"const form=document.querySelector('#client-link-form');form.elements.name.value='Emma Bernard';form.elements.email.value='emma@example.com';form.elements.phone.value='0605060708';form.elements.channel.value='whatsapp';form.requestSubmit();"});
        let linked=false;
        for(let attempt=0;attempt<100;attempt++){
          const state=await command('Runtime.evaluate',{expression:"Boolean(document.querySelector('#client-share-message'))",returnByValue:true});
          if(state.result.value){linked=true;break;}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.ok(linked,'Le formulaire doit produire un lien personnalisé.');
        const shared=await command('Runtime.evaluate',{expression:String.raw`(()=>{const field=document.querySelector('#client-share-message');const initial=field.value;field.value+='\nRendez-vous vendredi à 15 h.';field.dispatchEvent(new Event('input',{bubbles:true}));return {message:initial,link:document.querySelector('#client-link-result code').textContent,whatsapp:document.querySelector('#client-whatsapp').href,email:document.querySelector('#client-email').href,sms:document.querySelector('#client-sms').href};})()`,returnByValue:true});
        assert.match(shared.result.value.message,/Bonjour Emma Bernard/);assert.match(shared.result.value.message,/Sophie/);
        for(const channel of ['whatsapp','email','sms'])assert.ok(decodeURIComponent(shared.result.value[channel]).includes('Rendez-vous vendredi à 15 h.'));
        const publicURL=new URL(shared.result.value.link);
        const invitation=await fetch(origin+'/api/open?slug='+dossier.slug,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link:publicURL.pathname.split('/').at(-1)})});
        assert.equal(invitation.status,200);assert.equal((await invitation.json()).lead.name,'Emma Bernard');
      }
      if(page==='mask-editor'){
        const before=aiFixtureCalls.length;
        await evaluate(`document.querySelector('[data-editor-tab="Studio IA"]').click();document.querySelector('#magic-eraser').click()`);
        await until('Boolean(document.querySelector("#mask-overlay")&&!document.querySelector("#mask-overlay").hidden)');
        const sample=async(x,y)=>(await command('Runtime.evaluate',{expression:`new Promise(resolve=>requestAnimationFrame(()=>{const c=document.querySelector('#mask-overlay');resolve(c.getContext('2d').getImageData(Math.floor(c.width*${x}),Math.floor(c.height*${y}),1,1).data[3])}))`,returnByValue:true,awaitPromise:true})).result.value;
        const stroke=async(x,y,x2=x,y2=y)=>{
          await evaluate('document.querySelector("#mask-overlay").scrollIntoView({behavior:"instant",block:"center"})');
          const r=await evaluate('(()=>{const r=document.querySelector("#mask-overlay").getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height}})()');
          const start={x:r.x+r.width*x,y:r.y+r.height*y},end={x:r.x+r.width*x2,y:r.y+r.height*y2};
          assert.ok(start.y>=0&&start.y<=height&&end.y>=0&&end.y<=height);
          if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
          else{await command('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});}
        };
        await stroke(.2,.4,.7,.4);await until('!document.querySelector("#undo-mask").disabled');assert.ok(await sample(.45,.4)>0);
        await evaluate('document.querySelector("#undo-mask").click()');await until('document.querySelector("#submit-mask").disabled');assert.equal(await sample(.45,.4),0);
        await evaluate('document.querySelector("#redo-mask").click()');await until('!document.querySelector("#submit-mask").disabled');assert.ok(await sample(.45,.4)>0);
        await evaluate('document.querySelector("#mask-erase").click();document.querySelector("#mask-size").value="20";document.querySelector("#mask-size").dispatchEvent(new Event("input",{bubbles:true}))');await stroke(.45,.4);await until('document.querySelector("#mask-erase").getAttribute("aria-pressed")==="true"');assert.equal(await sample(.45,.4),0);assert.ok(await sample(.2,.4)>0);
        await evaluate('document.querySelector("#reset-mask").click()');await until('document.querySelector("#submit-mask").disabled');await evaluate('document.querySelector("#undo-mask").click()');await until('!document.querySelector("#submit-mask").disabled');assert.ok(await sample(.2,.4)>0);
        assert.equal(aiFixtureCalls.length,before,'Drawing must not call the provider.');
        process.env.AI_SUPPORTS_MASK='0';await evaluate('document.querySelector("#mask-form").requestSubmit()');await until('document.querySelector("#mask-error").textContent.includes("pas encore activée")');assert.ok(await sample(.2,.4)>0);assert.equal(aiFixtureCalls.length,before);
        const bounds=await evaluate('(()=>{const d=document.querySelector(".mask-editor-dialog"),r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:d.clientWidth,scroll:d.scrollWidth}})()');assert.ok(bounds.left>=0&&bounds.right<=width);assert.ok(bounds.scroll<=bounds.width);
        await evaluate('document.querySelector(".mask-editor-dialog").scrollTop=0');const selected=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-selection.png'),Buffer.from(selected.data,'base64'));
        await evaluate('document.querySelector("#submit-mask").scrollIntoView({behavior:"instant",block:"center"})');const submitBounds=await evaluate('(()=>{const r=document.querySelector("#submit-mask").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()');assert.ok(submitBounds.left>=0&&submitBounds.right<=width&&submitBounds.top>=0&&submitBounds.bottom<=height);const tools=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-tools.png'),Buffer.from(tools.data,'base64'));
        process.env.AI_SUPPORTS_MASK='1';holdFixtureGeneration=true;
        try{
          await evaluate('document.querySelector("#mask-form").requestSubmit()');await until('!document.querySelector(".mask-editor-dialog")');
          for(let i=0;i<100&&!releaseFixtureGeneration;i++)await new Promise(resolve=>setTimeout(resolve,50));assert.ok(releaseFixtureGeneration);assert.equal(aiFixtureCalls.length,before+1);
          await evaluate('document.querySelector("[data-page=properties]").click()');await until('Boolean(document.querySelector(".property-card"))');
        }finally{holdFixtureGeneration=false;releaseFixtureGeneration?.();releaseFixtureGeneration=undefined;}
        const sent=aiFixtureCalls.at(-1),mask=await sharp(Buffer.from(sent.mask_base64,'base64')).greyscale().raw().toBuffer({resolveWithObject:true});
        assert.equal(sent.action,'Supprimer un objet');assert.equal(sent.mask_convention,'white-edit-black-keep');assert.equal(mask.info.width,2400);assert.equal(mask.info.height,1600);assert.equal(mask.data[Math.floor(1600*.4)*2400+Math.floor(2400*.45)],0);assert.equal(mask.data[Math.floor(1600*.4)*2400+Math.floor(2400*.2)],255);
        const original=await sharp(image).raw().toBuffer(),forwarded=await sharp(Buffer.from(sent.image_base64,'base64')).raw().toBuffer();assert.deepEqual(forwarded,original);
        // Find the property by its own title rather than whichever card sorts first.
        await evaluate(`document.querySelector('[data-page="properties"]').click();[...document.querySelectorAll('.property-title')].find(b=>b.textContent===${JSON.stringify('Gomme technique · ')}+(innerWidth<500?'Mobile':'Desktop')).click();document.querySelector('[data-editor-tab="Studio IA"]').click()`);
        await until('Boolean(document.querySelector("[data-agent-variant]"))');await until('document.querySelector("#agent-generate-form .muted").textContent.includes("Crédits restants : 4")');assert.match(await evaluate('document.querySelector("#agent-generate-form .muted").textContent'),/Crédits restants : 4/);
        await writeFile(path.join(output,name+'-mask.json'),JSON.stringify({input:width<500?'touch':'mouse',brush:true,erase:true,undo:true,redo:true,resetUndo:true,selectionSurvivesRejection:true,providerCalls:1,maskWidth:mask.info.width,maskHeight:mask.info.height,originalUnchanged:true,navigationWhileProcessing:true,bounds,submitBounds,browserErrors},null,2));
      }
      if(page==='studio-editor'){
        const before=aiFixtureCalls.length;holdFixtureGeneration=true;
        try{
          await command('Runtime.evaluate',{expression:"document.querySelector('[data-editor-tab=\"Studio IA\"]').click();document.querySelector('[name=prompt]').value='Transformer cette pièce en bureau';document.querySelector('[name=style]').value='Japandi';document.querySelector('#agent-generate-form').requestSubmit();"});
          for(let attempt=0;attempt<100&&!releaseFixtureGeneration;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
          assert.ok(releaseFixtureGeneration,'Le fournisseur doit être en cours avant le rechargement.');
          await command('Page.reload');await until('Boolean(document.querySelector("#publish-property"))');
          await evaluate(`document.querySelector('[data-editor-tab="Studio IA"]').click()`);
          assert.equal(await evaluate('document.querySelector("#agent-generate-form button").disabled'),true);
          assert.equal(aiFixtureCalls.length,before+1,'Recharger ne doit pas envoyer une deuxième génération.');
        }finally{holdFixtureGeneration=false;releaseFixtureGeneration?.();releaseFixtureGeneration=undefined;}
        await until('Boolean(document.querySelector("[data-agent-variant]"))&&!document.querySelector("#agent-generate-form button").disabled');
        await evaluate('document.querySelector("[data-agent-variant]").click()');
        assert.equal(await evaluate('Boolean(document.querySelector(".agent-after"))'),true);assert.equal(aiFixtureCalls.length,before+1);
        assert.equal(aiFixtureCalls.at(-1).image_base64,image.toString('base64'));assert.equal(aiFixtureCalls.at(-1).options.style,'Japandi');assert.match(aiFixtureCalls.at(-1).instruction,/Style : Japandi/);
        const credits=await evaluate('document.querySelector("#agent-generate-form .muted").textContent');assert.match(credits,/Crédits restants : 4/);
        await writeFile(path.join(output,name+'-jobs.json'),JSON.stringify({provider:'local-simulated',reloadedWhileProcessing:true,providerCalls:1,credits:4},null,2));
        const parentId=await evaluate('document.querySelector("[data-agent-variant]").dataset.agentVariant');
        await evaluate('document.querySelector("[data-variant-favorite]").click()');await until('document.querySelector("[data-variant-favorite]").getAttribute("aria-pressed")==="true"');
        await evaluate('document.querySelector("[data-variant-rename]").click();document.querySelector(".variant-rename-dialog input").value="Salon Japandi";document.querySelector(".variant-rename-dialog form").requestSubmit()');await until('!document.querySelector(".variant-rename-dialog")');
        await evaluate('document.querySelector("[data-variant-source]").click()');await until('document.querySelector(".studio-source-context").textContent.includes("Salon Japandi")');
        // Respect the real rate limit; the fixture is never connected to a paid provider.
        await new Promise(resolve=>setTimeout(resolve,31000));
        await evaluate('(()=>{const action=document.querySelector("[name=action]");action.value="Changer le sol";action.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("#agent-generate-form").requestSubmit();})()');
        await until('document.querySelectorAll("[data-variant-node]").length===2&&!document.querySelector("[data-generate]").disabled');
        assert.equal(aiFixtureCalls.length,before+2);assert.equal(aiFixtureCalls.at(-1).image_base64,aiFixtureImage.toString('base64'));
        const childId=await evaluate('document.querySelectorAll("[data-agent-variant]")[1].dataset.agentVariant');
        assert.equal(await evaluate(`document.querySelector('[data-variant-node="${childId}"]').style.getPropertyValue('--variant-depth')`),'1');
        const remoteVariants=await (await fetch(origin+'/api/agent/variants',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();const childVariant=remoteVariants.find(v=>v.id===childId);assert.equal(childVariant.parentVariantId,parentId);assert.equal(childVariant.original,media.url);
        await evaluate('window.confirm=()=>true;document.querySelector("[data-variant-delete]").click()');await until('Boolean(document.querySelector("[data-variant-restore]"))');
        assert.equal(await evaluate(`Boolean(document.querySelector('[data-variant-node="${childId}"] img'))`),true);assert.equal(await evaluate(`Boolean(document.querySelector('[data-variant-node="${parentId}"] img'))`),false);
        await evaluate('document.querySelector("[data-variant-restore]").click()');await until('document.querySelectorAll("[data-variant-download]").length===2');
        const downloads=path.join(temporary,name+'-downloads');await mkdir(downloads,{recursive:true});await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
        await evaluate(`document.querySelector('[data-variant-download="${childId}"]').click()`);
        let downloaded;for(let attempt=0;attempt<100;attempt++){try{downloaded=await readFile(path.join(downloads,'propertytwin-'+childId+'.png'));break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
        assert.deepEqual(downloaded,aiFixtureImage,'Le téléchargement doit conserver les octets de la génération.');
        await command('Page.reload');await until('Boolean(document.querySelector("#publish-property"))');await evaluate('document.querySelector(\'[data-editor-tab="Studio IA"]\').click()');await until('document.querySelectorAll("[data-variant-node]").length===2');
        assert.equal(await evaluate(`document.querySelector('[data-variant-favorite="${parentId}"]').getAttribute('aria-pressed')`),'true');
        assert.match(await evaluate('document.querySelector("#agent-generate-form .muted").textContent'),/Crédits restants : 3/);
        await writeFile(path.join(output,name+'-variants.json'),JSON.stringify({parentId,childId,usedParentImage:true,rename:true,favorite:true,deletePreservesChild:true,restore:true,downloadBytesVerified:true,persistedAfterReload:true,providerCalls:2,credits:3},null,2));
        await new Promise(resolve=>setTimeout(resolve,31000));holdFixtureGeneration=true;
        try{
          await evaluate(`window.confirm=message=>{window.__hdConfirm=message;return true;};document.querySelector('[data-variant-hd="${childId}"]').click()`);
          assert.match(await evaluate('window.__hdConfirm'),/2 crédits supplémentaires/);
          for(let attempt=0;attempt<100&&!releaseFixtureGeneration;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
          assert.ok(releaseFixtureGeneration);assert.equal(aiFixtureCalls.length,before+3);
          await command('Page.reload');await until('Boolean(document.querySelector("#publish-property"))');await evaluate('document.querySelector(\'[data-editor-tab="Studio IA"]\').click()');
          await until('Boolean(document.querySelector("[data-variant-hd]"))');assert.equal(await evaluate('document.querySelector("[data-variant-hd]").disabled'),true);assert.equal(aiFixtureCalls.length,before+3);
        }finally{holdFixtureGeneration=false;releaseFixtureGeneration?.();releaseFixtureGeneration=undefined;}
        await until('Boolean(document.querySelector(".variant-hd-badge"))&&!document.querySelector("[data-generate]").disabled');
        assert.match(await evaluate('document.querySelector(".variant-hd-badge").textContent'),/1920 × 1920/);
        const hdInput=aiFixtureCalls.at(-1);assert.equal(hdInput.quality,'hd');assert.equal(hdInput.image_base64,aiFixtureImage.toString('base64'));assert.equal(hdInput.output_width,1920);assert.equal(hdInput.output_height,1920);assert.match(hdInput.instruction,/Ne refaire aucune transformation/);
        const hdVariants=await (await fetch(origin+'/api/agent/variants',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json(),hdVariant=hdVariants.find(v=>v.parentVariantId===childId&&v.quality==='hd');assert.ok(hdVariant);assert.deepEqual(hdVariant.dimensions,{width:1920,height:1920});
        await evaluate(`document.querySelector('[data-variant-download="${hdVariant.id}"]').click()`);
        let hdDownload;for(let attempt=0;attempt<100;attempt++){try{hdDownload=await readFile(path.join(downloads,'propertytwin-'+hdVariant.id+'.png'));break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}assert.deepEqual(hdDownload,aiFixtureHD);
        await command('Page.reload');await until('Boolean(document.querySelector("#publish-property"))');await evaluate('document.querySelector(\'[data-editor-tab="Studio IA"]\').click()');await until('Boolean(document.querySelector(".variant-hd-badge"))');
        assert.match(await evaluate('document.querySelector("#agent-generate-form .muted").textContent'),/Crédits restants : 1/);assert.equal(await evaluate('document.querySelector("[data-variant-hd]").disabled'),true);
        await writeFile(path.join(output,name+'-hd.json'),JSON.stringify({variantId:hdVariant.id,parentVariantId:childId,quality:'hd',width:1920,height:1920,creditsCharged:2,balance:1,reloadedWhileProcessing:true,downloadBytesVerified:true,providerCalls:3},null,2));
      }
      if(buyerFixture){
        if(buyerFixture.private){
          assert.equal(await evaluate('document.querySelector(".hero")'),null);
          const bounds=await evaluate('({viewport:innerWidth,scroll:document.documentElement.scrollWidth,inputs:[...document.querySelectorAll("#gate input")].map(input=>{const r=input.getBoundingClientRect();return {left:r.left,right:r.right}})})');assert.equal(bounds.viewport,width);assert.equal(bounds.scroll,width);for(const input of bounds.inputs)assert.ok(input.left>=0&&input.right<=width);
          const gate=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-gate.png'),Buffer.from(gate.data,'base64'));
          await evaluate(`(()=>{const form=document.querySelector('#gate');form.elements.name.value=${JSON.stringify(buyerFixture.name)};form.elements.email.value='camille${width}@example.com';form.requestSubmit();})()`);
          await until('Boolean(document.querySelector("#contact-form"))');
          await command('Page.reload');await until('Boolean(document.querySelector("#contact-form"))');assert.equal(await evaluate('document.querySelector("#gate")'),null);
        }
        assert.equal(await evaluate('document.querySelector("#contact-form").elements.name.value'),buyerFixture.name);
        await until('document.querySelector(".hero>img").naturalWidth>0');
        const chosen=await evaluate('document.querySelector(".hero>img").currentSrc');
        const rendition=media.media.sources.find(item=>origin+item.url===chosen);assert.ok(rendition);assert.equal(rendition.width,width<500?640:1920);
        const resource=await evaluate('performance.getEntriesByType("resource").filter(entry=>entry.initiatorType==="img").map(entry=>({url:entry.name,bytes:entry.encodedBodySize}))');
        assert.ok(!resource.some(entry=>entry.url===origin+media.url),'L’original ne doit pas être téléchargé avant l’ouverture plein écran.');
        const selectedBytes=Buffer.from(await (await fetch(chosen)).arrayBuffer()).length;assert.ok(selectedBytes<image.length);
        await writeFile(path.join(output,name+'-images.json'),JSON.stringify({originalBytes:image.length,selectedWidth:rendition.width,selectedBytes,originalRequestedBeforeGallery:false,resources:resource},null,2));
        const hero=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await writeFile(path.join(output,name+'-hero.png'),Buffer.from(hero.data,'base64'));
        await evaluate('document.querySelector("#plan").scrollIntoView({behavior:"instant"})');
        await until('document.querySelector(".plan-stage img").naturalWidth>0&&parseFloat(document.querySelector(".plan-canvas").style.width)>0');
        const plan=await evaluate('(()=>{const canvas=document.querySelector(".plan-canvas"),stage=document.querySelector(".plan-stage"),c=canvas.getBoundingClientRect(),s=stage.getBoundingClientRect();return {canvas:{left:c.left,top:c.top,width:c.width,height:c.height},stage:{left:s.left,top:s.top,width:s.width,height:s.height},zones:[...canvas.querySelectorAll(".plan-zone")].map(zone=>{const r=zone.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})}})()');
        assert.ok(Math.abs(plan.canvas.width/plan.canvas.height-1.6)<.01);assert.ok(Math.abs(plan.canvas.left+plan.canvas.width/2-plan.stage.left-plan.stage.width/2)<1);assert.ok(Math.abs(plan.canvas.top+plan.canvas.height/2-plan.stage.top-plan.stage.height/2)<1);
        assert.ok(Math.abs(plan.zones[1].left-(plan.canvas.left+plan.canvas.width*.6))<1);assert.ok(Math.abs(plan.zones[1].width-plan.canvas.width*.3)<1);
        await evaluate('document.querySelector("#zoom-in").click()');
        const x=Math.round(plan.stage.left+10),y=Math.round(plan.stage.top+10);
        if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y:y+25}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+40,y:y+25,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+40,y:y+25,button:'left',clickCount:1});}
        const transform=await evaluate('document.querySelector(".plan-canvas").style.transform');assert.match(transform,/scale\(1.25\)/);assert.match(transform,/translate\(40px,\s*25px\)/);
        await evaluate('document.querySelector("#reset-plan").click()');assert.match(await evaluate('document.querySelector(".plan-canvas").style.transform'),/^translate\(0px,\s*0px\) scale\(1\)$/);
        const zone=plan.zones[1],zx=Math.round(zone.left+zone.width/2),zy=Math.round(zone.top+zone.height/2);
        if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:zx,y:zy}]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:zx+20,y:zy+10}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:zx,y:zy,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:zx+20,y:zy+10,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:zx+20,y:zy+10,button:'left',clickCount:1});}
        const zoneDrag=await evaluate('document.querySelector(".plan-canvas").style.transform');assert.match(zoneDrag,/translate\(20px,\s*10px\)/);assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Salon');
        await evaluate('document.querySelector("#reset-plan").click()');
        let pinchTransform=null;
        if(width<500){
          await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:zx-20,y:zy},{id:2,x:zx+20,y:zy}]});
          await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:zx-40,y:zy},{id:2,x:zx+40,y:zy}]});
          await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          pinchTransform=await evaluate('document.querySelector(".plan-canvas").style.transform');assert.match(pinchTransform,/scale\(2\)/);assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Salon');const focal=await evaluate('(()=>{const r=document.querySelectorAll(".plan-zone")[1].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');assert.ok(Math.abs(focal.x-zx)<1&&Math.abs(focal.y-zy)<1,'Le point visé doit rester sous les doigts.');
        }
        const gestures=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-plan-gestures.png'),Buffer.from(gestures.data,'base64'));
        await writeFile(path.join(output,name+'-plan-gestures.json'),JSON.stringify({fixture:'technical-not-roomplan',zoneDrag,pinchTransform,roomChangedByGesture:false},null,2));
        await evaluate('document.querySelector("#reset-plan").click()');
        const picture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-plan.png'),Buffer.from(picture.data,'base64'));
        await writeFile(path.join(output,name+'-plan.json'),JSON.stringify({fixture:'technical-not-roomplan',...plan,transform,measurementsInvented:false},null,2));
        if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:zx,y:zy}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:zx,y:zy,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:zx,y:zy,button:'left',clickCount:1});}
        await until('document.querySelector("#room-name").textContent==="Chambre"');assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Chambre');assert.equal(await evaluate('document.querySelector("#gallery-tabs .active").dataset.room'),'chambre');
        await evaluate('document.querySelector("#plan-rooms [data-room=salon]").click()');assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Salon');
        const before3D=await evaluate('performance.getEntriesByType("resource").map(entry=>entry.name)');assert.ok(!before3D.includes(origin+modelMedia.url));assert.ok(!before3D.includes(origin+'/vendor/model-viewer.min.js'));
        await verifyRoomplan('#buyer-roomplan',true);await evaluate('document.querySelector("#troisd").scrollIntoView({behavior:"instant"})');failModelRequest=true;
        await evaluate('document.querySelector("#load3d").click()');
        await until('document.querySelector("#load3d").textContent.includes("Réessayer")&&!document.querySelector("#load3d").disabled');
        assert.equal(await evaluate('document.querySelector("model-viewer")'),null);assert.ok(!failModelRequest,'Le modèle doit avoir été demandé et le refus isolé consommé.');
        const failed=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-3d-error.png'),Buffer.from(failed.data,'base64'));
        await evaluate('document.querySelector("#load3d").click()');
        await until('Boolean(document.querySelector("model-viewer")?.loaded)&&document.querySelector("#load3d").hidden&&getComputedStyle(document.querySelector("#load3d")).display==="none"');
        await evaluate('document.querySelector("model-viewer").scrollIntoView({behavior:"instant",block:"center"})');await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const orbit=await evaluate('(()=>{const v=document.querySelector("model-viewer"),r=v.getBoundingClientRect();return {before:v.getCameraOrbit().theta,controls:v.hasAttribute("camera-controls"),src:v.src,x:r.left+r.width/2,y:r.top+r.height/2}})()');assert.ok(orbit.controls);assert.equal(new URL(orbit.src,origin).pathname,modelMedia.url);
        if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:orbit.x,y:orbit.y}]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:orbit.x+60,y:orbit.y}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:orbit.x,y:orbit.y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:orbit.x+80,y:orbit.y,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:orbit.x+80,y:orbit.y,button:'left',clickCount:1});}
        await until('Math.abs(document.querySelector("model-viewer").getCameraOrbit().theta-'+JSON.stringify(orbit.before)+')>.1');orbit.after=await evaluate('document.querySelector("model-viewer").getCameraOrbit().theta');

        await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const loaded=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-3d.png'),Buffer.from(loaded.data,'base64'));
        await writeFile(path.join(output,name+'-3d.json'),JSON.stringify({fixture:'technical-cuboid-not-roomplan',lazy:true,retried:true,orbit},null,2));
        await evaluate('document.querySelector("#photos").scrollIntoView({behavior:"instant"})');
        await evaluate('document.querySelector("#gallery [data-photo]").click()');
        await until('document.querySelector("#lightbox").open');
        await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        if(width<500){
          await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:350}]});
          await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:100,y:350}]});
          await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        }else await evaluate('document.querySelector("#next").click()');
        await until('document.querySelector("#lightbox img").getAttribute("src")==='+JSON.stringify(buyerFixture.second));
        const gallery=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await writeFile(path.join(output,name+'-gallery.png'),Buffer.from(gallery.data,'base64'));
        holdFixtureGeneration=true;
        try{
          await evaluate('document.querySelector("#lightbox .close").click();document.querySelector("#imaginer").scrollIntoView({behavior:"instant"});document.querySelector("#prompt").value="Transforme cette pièce en bureau";document.querySelector("#generate").click()');
          for(let attempt=0;attempt<100&&!releaseFixtureGeneration;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
          assert.ok(releaseFixtureGeneration,'Le provider local doit recevoir la demande avant la navigation.');
          const beforeReload=aiFixtureCalls.length;
          await command('Page.reload');await until('Boolean(document.querySelector("#contact-form"))&&document.querySelector("#generate").disabled');
          assert.equal(aiFixtureCalls.length,beforeReload,'Le retour au mini-site doit reprendre le suivi sans nouvelle génération.');
          await evaluate('document.querySelector("#studio-tabs [data-room=chambre]").click()');
          assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Chambre');assert.equal(await evaluate('document.querySelector("#generate").disabled'),true);
        }finally{holdFixtureGeneration=false;releaseFixtureGeneration?.();releaseFixtureGeneration=undefined;}
        await until('document.querySelector("#versions [data-version]")&&!document.querySelector("#generate").disabled');
        assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Chambre');assert.equal(await evaluate('document.querySelector(".compare")'),null);
        const navigation=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-navigation.png'),Buffer.from(navigation.data,'base64'));
        await evaluate('document.querySelector("#versions [data-version]").click()');
        await until('Boolean(document.querySelector("#save"))');assert.equal(await evaluate('document.querySelector("#room-name").textContent'),'Salon');
        await evaluate('document.querySelector("#studio-image input").value=75;document.querySelector("#studio-image input").dispatchEvent(new Event("input"));document.querySelector("#save").click()');
        await until('document.querySelector("#versions").textContent.includes("✓")');
        assert.equal(await evaluate('document.querySelector(".after").style.clipPath'),'inset(0px 25% 0px 0px)');
        await evaluate('document.querySelector("#save-buyer-project").click()');
        await until('Boolean(document.querySelector("#identify-buyer[open]"))');
        const projectBounds=await evaluate('(()=>{const dialog=document.querySelector("#identify-buyer");const r=dialog.getBoundingClientRect();return {left:r.left,right:r.right,width:dialog.clientWidth,scroll:dialog.scrollWidth};})()');
        assert.ok(projectBounds.left>=0&&projectBounds.right<=width);assert.ok(projectBounds.scroll<=projectBounds.width);
        const projectButton=await evaluate('(()=>{const r=document.querySelector("#identify-form button.primary").getBoundingClientRect();return {top:r.top,bottom:r.bottom};})()');assert.ok(projectButton.top>=0&&projectButton.bottom<=height,'Le bouton de sauvegarde doit rester visible sans défiler.');
        assert.equal(await evaluate('document.querySelector("#identify-form").elements.marketingConsent.checked'),false);
        const projectCapture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-project.png'),Buffer.from(projectCapture.data,'base64'));
        await evaluate('document.querySelector("#identify-form").requestSubmit()');
        await until('!document.querySelector("#identify-buyer")');
        await evaluate('document.querySelector("#contact").scrollIntoView({behavior:"instant"});document.querySelector("#interest-cta").click();document.querySelector("#contact-form").elements.message.value="Je souhaite une seconde visite.";document.querySelector("#contact-form").requestSubmit()');
        await until('document.querySelector("#notice").textContent.includes("transmise")&&!document.querySelector("#contact-form button").disabled');
        const activity=await (await fetch(origin+'/api/agent/activity',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();
        const lead=activity.leads.find(item=>item.slug===buyerFixture.slug&&item.name===buyerFixture.name&&item.kind==='interest');assert.ok(lead);
        const session=activity.sessions.find(item=>item.id===lead.sessionId);assert.ok(session);const projectLead=activity.leads.find(item=>item.sessionId===session.id&&item.kind==='project');assert.ok(projectLead);assert.equal(projectLead.marketingConsent,false);
        for(const type of ['mini_site_open','gallery_open','photo_view','floorplan_open','3d_open','ai_studio_open','ai_generation','variant_saved','interest_submitted'])assert.ok(session.events.some(event=>event.type===type),type);
        const variant=activity.variants.find(item=>item.sessionId===session.id&&item.saved);assert.ok(variant);assert.equal(variant.original,media.url);assert.equal(variant.room,'salon');
        for(const kind of ['visit','callback','question']){
          const availability=kind==='visit'?'Vendredi après 18 h':kind==='callback'?'Après 12 h':'';
          await evaluate(`(()=>{const form=document.querySelector('#contact-form');form.elements.kind.value=${JSON.stringify(kind)};form.elements.kind.dispatchEvent(new Event('change'));form.elements.availability.value=${JSON.stringify(availability)};form.elements.message.value=${JSON.stringify('Demande client · '+kind)};document.querySelector('#notice').textContent='';form.requestSubmit();})()`);
          await until('document.querySelector("#notice").textContent.includes("transmise")&&!document.querySelector("#contact-form button").disabled');
          assert.equal(await evaluate('getComputedStyle(document.querySelector("#contact-form [name=interest]").closest("label")).display'),'none');
        }
        const refreshed=await (await fetch(origin+'/api/agent/activity',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();
        for(const kind of ['visit','callback','question']){
          const request=refreshed.leads.find(item=>item.slug===buyerFixture.slug&&item.kind===kind);assert.ok(request);assert.equal(request.message,'Demande client · '+kind);assert.equal(request.interest,'');assert.equal(request.sessionId,session.id);
          if(kind==='visit'){assert.equal(request.availability,'Vendredi après 18 h');buyerFixture.visitLead=request.id;}
        }
        assert.ok(refreshed.sessions.find(item=>item.id===session.id).events.some(event=>event.type==='visit_requested'));
        await writeFile(path.join(output,name+'-workflow.json'),JSON.stringify({slug:buyerFixture.slug,events:refreshed.sessions.find(item=>item.id===session.id).events.map(event=>event.type),saved:true,reloadedWhileProcessing:true,projectSaved:true,marketingConsent:false,interest:lead.kind,contactKinds:['interest','visit','callback','question'],private:buyerFixture.private,visits:session.visits,provider:'local-simulated'},null,2));
        assert.equal(aiFixtureCalls.at(-1).image_base64,image.toString('base64'));assert.match(aiFixtureCalls.at(-1).user_prompt,/Transforme cette pièce en bureau/);
        const balance=await (await fetch(origin+'/api/agent/properties',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();assert.equal(balance.find(item=>item.slug===buyerFixture.slug).credits,4);
        await evaluate('scrollTo({top:0,behavior:"instant"})');
      }
      let photoCount;
      if(page==='photo-editor'){
        const feed=await (await fetch(origin+'/api/agent/sync-feed',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();
        photoCount=feed.properties.find(property=>property.slug===dossier.slug).rooms[0].photos.length;
        await evaluate(`document.querySelector('[data-editor-tab="Photos"]').click();document.querySelector('[data-retouch]').click()`);
        await until('Boolean(document.querySelector("#retouch-preview-canvas")&&!document.querySelector("#retouch-preview-canvas").hidden&&!document.querySelector("#retouch-form .agent-primary").disabled)');
        const originalPreview=await evaluate('document.querySelector("#retouch-preview-canvas").toDataURL()');
        await evaluate(`(()=>{const form=document.querySelector('#retouch-form');form.elements.exposure.value='.4';form.elements.contrast.value='15';form.elements.shadows.value='20';form.elements.highlights.value='-15';form.elements.temperature.value='8';form.elements.tint.value='-3';form.elements.sharpness.value='20';form.elements.straighten.value='3';form.elements.rotation.value='90';form.elements.crop.value='4:3';form.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await until('document.querySelector("#retouch-preview-canvas").toDataURL()!=='+JSON.stringify(originalPreview));
        await evaluate('document.querySelector("#retouch-undo").click()');assert.equal(await evaluate('document.querySelector("#retouch-form").elements.exposure.value'),'0');await evaluate('document.querySelector("#retouch-redo").click()');
        await evaluate('document.querySelector("#retouch-compare").click();document.querySelector("#retouch-comparison-range").value="65";document.querySelector("#retouch-comparison-range").dispatchEvent(new Event("input"))');
        await until('!document.querySelector("#retouch-after-canvas").hidden');
        assert.match(await evaluate('document.querySelector("#retouch-after-canvas").style.clipPath'),/^inset\(0(?:px)? 35% 0(?:px)? 0(?:px)?\)$/);
        const studioState=await evaluate('({width:document.querySelector("#retouch-preview-canvas").width,height:document.querySelector("#retouch-preview-canvas").height,exposure:document.querySelector("#retouch-form").elements.exposure.value,sharpness:document.querySelector("#retouch-form").elements.sharpness.value,compare:!document.querySelector("#retouch-after-canvas").hidden})');
        await writeFile(path.join(output,name+'-studio.json'),JSON.stringify({studioState,previewChanged:true,undo:true,redo:true,local:true},null,2));
        await evaluate('document.querySelector("#retouch-crop").click()');await until('!document.querySelector("#retouch-crop-help").hidden&&document.querySelector("#retouch-preview-canvas").width===640&&document.querySelector("#retouch-preview-canvas").height===960');
        await evaluate('document.querySelector("#retouch-preview-canvas").scrollIntoView({behavior:"instant",block:"center"})');
        const cropBounds=await evaluate('(()=>{const r=document.querySelector("#retouch-preview-canvas").getBoundingClientRect();return {x:r.left+r.width*.2,y:r.top+r.height*.2,x2:r.left+r.width*.8,y2:r.top+r.height*.7}})()');
        assert.ok(cropBounds.y>=0&&cropBounds.y2<=height);
        if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cropBounds.x,y:cropBounds.y}]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cropBounds.x2,y:cropBounds.y2}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:cropBounds.x,y:cropBounds.y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:cropBounds.x2,y:cropBounds.y2,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:cropBounds.x2,y:cropBounds.y2,button:'left',clickCount:1});}
        await evaluate('document.querySelector("#retouch-crop").click();document.querySelector("#retouch-compare").click()');await until('document.querySelector("#retouch-preview-canvas").width<640&&!document.querySelector("#retouch-after-canvas").hidden');
        const manualCrop=await evaluate('({width:document.querySelector("#retouch-preview-canvas").width,height:document.querySelector("#retouch-preview-canvas").height})');assert.ok(Math.abs(manualCrop.width/manualCrop.height-4/3)<.01);assert.ok(Math.abs(manualCrop.width-384)<3);assert.ok(Math.abs(manualCrop.height-288)<3);
        await writeFile(path.join(output,name+'-crop.json'),JSON.stringify({input:width<500?'touch':'mouse',cropBounds,manualCrop},null,2));
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".retouch-workspace")).paddingTop'),'0px');
        await evaluate('document.querySelector(".photo-studio-dialog").scrollTop=0');
        const modal=await command('Runtime.evaluate',{expression:"(()=>{const dialog=document.querySelector('.photo-editor-dialog');const rect=dialog.getBoundingClientRect();return {left:rect.left,right:rect.right,width:dialog.clientWidth,scroll:dialog.scrollWidth};})()",returnByValue:true});
        assert.ok(modal.result.value.left>=0&&modal.result.value.right<=width);assert.ok(modal.result.value.scroll<=modal.result.value.width);
      }
      const layout=await command('Runtime.evaluate',{expression:'({viewport:innerWidth,document:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector("h1").textContent})',returnByValue:true});
      const report=layout.result.value;
      await writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));
      if(report.viewport!==width||report.scrollWidth>width){
        const overflowing=await command('Runtime.evaluate',{expression:`[...document.querySelectorAll('#agent-content *')].filter(element=>element.getBoundingClientRect().right>${width}).map(element=>({tag:element.tagName,class:element.className,right:element.getBoundingClientRect().right})).slice(0,20)`,returnByValue:true});
        throw Error('Débordement ou viewport incorrect : '+JSON.stringify({report,overflowing:overflowing.result.value}));
      }
      if(page==='leads'&&width<500){
        const card=await command('Runtime.evaluate',{expression:`(()=>{const row=document.querySelector('[data-lead]');return {text:row.textContent,cells:[...row.cells].map(cell=>{const rect=cell.getBoundingClientRect();return {left:rect.left,right:rect.right,width:cell.clientWidth,scroll:cell.scrollWidth};})};})()`,returnByValue:true});
        assert.match(card.result.value.text,/paul@example.com/);assert.match(card.result.value.text,/0601020304/);
        for(const cell of card.result.value.cells){assert.ok(cell.left>=0&&cell.right<=width);assert.ok(cell.scroll<=cell.width);}
      }
      if(['lead-detail','lead-timeline'].includes(page)){
        const content=await command('Runtime.evaluate',{expression:"document.querySelector('.lead-drawer').textContent",returnByValue:true});
        assert.match(content.result.value,/Paul Dupont/);assert.match(content.result.value,/12 min 38 s/);
        assert.match(content.result.value,/Pièce consultée · Salon/);assert.match(content.result.value,/Intérêt exprimé/);
        assert.match(content.result.value,/Préparer la seconde visite/);
      }
      if(name==='agent-lead-detail-desktop'){
        await command('Runtime.evaluate',{expression:"document.querySelector('#lead-stage').value='visit';document.querySelector('#lead-stage').dispatchEvent(new Event('change',{bubbles:true}));"});
        let stageSaved=false;
        for(let attempt=0;attempt<50;attempt++){
          const fresh=await (await fetch(origin+'/api/agent/activity',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();
          if(fresh.leads.find(lead=>lead.id===prospect.id)?.stage==='visit'){stageSaved=true;break;}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.ok(stageSaved,'Le statut choisi dans la fiche doit être enregistré sur le serveur.');
        await command('Runtime.evaluate',{expression:"document.querySelector('#lead-note-form textarea').value='Vendredi à 15 h confirmé.';document.querySelector('#lead-note-form').requestSubmit();"});
        let noteSaved=false;
        for(let attempt=0;attempt<50;attempt++){
          const content=await command('Runtime.evaluate',{expression:"document.querySelector('.lead-drawer[open]')?.textContent||''",returnByValue:true});
          if(content.result.value.includes('Vendredi à 15 h confirmé.')){noteSaved=true;break;}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.ok(noteSaved,'La note saisie doit revenir du serveur dans la fiche actualisée.');
      }
      if(page==='lead-timeline')await command('Runtime.evaluate',{expression:"const drawer=document.querySelector('.lead-drawer');drawer.scrollTop=drawer.scrollHeight;"});
      let capture={format:'png',captureBeyondViewport:false};if(['settings','leads','distribution','share-editor','new-editor','studio-editor','buyer-experience','buyer-private'].includes(page)){const size=await command('Runtime.evaluate',{expression:'document.documentElement.scrollHeight',returnByValue:true});capture={format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:size.result.value,scale:1}};}
      const picture=await command('Page.captureScreenshot',capture);
      await writeFile(screenshot,Buffer.from(picture.data,'base64'));
      if(buyerFixture){
        const evaluate=async expression=>(await command('Runtime.evaluate',{expression,returnByValue:true})).result.value;
        const until=async expression=>{for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Partage client incomplet : '+expression);};
        // Deliberate permission failure in this isolated browser to exercise the manual fallback.
        await evaluate('Object.defineProperty(navigator,"share",{configurable:true,value:undefined});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new DOMException("Refus de test","NotAllowedError")}}});document.querySelector("#share").click()');
        await until('Boolean(document.querySelector("#buyer-share-dialog")?.open)');
        const sharedURL=await evaluate('document.querySelector("#buyer-share-url").value');
        assert.match(new URL(sharedURL).pathname,/^\/share\/[A-Za-z0-9_-]{32}$/);
        const bounds=await evaluate('(()=>{const dialog=document.querySelector("#buyer-share-dialog"),rect=dialog.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:dialog.clientWidth,scroll:dialog.scrollWidth}})()');
        assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=height);assert.ok(bounds.scroll<=bounds.width);
        await evaluate('document.querySelector("#buyer-copy-version").click()');
        await until('document.querySelector("#buyer-share-status").textContent.includes("Sélectionnez")');
        const fallback=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await writeFile(path.join(output,name+'-share-dialog.png'),Buffer.from(fallback.data,'base64'));
        const response=await fetch(origin+'/api/shared?token='+new URL(sharedURL).pathname.split('/').at(-1));assert.equal(response.status,200);
        const shared=await response.json();assert.deepEqual(Object.keys(shared).sort(),['image','label','original','room','title']);assert.equal(shared.original,media.url);
        await command('Page.navigate',{url:sharedURL});
        await until('document.querySelectorAll(".workspace img").length===2&&[...document.querySelectorAll(".workspace img")].every(image=>image.naturalWidth>0)');
        assert.equal(await evaluate('document.querySelector("#contact-form")'),null);
        assert.ok(!(await evaluate('document.querySelector("#app").textContent')).includes(buyerFixture.name));
        const layout=await evaluate('({viewport:innerWidth,document:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})');assert.equal(layout.scrollWidth,width);
        await writeFile(path.join(output,name+'-shared.json'),JSON.stringify({layout,publicFields:Object.keys(shared),coordinatesExposed:false},null,2));
        const sharedHeight=await evaluate('document.documentElement.scrollHeight');
        const opened=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:sharedHeight,scale:1}});
        await writeFile(path.join(output,name+'-shared.png'),Buffer.from(opened.data,'base64'));
        await command('Page.navigate',{url:origin+'/agent?visual=leads'});
        await until('Boolean(document.querySelector('+JSON.stringify('[data-lead="'+buyerFixture.visitLead+'"]')+'))');
        await evaluate(`document.querySelector('[data-lead="${buyerFixture.visitLead}"]').click()`);
        await until('Boolean(document.querySelector(".lead-drawer[open]"))');
        const requestText=await evaluate('document.querySelector(".lead-drawer").textContent');
        assert.ok(requestText.includes('Demande de visite'));assert.ok(requestText.includes('Vendredi après 18 h'));assert.ok(requestText.includes('Demande client · visit'));assert.ok(!requestText.includes('Très intéressé'));assert.ok(requestText.includes('Plan ouvert'));
        const agency=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await writeFile(path.join(output,name+'-visit-agent.png'),Buffer.from(agency.data,'base64'));

      }
      if(page==='photo-editor'){
        if(width<500){
          await command('Runtime.evaluate',{expression:"const dialog=document.querySelector('.photo-editor-dialog');dialog.scrollTop=dialog.scrollHeight;"});
          const action=await command('Runtime.evaluate',{expression:"(()=>{const rect=document.querySelector('#retouch-form .agent-primary').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};})()",returnByValue:true});
          assert.ok(action.result.value.top>=0&&action.result.value.bottom<=height,'Le bouton de retouche doit être accessible après défilement du dialog.');
          const footer=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
          await writeFile(path.join(output,'agent-retouch-actions-mobile.png'),Buffer.from(footer.data,'base64'));
        }
        await command('Runtime.evaluate',{expression:"document.querySelector('#retouch-form').requestSubmit();"});
        let finished=false;
        for(let attempt=0;attempt<100;attempt++){
          const state=await command('Runtime.evaluate',{expression:"!document.querySelector('.photo-editor-dialog')&&!document.querySelector('#app').inert",returnByValue:true});
          if(state.result.value){finished=true;break;}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.ok(finished,'La retouche doit se terminer et rendre la main.');
        await command('Runtime.evaluate',{expression:"document.querySelector('#save-draft').click();"});
        let stored=false;
        for(let attempt=0;attempt<100;attempt++){
          const fresh=await (await fetch(origin+'/api/agent/sync-feed',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json();
          const room=fresh.properties.find(property=>property.slug===dossier.slug).rooms[0];
          if(room.photos.length===photoCount+1){assert.ok(room.photos.includes(media.url));stored=true;break;}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.ok(stored,'La nouvelle photo doit être ajoutée au dossier avec l’original.');
        const original=Buffer.from(await (await fetch(origin+media.url)).arrayBuffer());assert.deepEqual(original,image);
        await until('!document.querySelector("#app").inert&&document.querySelector("#undo-photos").disabled');
        await evaluate(`document.querySelector('#add-room').click();const fields=document.querySelectorAll('[data-room-name]');const field=fields[fields.length-1];field.value='Photos complémentaires';field.dispatchEvent(new Event('input'));document.querySelector('[data-duplicate-photo="0,0"]').click()`);
        const organizer=await evaluate('(()=>{const summary=document.querySelector(".photo-organize summary");summary.scrollIntoView({behavior:"instant",block:"center"});const r=summary.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
        if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:organizer.x,y:organizer.y}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
        else{await command('Input.dispatchMouseEvent',{type:'mousePressed',x:organizer.x,y:organizer.y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:organizer.x,y:organizer.y,button:'left',clickCount:1});}
        await until('document.querySelector(".photo-organize").open');
        const libraryLayout=await evaluate('(()=>{const panel=document.querySelector(".photo-organize[open]");return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:[...panel.querySelectorAll("button,select")].map(control=>{const r=control.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}})}})()');
        assert.equal(libraryLayout.scrollWidth,width);assert.ok(libraryLayout.controls.every(rect=>rect.left>=0&&rect.right<=width&&rect.width>0));
        const libraryCapture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'-library.png'),Buffer.from(libraryCapture.data,'base64'));
        const targetRoom=await evaluate(`(()=>{const field=document.querySelector('[data-photo-room="0,1"]');field.value=field.options[field.options.length-1].value;const target=field.value;field.dispatchEvent(new Event('change'));return target})()`);
        assert.equal(await evaluate(`document.querySelector('[data-room-editor="${targetRoom}"]').querySelectorAll('article').length`),1);
        await evaluate('document.querySelector("#undo-photos").click()');assert.equal(await evaluate(`document.querySelector('[data-room-editor="${targetRoom}"]').querySelectorAll('article').length`),0);
        await evaluate('document.querySelector("#redo-photos").click();document.querySelector("#save-draft").click()');
        await until('!document.querySelector("#app").inert&&document.querySelector("#undo-photos").disabled');
        const saved=(await (await fetch(origin+'/api/agent/sync-feed',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}})).json()).properties.find(property=>property.slug===dossier.slug);
        assert.deepEqual(saved.rooms.find(room=>room.id===targetRoom).photos,[media.url]);assert.equal(saved.hero,media.url);assert.ok(saved.rooms[0].photos.includes(media.url));
        assert.deepEqual(Buffer.from(await (await fetch(origin+media.url)).arrayBuffer()),image);
        await writeFile(path.join(output,name+'-library.json'),JSON.stringify({libraryLayout,duplicate:true,move:true,undo:true,redo:true,originalUnchanged:true,targetRoom,storedPhotos:saved.rooms.find(room=>room.id===targetRoom).photos,browserErrors},null,2));
      }
      assert.deepEqual(browserErrors,[],'Le navigateur ne doit pas produire une exception runtime.');console.log(screenshot);
    }finally{
      socket?.close();
      child.kill('SIGTERM');
      if(child.exitCode===null&&child.signalCode===null)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);
      if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    }
  }
  if(requestedCases?.size)throw Error('Vues inconnues : '+[...requestedCases].join(', '));
}finally{
  await new Promise(resolve=>surface.close(resolve));
  await rm(temporary,{recursive:true,force:true});
}
