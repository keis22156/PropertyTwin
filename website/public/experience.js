const $=s=>document.querySelector(s), app=$('#app');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notice=s=>{$('#notice').textContent=s;$('#notice').style.display='block';setTimeout(()=>$('#notice').style.display='none',6000);};
const parts=location.pathname.split('/').filter(Boolean);let slug=parts[1]||'appartement-victor-hugo-demo', p, room, variants=[], selectedPhoto=0, started=Date.now(),studioRevision=0,buyerGenerating=false,floorplanVisible=false,floorplanTracked=false,aiAllowance=null,pendingGeneration=null,buyerAlive=true;
async function api(route,data,agent=false){const r=await fetch('/api/'+route+(agent?'':(route.includes('?')?'&':'?')+'slug='+encodeURIComponent(slug)),{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(agent?{Authorization:'Bearer '+$('#key').value}:{})},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok)throw Object.assign(Error(b.message),{status:r.status});return b;}
const event=(type,extra={})=>api('event',{type,...extra}).catch(()=>{});
const img=(src,alt,extra='',sizes='(max-width: 760px) 100vw, 70vw')=>{const media=p?.media?.[src];const responsive=media?.sources?.filter(x=>photoURL(x.url)&&Number.isFinite(x.width)&&x.width>0).map(x=>escape(x.url)+' '+x.width+'w').join(', ');return `<img src="${escape(media?.thumbnail&&extra.includes('loading=')?media.thumbnail:media?.sources?.at(-1)?.url||src)}" alt="${escape(alt)}" ${responsive?'srcset="'+responsive+'" sizes="'+escape(sizes)+'"':''} decoding="async" ${extra}>`;};
const photoURL=s=>/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/.test(s)||/^https:\/\//.test(s)||/^data:image\/(png|jpeg|webp);base64,/.test(s);
async function open(data={},gateForm=null){
try{
const b=await api('open',{...data,source:new URLSearchParams(location.search).get('utm_source')||'direct',link:parts[0]==='v'?parts[2]:undefined});
if(b.gated){if(!gateForm)renderBuyerGate();else gateForm.querySelector('[role=alert]').textContent='Indiquez votre nom et votre email pour poursuivre.';return;}
p=b.property;variants=b.variants.filter(v=>!v.deletedAt);aiAllowance=b.aiAllowance||null;room=p.rooms[0];started=Date.now();render(b.lead);const pending=b.jobs?.find(job=>['queued','processing'].includes(job.status));if(pending)resumeBuyerJob(pending);
}catch(error){if(gateForm?.isConnected)gateForm.querySelector('[role=alert]').textContent=error.message||'Connexion interrompue. Réessayez.';else app.innerHTML=`<section><h1>Cette visite est indisponible.</h1><p>${escape(error.message)}</p></section>`;}
}
function renderBuyerGate(){
app.innerHTML='<section class="buyer-gate"><div class="eyebrow">Votre invitation PropertyTwin</div><h1>Votre visite continue.</h1><p>Indiquez vos coordonnées pour accéder à ce logement.</p><form id="gate"><label>Nom<input name="name" required autocomplete="name" maxlength="200"></label><label>Email<input name="email" type="email" required autocomplete="email" maxlength="200"></label><button class="primary">Explorer le logement</button><p role="alert" class="gate-error"></p></form></section>';
$('#gate').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');if(button.disabled)return;button.disabled=true;form.querySelector('[role=alert]').textContent='';try{await open(Object.fromEntries(new FormData(form)),form);}finally{button.disabled=false;}};
}

