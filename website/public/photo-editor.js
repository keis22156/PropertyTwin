window.PropertyTwinPhotoEditor=function({title,photos,initial,onSave}){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ranges=[['exposure','Exposition',-2,2,.05,0,' EV'],['brightness','Luminosité',.5,1.5,.01,1,' %'],['contrast','Contraste',-50,50,1,0,''],['highlights','Hautes lumières',-100,100,1,0,''],['shadows','Ombres',-100,100,1,0,''],['temperature','Température',-100,100,1,0,''],['tint','Teinte · balance des blancs',-100,100,1,0,''],['saturation','Saturation',0,2,.01,1,' %'],['sharpness','Netteté',0,100,1,0,''],['straighten','Redresser',-15,15,.1,0,'°']];
 const dialog=document.createElement('dialog');dialog.className='photo-editor-dialog photo-studio-dialog';
 dialog.innerHTML=`<div class="photo-editor-heading"><div><div class="agent-kicker">PHOTO STUDIO</div><h2>${esc(title)}</h2></div><button class="photo-editor-close" aria-label="Fermer">×</button></div><div class="retouch-topbar"><div><button id="retouch-undo" type="button" disabled>↶ Annuler</button><button id="retouch-redo" type="button" disabled>↷ Rétablir</button></div><div><button id="retouch-original" type="button" aria-pressed="false">Original</button><button id="retouch-compare" type="button" aria-pressed="false">Avant / Après</button><button id="retouch-crop" type="button" aria-pressed="false">Recadrer</button><button id="retouch-save-top" class="agent-primary" type="submit" form="retouch-form" disabled>Enregistrer la version</button></div></div><div class="photo-editor-content"><aside class="retouch-sources" aria-label="Photos du bien">${photos.map((photo,i)=>`<button type="button" data-retouch-source="${i}" ${photo.editable===false?'disabled':''}><img src="${esc(photo.thumbnail||photo.url)}" alt="${esc(photo.name)}" loading="lazy"><span>${esc(photo.name)}</span></button>`).join('')}</aside><section class="retouch-workspace"><p id="retouch-loading" role="status">Chargement de la photo…</p><div class="retouch-preview"><div class="retouch-canvas-wrap"><canvas id="retouch-preview-canvas" aria-label="Aperçu de la retouche" hidden></canvas><canvas id="retouch-after-canvas" aria-hidden="true" hidden></canvas><div id="retouch-crop-box" hidden></div></div></div><label id="retouch-comparison" hidden>Comparer avant et après<input id="retouch-comparison-range" type="range" min="0" max="100" value="50"></label><p id="retouch-crop-help" hidden>Tracez un rectangle sur l’image. Choisissez le format à droite, puis cliquez à nouveau sur Recadrer pour voir le résultat.</p></section><form id="retouch-form"><button id="auto-enhance" type="button">✧ Amélioration automatique</button><button id="retouch-white-balance" type="button">Balance des blancs auto</button>${ranges.map(([id,label,min,max,step,value])=>`<label>${label}<output data-retouch-output="${id}"></output><input name="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`).join('')}<label>Rotation<select name="rotation"><option value="0">Originale</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label><label>Format<select name="crop"><option value="original">Libre / Original</option><option>4:3</option><option>16:9</option><option>1:1</option></select></label><div class="retouch-actions"><button type="reset">Réinitialiser les réglages</button><button class="agent-primary" disabled>Créer la version retouchée</button></div><p>L’original est conservé. Retouches gratuites, sans crédit IA.</p><p id="retouch-error" role="alert"></p><button id="retry-retouch" type="button" hidden>Réessayer le chargement</button></form></div>`;
 document.body.append(dialog);dialog.showModal();
 const form=dialog.querySelector('#retouch-form'),canvas=dialog.querySelector('#retouch-preview-canvas'),after=dialog.querySelector('#retouch-after-canvas'),cropBox=dialog.querySelector('#retouch-crop-box');
 const histories=new Map();let engine,source,current=initial,state,processing=false,closed=false,loadVersion=0,frame,mode='edited',cropStart;
 const error=message=>{dialog.querySelector('#retouch-error').textContent=message;};
 const clone=value=>structuredClone(value),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function selectedState(){const photo=photos[current],key=photo.room+'|'+photo.url;if(!histories.has(key))histories.set(key,{settings:clone(engine.defaults),undo:[],redo:[]});return histories.get(key);}
 function readSettings(){const values=Object.fromEntries(new FormData(form));for(const [key] of ranges)values[key]=Number(values[key]);values.rotation=Number(values.rotation);values.cropRect=state.settings.cropRect;return engine.validateSettings(values);}
 function controls(){
  dialog.querySelector('#retouch-undo').disabled=!source||!state?.undo.length;dialog.querySelector('#retouch-redo').disabled=!source||!state?.redo.length;
  form.querySelector('.agent-primary').disabled=!source;dialog.querySelector('#retouch-save-top').disabled=!source;dialog.querySelector('#auto-enhance').disabled=!source;dialog.querySelector('#retouch-white-balance').disabled=!source;
  form.querySelectorAll('input,select,[type=reset]').forEach(control=>control.disabled=!source);
  for(const [key,,, , , ,unit] of ranges){const value=Number(form.elements[key].value);dialog.querySelector('[data-retouch-output="'+key+'"]').textContent=(unit===' %'?Math.round(value*100):Math.round(value*100)/100)+unit;}
  for(const [id,name] of [['retouch-original','original'],['retouch-compare','compare'],['retouch-crop','crop']]){dialog.querySelector('#'+id).setAttribute('aria-pressed',String(mode===name));dialog.querySelector('#'+id).disabled=!source;}
  dialog.querySelector('#retouch-comparison').hidden=mode!=='compare';dialog.querySelector('#retouch-crop-help').hidden=mode!=='crop';cropBox.hidden=mode!=='crop';
 }
 function syncForm(){for(const [key,value] of Object.entries(state.settings))if(form.elements[key])form.elements[key].value=value;controls();}
 function change(next){const old=state.settings;next=engine.validateSettings(next);if(!equal(old,next)){state.undo.push(clone(old));if(state.undo.length>50)state.undo.shift();state.redo=[];state.settings=next;}syncForm();schedule();}
 function render(){
  if(closed||!source)return;
  const settings=state.settings,full={...settings,crop:'original',cropRect:clone(engine.defaults.cropRect)};
  const result=mode==='original'?engine.transformPixels(source,engine.defaults):engine.renderPixels(source,mode==='crop'?full:settings);
  const before=mode==='compare'?engine.transformPixels(source,settings):result;
  canvas.width=before.width;canvas.height=before.height;canvas.getContext('2d').putImageData(new ImageData(before.data,before.width,before.height),0,0);canvas.hidden=false;
  after.hidden=mode!=='compare';
  if(mode==='compare'){after.width=result.width;after.height=result.height;after.getContext('2d').putImageData(new ImageData(result.data,result.width,result.height),0,0);after.style.clipPath='inset(0 '+(100-dialog.querySelector('#retouch-comparison-range').value)+'% 0 0)';}
  if(mode==='crop'){const g=engine.cropGeometry(source.width,source.height,settings);Object.assign(cropBox.style,{left:g.x/g.rotatedWidth*100+'%',top:g.y/g.rotatedHeight*100+'%',width:g.width/g.rotatedWidth*100+'%',height:g.height/g.rotatedHeight*100+'%'});}
  const maxWidth=Math.max(1,(dialog.querySelector('.retouch-preview').clientWidth||before.width+24)-24),maxHeight=innerHeight*(innerWidth<600?.38:.55),fit=Math.min(1,maxWidth/before.width,maxHeight/before.height);
  const wrap=dialog.querySelector('.retouch-canvas-wrap');wrap.style.width=before.width*fit+'px';wrap.style.height=before.height*fit+'px';
 }
 function schedule(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=null;try{render();}catch(e){error(e.message);}});}
 async function load(){
  const version=++loadVersion;source=null;mode='edited';cropStart=null;canvas.hidden=after.hidden=cropBox.hidden=true;controls();error('');dialog.querySelector('#retouch-loading').textContent='Chargement de la photo…';dialog.querySelector('#retry-retouch').hidden=true;
  dialog.querySelectorAll('[data-retouch-source]').forEach(button=>button.classList.toggle('selected',Number(button.dataset.retouchSource)===current));
  try{
   engine||=window.PropertyTwinRetouch||await import('/retouch-engine.mjs');state=selectedState();syncForm();
   const image=new Image();image.crossOrigin='anonymous';await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{image.onload=image.onerror=null;image.src='';reject(Error('Le chargement de la photo a expiré. Réessayez.'));},30000);
    image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('Impossible de lire cette photo. Réessayez son import.'));};image.src=photos[current].url;
   });
   if(closed||version!==loadVersion)return;
   const scale=Math.min(1,960/Math.max(image.naturalWidth,image.naturalHeight)),buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.round(image.naturalWidth*scale));buffer.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const context=buffer.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,buffer.width,buffer.height);source=context.getImageData(0,0,buffer.width,buffer.height);state=selectedState();syncForm();render();dialog.querySelector('#retouch-loading').textContent=photos[current].name+' · Aperçu local';
  }catch(e){if(closed||version!==loadVersion)return;error(e.name==='SecurityError'?'La photo ne permet pas la retouche locale. Importez-la à nouveau dans le dossier.':e.message);dialog.querySelector('#retouch-loading').textContent='Photo indisponible';dialog.querySelector('#retry-retouch').hidden=false;}
 }
 form.oninput=()=>{if(!source)return;controls();scheduleDraft();};
 function scheduleDraft(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=null;const committed=state.settings;try{state.settings=readSettings();render();}catch(e){error(e.message);}finally{state.settings=committed;}});}
 form.onchange=e=>{if(!source)return;const next=readSettings();if(e.target.name==='rotation')next.cropRect=clone(engine.defaults.cropRect);change(next);};
 form.onreset=e=>{e.preventDefault();if(source)change(engine.defaults);};
 for(const [id,action,opposite] of [['retouch-undo','undo','redo'],['retouch-redo','redo','undo']])dialog.querySelector('#'+id).onclick=()=>{if(!source)return;const draft=readSettings();if(!equal(draft,state.settings))change(draft);if(!state[action].length)return;state[opposite].push(clone(state.settings));state.settings=state[action].pop();syncForm();schedule();};
 for(const [id,nextMode] of [['retouch-original','original'],['retouch-compare','compare'],['retouch-crop','crop']])dialog.querySelector('#'+id).onclick=()=>{if(!source)return;change(readSettings());mode=mode===nextMode?'edited':nextMode;controls();schedule();};
 dialog.querySelector('#auto-enhance').onclick=()=>{if(!source)return;const improved=engine.autoEnhance(source);change({...readSettings(),...improved,rotation:state.settings.rotation,straighten:state.settings.straighten,crop:state.settings.crop,cropRect:state.settings.cropRect});};
 dialog.querySelector('#retouch-white-balance').onclick=()=>{if(!source)return;const {temperature,tint}=engine.autoEnhance(source);change({...readSettings(),temperature,tint});};
 dialog.querySelector('#retouch-comparison-range').oninput=e=>{after.style.clipPath='inset(0 '+(100-e.target.value)+'% 0 0)';};
 const point=e=>{const rect=canvas.getBoundingClientRect();return {x:Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width)),y:Math.min(1,Math.max(0,(e.clientY-rect.top)/rect.height))};};
 canvas.onpointerdown=e=>{if(mode!=='crop'||!source||e.button!==0)return;e.preventDefault();cropStart=point(e);canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!cropStart)return;const end=point(e);Object.assign(cropBox.style,{left:Math.min(cropStart.x,end.x)*100+'%',top:Math.min(cropStart.y,end.y)*100+'%',width:Math.abs(end.x-cropStart.x)*100+'%',height:Math.abs(end.y-cropStart.y)*100+'%'});};
 canvas.onpointerup=e=>{if(!cropStart)return;const end=point(e),cropRect={x:Math.min(cropStart.x,end.x),y:Math.min(cropStart.y,end.y),width:Math.abs(end.x-cropStart.x),height:Math.abs(end.y-cropStart.y)};cropStart=null;if(cropRect.width>=.05&&cropRect.height>=.05)change({...readSettings(),cropRect});else schedule();};
 canvas.onpointercancel=()=>{cropStart=null;schedule();};
 dialog.querySelectorAll('[data-retouch-source]').forEach(button=>button.onclick=()=>{if(source)change(readSettings());current=Number(button.dataset.retouchSource);load();});
 dialog.querySelector('#retry-retouch').onclick=load;
 window.addEventListener('resize',schedule);
 dialog.querySelector('.photo-editor-close').onclick=()=>{if(!processing)dialog.close();};dialog.oncancel=e=>{if(processing)e.preventDefault();};dialog.onclose=()=>{closed=true;loadVersion++;if(frame)cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);dialog.remove();};
 form.onsubmit=async e=>{
  e.preventDefault();if(!source||processing)return;change(readSettings());processing=true;dialog.inert=true;const button=form.querySelector('.agent-primary');button.textContent='Retouche en cours…';error('');
  try{await onSave(photos[current],clone(state.settings));processing=false;dialog.close();}
  catch(e){error(e.message);}
  finally{processing=false;dialog.inert=false;button.textContent='Créer la version retouchée';}
 };
 load();return dialog;
};
