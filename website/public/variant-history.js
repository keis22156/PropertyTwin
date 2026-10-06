window.PropertyTwinVariantHistory=function({root,variants,photo,photos=[],sourceId,onSource,onCompare,onChange,onReload,update,notify,hd={},onHD}){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const items=variants,byId=new Map(items.map(v=>[v.id,v])),ordered=[],seen=new Set();
 function visit(v,depth){if(seen.has(v.id))return;seen.add(v.id);ordered.push({v,depth});for(const child of items.filter(child=>child.parentVariantId===v.id))visit(child,depth+1);}
 for(const v of items.filter(v=>!byId.has(v.parentVariantId)))visit(v,0);
 for(const v of items)visit(v,0);
 const hasOriginal=v=>photos.some(p=>p.room===v.room&&p.url===v.original);
 function hdButton(v){
  if(v.quality==='hd')return '';
  const priceReady=Number.isInteger(hd.credits)&&hd.credits>0;
  const reason=!hd.enabled||!priceReady?'Fournisseur HD indisponible':!Number.isInteger(hd.balance)||hd.balance<hd.credits?'Crédits insuffisants':!/^(data:image\/|\/media\/)/.test(v.image)?'Image distante : rendu HD indisponible':!hasOriginal(v)?'Photo originale retirée du bien':'';
  return `<button type="button" data-variant-hd="${esc(v.id)}" data-hd-eligible="${!reason}" ${reason||hd.busy?'disabled':''} title="${reason||'Créer une version haute définition'}">Générer en HD${priceReady?' · '+hd.credits+' crédits':''}</button>`;
 }
 root.className='variant-history';
 root.innerHTML=`<div class="variant-history-heading"><div><h3>Historique des photos</h3><p>${items.filter(v=>!v.deletedAt).length} version(s) · vos originaux sont conservés</p></div><button type="button" data-variant-original ${sourceId?'':'disabled'}>Repartir de l’original</button></div><p class="variant-hd-status">${hd.enabled?`Rendu HD : ${hd.credits} crédits supplémentaires. Une nouvelle version conserve la composition choisie.`:hd.message||'Rendu HD indisponible : fournisseur non configuré.'}</p><ol class="variant-tree"><li class="variant-original">Photo sélectionnée · ${esc(photo.name)}</li>${ordered.map(({v,depth})=>`<li style="--variant-depth:${Math.min(depth,5)}" class="variant-node ${v.deletedAt?'variant-deleted':''} ${v.id===sourceId?'variant-source-selected':''}" data-variant-node="${esc(v.id)}">${v.deletedAt?'<span class="variant-tombstone">↳</span>':`<img src="${esc(v.image)}" alt="${esc(v.label)}" loading="lazy">`}<div class="variant-node-info"><strong>${esc(v.label)}</strong><small>${esc(photos.find(p=>p.room===v.room&&p.url===v.original)?.name||v.room)} · Photo ${Math.max(1,photos.filter(p=>p.room===v.room).findIndex(p=>p.url===v.original)+1)}</small><small class="variant-parent-label">Depuis ${esc(byId.get(v.parentVariantId)?.label||'l’original')}</small>${v.quality==='hd'?`<small class="variant-hd-badge">HD${v.dimensions?' · '+esc(v.dimensions.width)+' × '+esc(v.dimensions.height)+' px':''}</small>`:''}${v.visualizationNonContractual?'<small>Visualisation non contractuelle</small>':''}${v.id===sourceId?'<small class="variant-source-badge">Source de la prochaine transformation</small>':''}</div><div class="variant-node-actions">${v.deletedAt?`<button type="button" data-variant-restore="${esc(v.id)}">Restaurer</button>`:`<button type="button" data-agent-variant="${esc(v.id)}" ${photos.some(p=>p.room===v.room&&p.url===v.original)?'':'disabled title="Photo originale retirée du bien"'}>Comparer</button><button type="button" data-variant-source="${esc(v.id)}" ${photos.some(p=>p.room===v.room&&p.url===v.original)?'':'disabled title="Photo originale retirée du bien"'}>Continuer cette version</button><button type="button" data-variant-favorite="${esc(v.id)}" aria-pressed="${Boolean(v.favorite)}" aria-label="${v.favorite?'Retirer des favoris':'Ajouter aux favoris'}">${v.favorite?'★':'☆'}</button><button type="button" data-variant-rename="${esc(v.id)}">Renommer</button><button type="button" data-variant-download="${esc(v.id)}">Télécharger</button>${hdButton(v)}<button type="button" data-variant-delete="${esc(v.id)}">Supprimer</button>`}</div></li>`).join('')}</ol>`;
 root.querySelector('[data-variant-original]').onclick=()=>onSource(null);
 const find=id=>byId.get(id);
 const reload=async()=>{try{return await onReload();}catch(error){notify(error.message);return null;}};
 async function change(v,patch,button){
  button.disabled=true;
  try{onChange(await update({id:v.id,revision:v.revision||1,patch}));}
  catch(error){notify(error.message);if(error.status===409)await reload();}
  finally{button.disabled=false;}
 }
 for(const button of root.querySelectorAll('[data-agent-variant]'))button.onclick=()=>onCompare(find(button.dataset.agentVariant));
 for(const button of root.querySelectorAll('[data-variant-source]'))button.onclick=()=>onSource(find(button.dataset.variantSource));
 for(const button of root.querySelectorAll('[data-variant-favorite]'))button.onclick=()=>{const v=find(button.dataset.variantFavorite);return change(v,{favorite:!v.favorite},button);};
 for(const button of root.querySelectorAll('[data-variant-delete]'))button.onclick=()=>{if(confirm('Supprimer cette version ? Ses versions dérivées seront conservées. Vous pourrez la restaurer.'))return change(find(button.dataset.variantDelete),{deleted:true},button);};
 for(const button of root.querySelectorAll('[data-variant-restore]'))button.onclick=()=>change(find(button.dataset.variantRestore),{deleted:false},button);
 for(const button of root.querySelectorAll('[data-variant-rename]'))button.onclick=()=>{
  const v=find(button.dataset.variantRename),dialog=document.createElement('dialog');dialog.className='variant-rename-dialog';
  dialog.innerHTML=`<form><h3>Renommer la version</h3><label>Nom<input name="label" value="${esc(v.label)}" maxlength="200" required></label><p role="alert"></p><div><button type="button">Annuler</button><button class="agent-primary">Enregistrer</button></div></form>`;
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();dialog.querySelector('[name=label]').focus();dialog.querySelector('button[type=button]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const submit=dialog.querySelector('.agent-primary');submit.disabled=true;try{const result=await update({id:v.id,revision:v.revision||1,patch:{label:dialog.querySelector('[name=label]').value}});onChange(result);dialog.close();}catch(error){dialog.querySelector('[role=alert]').textContent=error.message;if(error.status===409){const fresh=(await reload())?.find(item=>item.id===v.id);if(fresh&&!fresh.deletedAt){v.revision=fresh.revision;dialog.querySelector('[role=alert]').textContent='Nom actuel : « '+fresh.label+' ». Vérifiez votre saisie puis enregistrez.';}}}finally{submit.disabled=false;}};
 };
 for(const button of root.querySelectorAll('[data-variant-hd]'))button.onclick=async()=>{if(button.disabled||!onHD)return;const v=find(button.dataset.variantHd);if(!confirm('Générer « '+v.label+' » en HD pour '+hd.credits+' crédits supplémentaires ? La composition sera conservée dans une nouvelle version.'))return;button.disabled=true;try{await onHD(v);}catch(error){notify(error.message);}finally{if(button.isConnected)button.disabled=hd.busy||button.dataset.hdEligible!=='true';}};
 for(const button of root.querySelectorAll('[data-variant-download]'))button.onclick=async()=>{
  const v=find(button.dataset.variantDownload);button.disabled=true;
  try{
   const response=await fetch(v.image,{credentials:v.image.startsWith('/media/')?'same-origin':'omit'});
   if(!response.ok)throw Error('Image indisponible.');
   const chunks=[];let size=0;
   if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000000)throw Error('Image trop volumineuse.');chunks.push(value);}}finally{await reader.cancel();}}
   else{const bytes=new Uint8Array(await response.arrayBuffer());size=bytes.length;if(size>16000000)throw Error('Image trop volumineuse.');chunks.push(bytes);}
   const mime=response.headers.get('content-type')?.split(';')[0],ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[mime];
   if(!ext||!size)throw Error('Image invalide.');
   const url=URL.createObjectURL(new Blob(chunks,{type:mime})),link=document.createElement('a');link.href=url;link.download='propertytwin-'+v.id+'.'+ext;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch{notify('Le téléchargement est indisponible. Une image distante doit autoriser le téléchargement depuis ce site.');}
  finally{button.disabled=false;}
 };
};