function render(lead){floorplanVisible=false;floorplanTracked=false;document.querySelector('meta[name=robots]').content=p.privacy==='Public'&&p.indexable?'index,follow':'noindex,nofollow';if(/^#[0-9a-f]{6}$/i.test(p.agency?.color))document.documentElement.style.setProperty('--brand',p.agency.color);document.title=p.title+' — PropertyTwin';const first=p.agent?.firstName||'votre agent';
app.innerHTML=`${p.demo?'<div class="demo">Démonstration · bien et photos illustratifs · aucun plan ou modèle de scan simulé</div>':''}<header><div class="logo">${p.agency?.logo?img(p.agency.logo,p.agency.name,'class="agency-logo"','90px'):''}${escape(p.agency?.name||'PropertyTwin')}</div><nav>${[['decouvrir','Découvrir'],['photos','Photos'],...(p.floorplan?[['plan','Plan']]:[]),...(p.model3d||p.hasRoomplan?[['troisd','Vue RoomPlan']]:[]),['imaginer','Imaginer'],['informations','Informations'],['contact','Contact']].map(([id,t])=>`<a href="#${id}">${t}</a>`).join('')}</nav></header><main><div class="hero">${img(p.hero,p.title,'fetchpriority="high"','100vw')}<div class="hero-content"><div class="eyebrow">Votre visite continue</div><h1>${escape(p.title)}</h1><p>${escape(p.location)}</p><p class="price">${p.price?new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(p.price):''}</p><p>${[p.surface&&p.surface+' m²',p.roomsCount&&p.roomsCount+' pièces',p.bedrooms&&p.bedrooms+' chambres'].filter(Boolean).join(' · ')}</p><a class="button primary" href="#decouvrir">Explorer le logement ↗</a><a class="button" href="#contact">Contacter ${escape(first)}</a><p class="muted" style="color:#fff">Présenté par ${escape(p.agent?.name||'')} · ${escape(p.agency?.name||'')}</p></div></div><div class="postvisit">Merci pour votre visite. Prenez le temps de revoir le logement et d’imaginer ses possibilités.</div><section id="decouvrir" class="intro">${img(p.hero,'Votre futur quotidien','loading="lazy"')}<div><div class="eyebrow">Un lieu, vos possibilités</div><h2>Imaginez votre<br>quotidien ici.</h2><p>${escape(p.description||'')}</p><div class="facts">${(p.features||[]).map(f=>`<span>${escape(f)}</span>`).join('')}</div></div></section><section id="photos"><div class="eyebrow">Les détails de votre visite</div><h2>D’une pièce à l’autre.</h2><div class="tabs" id="gallery-tabs"></div><div class="gallery" id="gallery"></div></section>${p.floorplan?'<section id="plan"><div class="eyebrow">Comprendre les espaces</div><h2>Le plan du logement.</h2><div class="actions"><button id="zoom-out">−</button><button id="zoom-in">+</button><button id="reset-plan">Recentrer</button></div><div class="plan-stage">'+img(p.floorplan.image,'Plan réel du logement','loading="lazy"')+'</div><div id="plan-rooms" class="tabs"></div></section>':''}${p.model3d||p.hasRoomplan?'<section id="troisd"><h2>Un autre point de vue.</h2>'+(p.hasRoomplan?'<div id="buyer-roomplan"></div>':'')+(p.model3d?'<button id="load3d">Explorer en 3D</button><div id="model"></div>':'')+'</section>':''}<section id="imaginer" class="studio"><div class="studio-inner"><div class="eyebrow">Imaginez-vous ici</div><h2>Et si ce logement<br>devenait le vôtre ?</h2><p>Personnalisez les pièces et découvrez leur potentiel en quelques secondes.</p><div class="tabs" id="studio-tabs"></div><div class="workspace"><div id="studio-image"></div><div class="controls"><h3 id="room-name"></h3><div class="actions" id="quick-actions">${['Meubler','Vider','Changer le sol','Changer les murs','Japandi','Contemporain','Créer mon style'].map(a=>`<button>${a}</button>`).join('')}</div><label>Votre idée<textarea id="prompt" placeholder="Transforme cette pièce en bureau…"></textarea></label><button id="generate" class="primary">Créer ma version ↗</button><p id="buyer-ai-status" role="status"></p><p id="buyer-ai-allowance" class="muted"></p><button id="save-buyer-project" type="button">Sauvegarder mon projet</button><p class="muted">La photo originale est conservée. Les transformations sont des projections d’aménagement.</p><div id="result-actions"></div></div></div><h3>Ma version du logement</h3><p class="muted">Retrouvez les transformations créées pendant votre visite.</p><div id="versions" class="versions"></div></div></section><section id="informations"><div class="eyebrow">Pour aller plus loin</div><h2>Les informations du bien.</h2><div class="facts">${[p.surface&&p.surface+' m²',p.roomsCount&&p.roomsCount+' pièces',p.bedrooms&&p.bedrooms+' chambres',...(p.features||[]),p.dpe&&'DPE '+p.dpe].filter(Boolean).map(f=>`<span>${escape(f)}</span>`).join('')}</div><p>${escape(p.information||'Votre agent reste disponible pour répondre à vos questions sur le logement.')}</p></section><section id="contact" class="contact-layout"><div><div class="eyebrow">Continuons la conversation</div><h2>Un projet se construit<br>ensemble.</h2><div class="agent">${p.agent?.photo?img(p.agent.photo,p.agent.name,'loading="lazy"','64px'):''}<div><h3>${escape(p.agent?.name||'Votre agent')}</h3><p>${escape(p.agency?.name||'')}</p></div></div><div class="actions"><button id="interest-cta" class="primary">Ce bien m’intéresse</button>${p.agent?.phone?`<a class="button" href="tel:${escape(p.agent.phone)}">Appeler</a>`:''}${p.agent?.email?`<a class="button" href="mailto:${escape(p.agent.email)}">Email</a>`:''}</div></div><form id="contact-form"><label>Comment pouvons-nous vous aider ?<select name="kind"><option value="visit">Demander une visite</option><option value="callback">Être rappelé</option><option value="question">Poser une question</option><option value="interest">Ce bien m’intéresse</option></select></label><label>Votre intérêt<select name="interest"><option>Très intéressé</option><option>J’aimerais une seconde visite</option><option>J’ai une question</option><option>Je souhaite parler du prix</option><option>Je réfléchis encore</option></select></label><label>Nom<input name="name" required autocomplete="name" value="${escape(lead?.name||'')}"></label><label>Email<input name="email" type="email" autocomplete="email" value="${escape(lead?.email||'')}"></label><label>Téléphone<input name="phone" type="tel" autocomplete="tel" value="${escape(lead?.phone||'')}"></label><label>Disponibilités<input name="availability" placeholder="Vos jours et horaires préférés"></label><label>Message<textarea name="message" placeholder="Votre question ou votre projet…"></textarea></label><button class="primary">Envoyer à ${escape(first)}</button></form></section></main><footer>Votre visite continue · Powered by PropertyTwin</footer><a href="#contact" class="button primary sticky">Contacter ${escape(first)} ↗</a>`;
renderGallery();renderStudio();renderVersions();renderBuyerAllowance();$('#quick-actions').onclick=e=>{if(e.target.tagName==='BUTTON')$('#prompt').value=e.target.textContent==='Créer mon style'?'':e.target.textContent;$('#prompt').focus();};$('#generate').onclick=generate;$('#save-buyer-project').onclick=identifyBuyerProject;
$('#contact-form').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button');if(btn.disabled)return;btn.disabled=true;try{const response=await api('contact',Object.fromEntries(new FormData(e.target)));aiAllowance=response.aiAllowance||aiAllowance;renderBuyerAllowance();notice('Votre demande a été transmise à votre agent.');}catch(e){notice(e.message);}finally{btn.disabled=false;}};
document.querySelectorAll('a[href="#contact"]').forEach(a=>a.onclick=()=>event('contact_clicked'));const contactSelect=$('#contact-form select[name=kind]');const interestSelect=$('#contact-form select[name=interest]');const updateInterest=()=>{const active=contactSelect.value==='interest';interestSelect.closest('label').hidden=!active;interestSelect.disabled=!active;};contactSelect.onchange=updateInterest;updateInterest();$('#interest-cta').onclick=()=>{contactSelect.value='interest';updateInterest();interestSelect.focus();event('contact_clicked');};if(p.floorplan)setupPlan();if(p.model3d)setupBuyer3D();if(p.hasRoomplan)window.PropertyTwinRoomplan({root:$('#buyer-roomplan'),load:()=>api('roomplan'),onRoom:id=>{room=p.rooms.find(r=>r.id===id);if(!room)return;selectedPhoto=0;renderGallery();renderStudio();$('#photos').scrollIntoView();event('room_view',{room:id});},onLoad:()=>event('3d_open')});const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.target.id==='plan'){floorplanVisible=e.isIntersecting;if(floorplanVisible)trackFloorplan();}else if(e.isIntersecting&&e.target.id==='imaginer'){event('ai_studio_open');observer.unobserve(e.target);}}));observer.observe($('#imaginer'));if(p.floorplan)observer.observe($('#plan'));}
function tabs(target,select){$(target).innerHTML=p.rooms.map(r=>`<button class="${r.id===room.id?'active':''}" data-room="${escape(r.id)}">${escape(r.name)}</button>`).join('');$(target).onclick=e=>{const r=p.rooms.find(r=>r.id===e.target.dataset.room);if(r){room=r;selectedPhoto=0;select();event('room_view',{room:r.id});}};}
function renderGallery(){tabs('#gallery-tabs',()=>{renderGallery();renderStudio();});$('#gallery').innerHTML=room.photos.map((s,i)=>`<button class="photo" data-photo="${i}">${img(s,room.name,'loading="lazy"')}</button>`).join('');$('#gallery').onclick=e=>{const btn=e.target.closest('[data-photo]');if(btn){showPhoto(+btn.dataset.photo);event('gallery_open');}};}
let photoIndex=0;function showPhoto(i){photoIndex=(i+room.photos.length)%room.photos.length;$('#lightbox img').src=room.photos[photoIndex];$('#lightbox img').alt=room.name;const nextPhoto=new Image();nextPhoto.src=room.photos[(photoIndex+1)%room.photos.length];if(!$('#lightbox').open)$('#lightbox').showModal();event('photo_view',{room:room.id});}
$('#lightbox .close').onclick=()=>$('#lightbox').close();$('#previous').onclick=()=>showPhoto(photoIndex-1);$('#next').onclick=()=>showPhoto(photoIndex+1);let touchX;$('#lightbox').ontouchstart=e=>touchX=e.touches[0].clientX;$('#lightbox').ontouchend=e=>{const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>40)showPhoto(photoIndex+(dx<0?1:-1));};$('#lightbox').onkeydown=e=>{if(e.key==='ArrowRight')showPhoto(photoIndex+1);if(e.key==='ArrowLeft')showPhoto(photoIndex-1);};
function renderStudio(){studioRevision++;tabs('#studio-tabs',()=>{renderStudio();renderGallery();});$('#studio-image').innerHTML=img(room.photos[selectedPhoto]||room.photos[0],room.name,'loading="lazy"')+'<div class="studio-thumbnails">'+room.photos.map((src,i)=>`<button aria-label="Choisir la photo ${i+1}" data-source="${i}" class="${selectedPhoto===i?'selected':''}">${img(src,room.name,'loading="lazy"','100px')}</button>`).join('')+'</div>';$('#studio-image').onclick=e=>{const btn=e.target.closest('[data-source]');if(btn){selectedPhoto=Number(btn.dataset.source);renderStudio();event('photo_view',{room:room.id});}};$('#room-name').textContent=room.name;$('#result-actions').innerHTML='';}
async function generate(){
if(buyerGenerating)return;const btn=$('#generate');
const request={slug,room:room.id,name:room.name,photo:room.photos[selectedPhoto]||room.photos[0],prompt:$('#prompt').value,revision:studioRevision};
buyerGenerating=true;btn.disabled=true;btn.textContent='Votre version prend forme…';
try{
const payload={room:request.room,photo:request.photo,action:request.prompt,prompt:request.prompt,async:true};
const signature=JSON.stringify(payload);
if(pendingGeneration?.signature!==signature)pendingGeneration={signature,key:window.PropertyTwinAIJobs.key()};
const result=await api('generate',{...payload,idempotencyKey:pendingGeneration.key});
const v=await window.PropertyTwinAIJobs.wait(result,id=>api('jobs?id='+encodeURIComponent(id)),{alive:()=>buyerAlive,onState:renderBuyerJob});
pendingGeneration=null;
if(!v.id||v.room!==request.room||v.original!==request.photo||v.slug&&v.slug!==request.slug||!photoURL(v.image))throw Error('La version reçue ne correspond pas à cette photo.');
if(!variants.some(item=>item.id===v.id))variants.push(v);renderVersions();
if(studioRevision===request.revision&&room.id===request.room&&(room.photos[selectedPhoto]||room.photos[0])===request.photo)compare(v);
else notice('Votre version du '+request.name+' est prête dans « Ma version du logement ».');
}catch(error){if(error.jobTerminal||error.status&&error.status<500)pendingGeneration=null;notice(error.message||'La transformation a échoué. Réessayez.');}
finally{buyerGenerating=false;btn.disabled=false;btn.textContent='Créer ma version ↗';$('#buyer-ai-status').textContent='';refreshBuyerAllowance();}
}
function identifyBuyerProject(){
 if($('#identify-buyer'))return;
 const dialog=document.createElement('dialog');dialog.id='identify-buyer';dialog.setAttribute('aria-labelledby','identify-heading');
 dialog.innerHTML='<form id="identify-form"><div class="identify-content"><h2 id="identify-heading">Sauvegardez votre projet</h2><p>Retrouvez vos versions pendant cette visite et partagez votre projet avec l’agence. Vos coordonnées donnent accès à trois transformations supplémentaires, selon le budget du bien.</p><label>Nom<input name="name" required maxlength="200" autocomplete="name"></label><label>Email<input name="email" type="email" maxlength="200" autocomplete="email"></label><label>Téléphone<input name="phone" type="tel" maxlength="100" autocomplete="tel"></label><p class="muted">Indiquez un email ou un téléphone pour que l’agence puisse vous joindre au sujet de ce projet.</p><label><input name="marketingConsent" type="checkbox"> Je souhaite aussi recevoir les actualités de l’agence (facultatif).</label><p role="alert"></p></div><div class="actions"><button class="primary">Sauvegarder mon projet</button><button id="close-identify" type="button">Fermer</button></div></form>';
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('#close-identify').onclick=()=>dialog.close();
 const contact=$('#contact-form');for(const field of ['name','email','phone'])dialog.querySelector('[name='+field+']').value=contact.elements[field].value;
 dialog.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');if(button.disabled)return;button.disabled=true;
  const fields=Object.fromEntries(new FormData(form));fields.marketingConsent=form.elements.marketingConsent.checked;
  try{const result=await api('identify',fields);aiAllowance=result.aiAllowance||aiAllowance;for(const field of ['name','email','phone'])contact.elements[field].value=result.lead?.[field]||fields[field]||'';renderBuyerAllowance();dialog.close();notice('Votre projet est enregistré auprès de l’agence.');}
  catch(error){form.querySelector('[role=alert]').textContent=error.message;}
  finally{button.disabled=false;}
 };
 dialog.showModal();dialog.querySelector('[name=name]').focus();
}
function renderBuyerAllowance(){
 const label=$('#buyer-ai-allowance');if(!label||!aiAllowance)return;
 label.textContent=aiAllowance.remaining+' transformation'+(aiAllowance.remaining>1?'s':'')+' disponible'+(aiAllowance.remaining>1?'s':'')+' pour votre visite.'+(aiAllowance.remaining===0&&!aiAllowance.identified?' Renseignez vos coordonnées pour obtenir trois transformations supplémentaires.':'');
}
function renderBuyerJob(job){const label=$('#buyer-ai-status');if(label)label.textContent=job.status==='queued'?'Votre transformation est en attente. Vous pouvez quitter cette page.':'Votre transformation est en cours. Elle sera disponible à votre retour.';}
async function refreshBuyerAllowance(){try{const result=await api('jobs');aiAllowance=result.aiAllowance||aiAllowance;renderBuyerAllowance();}catch{/* The next visit reloads the authoritative allowance. */}}
async function resumeBuyerJob(job){
 if(buyerGenerating)return;buyerGenerating=true;const button=$('#generate');button.disabled=true;button.textContent='Votre version prend forme…';
 try{
  const variant=await window.PropertyTwinAIJobs.wait({job},id=>api('jobs?id='+encodeURIComponent(id)),{alive:()=>buyerAlive,onState:renderBuyerJob});
  if(!variants.some(v=>v.id===variant.id))variants.push(variant);renderVersions();notice('Votre version est prête dans « Ma version du logement ».');
 }catch(error){notice(error.message);}
 finally{buyerGenerating=false;button.disabled=false;button.textContent='Créer ma version ↗';$('#buyer-ai-status').textContent='';refreshBuyerAllowance();}
}
window.addEventListener('pagehide',()=>{buyerAlive=false;},{once:true});
function compare(v){if(!photoURL(v.image))return;const sourceRoom=p.rooms.find(r=>r.id===v.room);if(sourceRoom){room=sourceRoom;selectedPhoto=Math.max(0,room.photos.indexOf(v.original));renderStudio();renderGallery();}$('#studio-image').innerHTML=`<div class="compare">${img(v.original,'Avant')}${img(v.image,'Ma version','class="after"')}</div><div class="compare-labels"><span>Avant</span><span>Ma version</span></div><input aria-label="Comparer avant et après" type="range" min="0" max="100" value="50">`;$('#studio-image input').oninput=e=>$('.after').style.clipPath=`inset(0 ${100-e.target.value}% 0 0)`;$('#result-actions').innerHTML='<div class="actions"><button id="save">Sauvegarder</button><button id="another">Créer une autre version</button><button id="share">Partager</button></div>';$('#save').onclick=async()=>{try{await api('save',{id:v.id});v.saved=true;renderVersions();notice('Version sauvegardée.');}catch(e){notice(e.message);}};$('#another').onclick=()=>$('#prompt').focus();$('#share').onclick=e=>shareBuyerVariant(v,e.currentTarget);}
async function shareBuyerVariant(variant,button){
button.disabled=true;
try{
const result=await api('share',{id:variant.id});const url=new URL(result.url,location.origin);
if(url.origin!==location.origin||!url.pathname.startsWith('/share/'))throw Error('Le lien de partage est indisponible.');
if(navigator.share){try{await navigator.share({title:p.title,text:variant.label,url:url.href});return;}catch(error){if(error.name==='AbortError')return;}}
try{if(!navigator.clipboard?.writeText)throw Error('Presse-papiers indisponible');await navigator.clipboard.writeText(url.href);notice('Lien de votre version copié.');}
catch{showBuyerShareLink(url.href);}
}catch(error){notice(error.message||'Le partage est indisponible. Réessayez.');}
finally{button.disabled=false;}
}
function showBuyerShareLink(url){
$('#buyer-share-dialog')?.close();const dialog=document.createElement('dialog');dialog.id='buyer-share-dialog';dialog.setAttribute('aria-labelledby','buyer-share-heading');
dialog.innerHTML='<form method="dialog"><h2 id="buyer-share-heading">Partager ma version</h2><p>Copiez ce lien pour partager votre idée d’aménagement.</p><label>Lien de votre version<input id="buyer-share-url" type="url" readonly></label><p class="muted">Seules les deux images et leur description sont partagées.</p><div class="actions"><button id="buyer-copy-version" type="button">Copier le lien</button><button>Fermer</button></div><p id="buyer-share-status" role="status"></p></form>';
document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});const input=dialog.querySelector('input');input.value=url;input.onclick=()=>input.select();
dialog.querySelector('#buyer-copy-version').onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{await navigator.clipboard.writeText(url);dialog.querySelector('#buyer-share-status').textContent='Lien copié.';}catch{input.focus();input.select();dialog.querySelector('#buyer-share-status').textContent='Sélectionnez le lien ci-dessus puis utilisez Copier.';}finally{button.disabled=false;}};
dialog.showModal();input.focus();input.select();
}
function renderVersions(){$('#versions').innerHTML=variants.map(v=>`<article class="version">${img(v.image,v.label,'loading="lazy"')}<p>${escape(p.rooms.find(r=>r.id===v.room)?.name)} · ${escape(v.label)} ${v.saved?'✓':''}</p><button data-version="${escape(v.id)}">Revoir ma version</button></article>`).join('')||'<p class="muted">Vos idées trouveront leur place ici.</p>';$('#versions').onclick=e=>{const v=variants.find(v=>v.id===e.target.dataset.version);if(v)compare(v);};}
function setupBuyer3D(){
const button=$('#load3d'),container=$('#model');let attempt=0,tracked=false;
button.onclick=async()=>{
if(button.disabled)return;const current=++attempt;button.disabled=true;button.textContent='Chargement de la 3D…';
const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Le modèle se prépare…';container.replaceChildren(status);
let viewer,timer;const finishError=message=>{if(current!==attempt)return;attempt++;clearTimeout(timer);viewer?.remove();status.textContent=message;container.replaceChildren(status);button.disabled=false;button.textContent='Réessayer la 3D';};
try{
const model=typeof p.model3d==='string'?{src:p.model3d}:p.model3d;if(!photoURL(model.src||''))throw Error('Le modèle 3D est indisponible.');
if(/\.usdz(?:[?#]|$)/i.test(model.src)){const link=document.createElement('a');link.href=model.src;link.rel='ar';link.className='button';link.append(img(p.hero,'Explorer le modèle avec Quick Look'));container.replaceChildren(link);button.disabled=false;button.hidden=true;if(!tracked){tracked=true;event('3d_open');}return;}
timer=setTimeout(()=>finishError('Le chargement prend trop de temps. Réessayez.'),120000);
await import('/vendor/model-viewer.min.js');if(current!==attempt)return;
viewer=document.createElement('model-viewer');viewer.setAttribute('loading','eager');
// A failed GLB load is cached by the renderer. Our immutable local media URLs
// support a retry query; leave external/signed URLs untouched.
const source=new URL(model.src,location.origin);if(current>1&&source.origin===location.origin&&/^\/media\/[A-Za-z0-9_-]{32}\.glb$/.test(source.pathname))source.searchParams.set('pt_retry',String(current));
viewer.src=current>1&&source.searchParams.has('pt_retry')?source.href:model.src;viewer.alt='Modèle 3D du logement';viewer.setAttribute('camera-controls','');viewer.setAttribute('touch-action','pan-y');
if(photoURL(model.iosSrc||'')){viewer.setAttribute('ios-src',model.iosSrc);viewer.setAttribute('ar','');}
viewer.addEventListener('load',()=>{if(current!==attempt)return;clearTimeout(timer);status.remove();button.hidden=true;button.disabled=false;if(!tracked){tracked=true;event('3d_open');}},{once:true});
viewer.addEventListener('error',()=>finishError('Le modèle 3D ne peut pas être chargé. Réessayez.'),{once:true});container.append(viewer);
}catch(error){finishError(error.message||'Le viewer 3D est indisponible. Réessayez.');}
};
}
function trackFloorplan(){if(!floorplanTracked&&$('.plan-stage img')?.naturalWidth){floorplanTracked=true;event('floorplan_open');}}
function setupPlan(){
const stage=$('.plan-stage'),canvas=document.createElement('div');canvas.className='plan-canvas';canvas.append(stage.querySelector('img'));stage.append(canvas);
let z=1,x=0,y=0,anchor=null,pinch=null,gestureMoved=false;const pointers=new Map();
const selectRoom=id=>{room=p.rooms.find(r=>r.id===id);if(!room)return;selectedPhoto=0;renderGallery();renderStudio();$('#photos').scrollIntoView();event('room_view',{room:room.id});};
for(const zone of p.floorplan.zones||[]){
if(!p.rooms.some(r=>r.id===zone.room)||!['x','y','width','height'].every(k=>Number.isFinite(zone[k])&&zone[k]>=0&&zone[k]<=100)||zone.x+zone.width>100||zone.y+zone.height>100)continue;
const hit=document.createElement('button');hit.className='plan-zone';hit.style.cssText=`left:${zone.x}%;top:${zone.y}%;width:${zone.width}%;height:${zone.height}%`;hit.textContent=p.rooms.find(r=>r.id===zone.room).name;
hit.onclick=e=>{if(gestureMoved&&e.detail!==0)return;selectRoom(zone.room);};canvas.append(hit);
}
const image=stage.querySelector('img');image.draggable=false;
const fit=()=>{if(!image.naturalWidth||!image.naturalHeight)return;const ratio=Math.min(stage.clientWidth/image.naturalWidth,stage.clientHeight/image.naturalHeight);const width=image.naturalWidth*ratio,height=image.naturalHeight*ratio;canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.style.left=(stage.clientWidth-width)/2+'px';canvas.style.top=(stage.clientHeight-height)/2+'px';};
image.onload=()=>{fit();if(floorplanVisible)trackFloorplan();};if(image.complete)fit();new ResizeObserver(fit).observe(stage);
const apply=()=>canvas.style.transform=`translate(${x}px,${y}px) scale(${z})`;
$('#zoom-in').onclick=()=>{z=Math.min(5,z+.25);apply();trackFloorplan();};$('#zoom-out').onclick=()=>{z=Math.max(.5,z-.25);apply();trackFloorplan();};$('#reset-plan').onclick=()=>{z=1;x=y=0;apply();trackFloorplan();};
const capture=id=>{try{stage.setPointerCapture(id);}catch{/* Pointer capture can be unavailable after cancellation. */}};
const pinchState=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
stage.onpointerdown=e=>{
if(e.pointerType==='mouse'&&e.button!==0)return;
const point={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};pointers.set(e.pointerId,point);trackFloorplan();
if(pointers.size===1){gestureMoved=false;anchor={id:e.pointerId,x:e.clientX-x,y:e.clientY-y};if(!e.target.closest('.plan-zone'))capture(e.pointerId);}
else if(pointers.size===2){gestureMoved=true;pinch=pinchState();for(const id of pointers.keys())capture(id);}
};
stage.onpointermove=e=>{
const point=pointers.get(e.pointerId);if(!point)return;point.x=e.clientX;point.y=e.clientY;
if(pointers.size>=2){
const next=pinchState();if(pinch?.distance>0){const previousZoom=z;z=Math.max(.5,Math.min(5,z*next.distance/pinch.distance));const factor=z/previousZoom,bounds=stage.getBoundingClientRect(),cx=(bounds.left+bounds.right)/2,cy=(bounds.top+bounds.bottom)/2;x=next.x-cx-(pinch.x-cx-x)*factor;y=next.y-cy-(pinch.y-cy-y)*factor;}
pinch=next;gestureMoved=true;apply();return;
}
if(anchor?.id!==e.pointerId)return;
if(gestureMoved||Math.hypot(point.x-point.startX,point.y-point.startY)>6){gestureMoved=true;capture(e.pointerId);x=e.clientX-anchor.x;y=e.clientY-anchor.y;apply();}
};
const end=e=>{if(!pointers.delete(e.pointerId))return;pinch=null;if(e.type==='pointercancel')gestureMoved=true;const [id,point]=pointers.entries().next().value||[];if(point){point.startX=point.x;point.startY=point.y;anchor={id,x:point.x-x,y:point.y-y};}else anchor=null;};
stage.onpointerup=end;stage.onpointercancel=end;
stage.onwheel=e=>{e.preventDefault();trackFloorplan();z=Math.max(.5,Math.min(5,z+(e.deltaY<0?.15:-.15)));apply();};
$('#plan-rooms').innerHTML=p.rooms.map(r=>`<button data-room="${escape(r.id)}">${escape(r.name)}${r.reliableDimensions?' · '+escape(r.reliableDimensions):''}</button>`).join('');$('#plan-rooms').onclick=e=>{if(p.rooms.some(r=>r.id===e.target.dataset.room))selectRoom(e.target.dataset.room);};
}

if(parts[0]==='admin')window.PropertyTwinAdmin();else if(['agent','auth','properties'].includes(parts[0])||!parts.length)window.PropertyTwinAuth.boot();else if(parts[0]==='share')sharedVersion();else open();

async function sharedVersion(){try{const r=await fetch('/api/shared?token='+encodeURIComponent(parts[1]||''));const b=await r.json();if(!r.ok)throw Object.assign(Error(b.message),{status:r.status});app.innerHTML='<section><div class="eyebrow">Une nouvelle possibilité · PropertyTwin</div><h1>'+escape(b.title)+'</h1><p>'+escape(b.room)+' · '+escape(b.label)+'</p><div class="workspace"><div>'+img(b.original,'Photo originale')+'<p>Avant</p></div><div>'+img(b.image,'Version imaginée')+'<p>La version imaginée</p></div></div><p class="muted">Projection d’aménagement. Ce lien partage uniquement ces deux images, sans les coordonnées ni l’activité du visiteur.</p></section>';}catch(e){app.innerHTML='<section><h1>Version indisponible.</h1><p>'+escape(e.message)+'</p></section>';}}

setInterval(()=>{if(p&&document.visibilityState==='visible'){const now=Date.now();event('session_duration',{duration:(now-started)/1000});started=now;}},30000);
