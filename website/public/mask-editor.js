window.PropertyTwinMaskEditor=function({photo,onSubmit}){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('dialog');dialog.className='mask-editor-dialog';
 dialog.innerHTML=`<header class="mask-heading"><div><div class="agent-kicker">GOMME IA</div><h2>Retirer un objet · ${esc(photo.name)}</h2></div><button id="close-mask" type="button" aria-label="Fermer">×</button></header><div class="mask-topbar"><button id="undo-mask" type="button" disabled>↶ Annuler</button><button id="redo-mask" type="button" disabled>↷ Rétablir</button><button id="reset-mask" type="button" disabled>Réinitialiser</button></div><div class="mask-layout"><div class="mask-workspace"><p id="mask-loading" role="status">Chargement de la photo…</p><div class="mask-preview"><div class="mask-image-wrap"><img id="mask-source" alt="Photo originale" draggable="false"><canvas id="mask-overlay" aria-label="Sélectionner l’objet à retirer" hidden></canvas></div></div></div><form id="mask-form"><h3>Sélectionnez l’objet</h3><p>Peignez sur l’objet à retirer. La zone bleue sera envoyée à l’IA ; l’original est conservé.</p><div class="mask-tools"><button id="mask-brush" type="button" aria-pressed="true" disabled>Pinceau</button><button id="mask-erase" type="button" aria-pressed="false" disabled>Effacer le masque</button></div><label>Taille du pinceau <output id="mask-size-value">6 %</output><input id="mask-size" type="range" min="1" max="20" value="6" disabled></label><label>Précision facultative<textarea name="prompt" maxlength="800" placeholder="Retirer uniquement le canapé, conserver le tapis et le parquet."></textarea></label><button id="submit-mask" class="agent-primary" disabled>Supprimer l’objet</button><p class="muted">1 crédit IA. Dessiner et corriger la sélection est gratuit. Une tâche échouée est remboursée.</p><p id="mask-error" role="alert"></p><button id="retry-mask" type="button" hidden>Réessayer le chargement</button></form></div>`;
 document.body.append(dialog);dialog.showModal();
 const canvas=dialog.querySelector('#mask-overlay'),image=dialog.querySelector('#mask-source'),form=dialog.querySelector('#mask-form');
 let history,drawMask,loaded=false,closed=false,busy=false,mode='paint',stroke,frame,version=0,loadingTimer;
 const message=value=>{dialog.querySelector('#mask-error').textContent=value;};
 function controls(){
  dialog.querySelector('#undo-mask').disabled=!loaded||!history?.canUndo;dialog.querySelector('#redo-mask').disabled=!loaded||!history?.canRedo;dialog.querySelector('#reset-mask').disabled=!loaded||!history?.strokes.length;
  for(const id of ['mask-brush','mask-erase','mask-size'])dialog.querySelector('#'+id).disabled=!loaded;
  dialog.querySelector('#submit-mask').disabled=!loaded||!history?.strokes.some(s=>s.mode==='paint');
  for(const id of ['mask-brush','mask-erase'])dialog.querySelector('#'+id).setAttribute('aria-pressed',String((id==='mask-brush')===(mode==='paint')));
  canvas.style.cursor=mode==='paint'?'crosshair':'cell';
 }
 function render(){if(!loaded||closed)return;drawMask(canvas.getContext('2d'),canvas.width,canvas.height,[...history.strokes,...(stroke?[stroke]:[])],{overlay:true});}
 function schedule(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=null;render();});}
 function fit(){if(!loaded||closed)return;const maxWidth=Math.max(1,dialog.querySelector('.mask-preview').clientWidth-24),maxHeight=innerHeight*(innerWidth<600?.4:.58),scale=Math.min(1,maxWidth/image.naturalWidth,maxHeight/image.naturalHeight);const wrap=dialog.querySelector('.mask-image-wrap');wrap.style.width=image.naturalWidth*scale+'px';wrap.style.height=image.naturalHeight*scale+'px';}
 async function load(){
  const attempt=++version;loaded=false;stroke=null;canvas.hidden=true;controls();message('');dialog.querySelector('#retry-mask').hidden=true;dialog.querySelector('#mask-loading').textContent='Chargement de la photo…';
  try{
   const engine=window.PropertyTwinMask||await import('/mask-history.mjs');drawMask=engine.drawMask;history||=engine.createMaskHistory();
   await new Promise((resolve,reject)=>{clearTimeout(loadingTimer);loadingTimer=setTimeout(()=>{image.onload=image.onerror=null;reject(Error('Le chargement a expiré. Vérifiez la connexion et réessayez.'));},30000);image.onload=()=>{clearTimeout(loadingTimer);resolve();};image.onerror=()=>{clearTimeout(loadingTimer);reject(Error('La photo est indisponible. Réessayez son chargement.'));};image.src=photo.url;});
   if(closed||attempt!==version)return;
   if(image.naturalWidth>8192||image.naturalHeight>8192||image.naturalWidth*image.naturalHeight>40000000)throw Error('La photo dépasse 40 mégapixels. Importez une version réduite.');
   const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));loaded=true;canvas.hidden=false;controls();render();fit();dialog.querySelector('#mask-loading').textContent=photo.name+' · Sélection manuelle';
  }catch(error){if(closed||attempt!==version)return;message(error.message);dialog.querySelector('#mask-loading').textContent='Photo indisponible';dialog.querySelector('#retry-mask').hidden=false;}
 }
 function point(event){const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
 canvas.onpointerdown=event=>{if(!loaded||busy||stroke||event.button!==0)return;event.preventDefault();message('');stroke={mode,size:Number(dialog.querySelector('#mask-size').value)/100,points:[point(event)],pointer:event.pointerId};canvas.setPointerCapture(event.pointerId);schedule();};
 canvas.onpointermove=event=>{if(!stroke||stroke.pointer!==event.pointerId)return;event.preventDefault();if(stroke.points.length<3000)stroke.points.push(point(event));schedule();};
 canvas.onpointerup=event=>{if(!stroke||stroke.pointer!==event.pointerId)return;const completed=stroke;stroke=null;try{if(completed.points.length<3000)completed.points.push(point(event));history.add(completed);message('');}catch(error){message(error.message);}controls();schedule();};
 canvas.onpointercancel=()=>{stroke=null;schedule();};canvas.onlostpointercapture=()=>{if(stroke){stroke=null;schedule();}};
 for(const [id,action] of [['undo-mask','undo'],['redo-mask','redo'],['reset-mask','reset']])dialog.querySelector('#'+id).onclick=()=>{stroke=null;history[action]();message('');controls();schedule();};
 for(const [id,value] of [['mask-brush','paint'],['mask-erase','erase']])dialog.querySelector('#'+id).onclick=()=>{mode=value;controls();};
 dialog.querySelector('#mask-size').oninput=event=>{dialog.querySelector('#mask-size-value').textContent=event.target.value+' %';};
 dialog.querySelector('#retry-mask').onclick=load;dialog.querySelector('#close-mask').onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=event=>{if(busy)event.preventDefault();};
 dialog.onclose=()=>{closed=true;version++;clearTimeout(loadingTimer);image.onload=image.onerror=null;if(frame)cancelAnimationFrame(frame);window.removeEventListener('resize',fit);dialog.remove();};window.addEventListener('resize',fit);
 form.onsubmit=async event=>{
  event.preventDefault();if(!loaded||busy||stroke)return;message('');
  let mask;
  try{
  const output=document.createElement('canvas');output.width=image.naturalWidth;output.height=image.naturalHeight;drawMask(output.getContext('2d'),output.width,output.height,history.strokes);
  const pixels=output.getContext('2d').getImageData(0,0,output.width,output.height).data;let selected=false;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>=128){selected=true;break;}
  if(!selected){message('Sélectionnez au moins un objet sur la photo.');return;}
  const base64=output.toDataURL('image/png').split(',')[1];if(base64.length>2800000){message('La sélection est trop complexe. Simplifiez vos traits.');return;}
  mask={base64,width:output.width,height:output.height};
  }catch(error){message(error.message||'La sélection n’a pas pu être exportée. Réessayez.');return;}
  busy=true;dialog.inert=true;dialog.querySelector('#submit-mask').textContent='Envoi de la sélection…';
  try{await onSubmit(mask,form.elements.prompt.value,()=>{busy=false;dialog.close();});}
  catch(error){if(!closed)message(error.message);}
  finally{busy=false;if(!closed){dialog.inert=false;dialog.querySelector('#submit-mask').textContent='Supprimer l’objet';}}
 };
 load();return dialog;
};
