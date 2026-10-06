(()=>{
// Shared by the server and the browser bundle. No vendor or credential belongs here.
const styles=['Contemporain','Japandi','Scandinave','Minimaliste','Parisien','Industriel','Classique','Méditerranéen'];
const roomTypes=['Salon','Cuisine','Chambre','Bureau','Salle à manger','Salle de bain','Entrée','Extérieur'];
const floors=['Chêne clair','Chêne foncé','Point de Hongrie','Béton ciré','Pierre','Carrelage','Moquette'];
const walls={'Blanc cassé':'#f3efe5','Beige':'#d7c5ab','Greige':'#b7afa1','Vert olive':'#72794f','Bleu':'#526f96','Gris chaud':'#aaa29a'};
const usages=['Bureau','Chambre bébé','Chambre enfant','Dressing','Salle de sport','Salle à manger','Salon','Chambre'];
const renovations=['Refresh','Standard','Premium'];
const skies=['Bleu naturel','Légèrement nuageux','Coucher de soleil'];
const tools=[
 {action:'Meubler',label:'Meubler',fields:['roomType','style'],hint:'Ajouter du mobilier adapté sans modifier la structure.'},
 {action:'Vider la pièce',label:'Vider complètement',fields:[],hint:'Retirer les meubles et objets mobiles, conserver les finitions et équipements fixes.'},
 {action:'Ranger',label:'Ranger',fields:[],hint:'Retirer le désordre et les petits objets. Conserver les meubles principaux.'},
 {action:'Changer le sol',label:'Changer le sol',fields:['floor'],hint:'Changer uniquement le revêtement du sol.'},
 {action:'Changer les murs',label:'Changer les murs',fields:['wall','wallColor'],hint:'Changer uniquement la couleur des murs.'},
 {action:'Rénover',label:'Rénover',fields:['roomType','renovation'],hint:'Une projection visuelle des finitions, sans modifier le plan du logement.'},
 {action:'Changer le style',label:'Changer le style',fields:['style'],hint:'Faire évoluer le mobilier et la décoration dans le style choisi.'},
 {action:'Changer l’usage de la pièce',label:'Changer l’usage',fields:['usage','style'],hint:'Imaginer un nouvel usage avec du mobilier adapté.'},
 {action:'Ciel',label:'Remplacer le ciel',fields:['sky'],hint:'Modifier uniquement le ciel visible sur une photo extérieure.'},
 {action:'Day to Dusk',label:'Du jour au crépuscule',fields:[],hint:'Imaginer la lumière du soir sans changer le bâtiment ni son environnement.'},
 {action:'Image inspiration',label:'Image d’inspiration',fields:['inspiration'],hint:'Reprendre une ambiance depuis une seconde image, en conservant l’architecture de votre photo.'},
 {action:'Prompt personnalisé',label:'Prompt personnalisé',fields:[],hint:'Décrire précisément les éléments à transformer sur la photo.'},
 {action:'Supprimer un objet',label:'Gomme IA',fields:[],hint:'Sélectionner manuellement l’objet à supprimer.'}
];
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const choices={style:styles,roomType:roomTypes,floor:floors,wall:[...Object.keys(walls),'Personnalisée'],usage:usages,renovation:renovations,sky:skies};
const defaults={style:'Contemporain',roomType:'Salon',floor:'Chêne clair',wall:'Blanc cassé',renovation:'Refresh',usage:'Bureau',sky:'Bleu naturel'};

function normalizeTool(body,{agent=true}={}){
 if(body.prompt!==undefined&&(typeof body.prompt!=='string'||body.prompt.length>1000))fail('Instruction trop longue (1 000 caractères maximum).');
 let action=body.action,legacyStyle,legacyUsage;
 if(action==='Vider')action='Vider la pièce';
 if(styles.includes(action)){legacyStyle=action;action='Changer le style';}
 if(usages.includes(action)){legacyUsage=action;action='Changer l’usage de la pièce';}
 if(action===undefined||!agent&&typeof action==='string'&&!tools.some(t=>t.action===action))action=body.prompt?.trim()?'Prompt personnalisé':'Changer le style';
 const tool=tools.find(t=>t.action===action);if(!tool)fail('Transformation inconnue.');
 if(!agent&&['Image inspiration','Supprimer un objet'].includes(action))fail('Cet outil est réservé au studio agent.');
 const prompt=(body.prompt||'').trim();if(action==='Prompt personnalisé'&&!prompt)fail('Décrivez votre idée avant de générer.');
 const values=body.options===undefined?{}:body.options;if(!values||typeof values!=='object'||Array.isArray(values))fail('Options de transformation invalides.');
 for(const key of Object.keys(values))if(!tool.fields.includes(key)||key==='inspiration')fail('Cette option ne correspond pas à la transformation choisie.');
 const options={};
 for(const key of tool.fields){
  if(!choices[key])continue;
  const value=values[key]??(key==='style'?legacyStyle: key==='usage'?legacyUsage:undefined)??defaults[key];
  if(!choices[key].includes(value))fail('Preset de transformation invalide.');options[key]=value;
 }
 if(action==='Changer les murs'){
  if(options.wall==='Personnalisée'){if(typeof values.wallColor!=='string'||!/^#[a-fA-F0-9]{6}$/.test(values.wallColor))fail('Couleur de mur invalide.');options.wallColor=values.wallColor.toLowerCase();}
  else{if(values.wallColor!==undefined&&(typeof values.wallColor!=='string'||values.wallColor.toLowerCase()!==walls[options.wall]))fail('La couleur ne correspond pas au preset de mur.');options.wallColor=walls[options.wall];}
 }
 let inspiration;
 if(action==='Image inspiration'){
  if(typeof body.inspiration!=='string'||!/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$/.test(body.inspiration))fail('Importez une image d’inspiration dans votre espace.');
  if(body.inspiration===body.photo)fail('Choisissez une image d’inspiration différente de la photo originale.');inspiration=body.inspiration;
 }else if(body.inspiration!==undefined)fail('L’image d’inspiration ne correspond pas à cet outil.');
 return {action,style:options.style||'',options,prompt,...(inspiration?{inspiration}:{})};
}

function toolInstruction(input){
 if(input.quality==='hd')return 'Reproduire fidèlement cette version de la photo en haute définition. Conserver exactement sa composition, son cadrage, la géométrie, les ouvertures, le mobilier, les couleurs, les matériaux et la décoration. Améliorer uniquement les détails et la netteté naturelle. Ne refaire aucune transformation ni ajouter ou retirer aucun élément. Projection photo 2D uniquement.';
 const o=input.options||{};
 const structure='Conserver la géométrie, la perspective, les dimensions apparentes, les portes, fenêtres, ouvertures et équipements fixes de l’image originale. Ne déplacer ni ajouter aucun mur ou ouverture. Ne produire qu’une projection photo 2D.';
 const instructions={
  'Meubler':`Aménager ${o.roomType||'la pièce'} avec du mobilier proportionné. Conserver les murs et le sol existants.`,
  'Ranger':'Retirer le désordre, déchets et petits objets mobiles. Ranger les surfaces. Garder les meubles principaux, les murs et le sol tels quels.',
  'Vider la pièce':'Retirer tous les meubles et objets mobiles. Conserver exactement le sol, les murs, portes, fenêtres et équipements fixes (cuisine intégrée, sanitaires, radiateurs).',
  'Changer le sol':`Remplacer uniquement le revêtement de sol visible par ${o.floor||'le matériau demandé'}, avec une échelle et une perspective cohérentes. Conserver murs et mobilier.`,
  'Changer les murs':`Repeindre uniquement les murs visibles en ${o.wall||'la couleur demandée'}${o.wallColor?' ('+o.wallColor+')':''}. Conserver sol, mobilier, menuiseries et textures réalistes.`,
  'Changer le style':'Modifier uniquement le mobilier et la décoration. Conserver les finitions du sol et des murs, sauf demande explicite.',
  'Changer l’usage de la pièce':`Adapter le mobilier et la décoration à l’usage ${o.usage||'demandé'}. Garder le sol, les murs et la structure.`,
  'Rénover':`Projection de rénovation ${o.renovation||'Refresh'} pour ${o.roomType||'la pièce'}. ${o.renovation==='Premium'?'Imaginer des finitions et équipements haut de gamme.':o.renovation==='Standard'?'Moderniser finitions et équipements visibles.':'Rafraîchir peintures, finitions et décoration, avec des changements légers.'} Garder les emplacements des équipements fixes et des réseaux. Visualisation non contractuelle, aucun engagement de faisabilité ni devis.`,
  'Ciel':`Remplacer uniquement le ciel visible par un ciel ${o.sky||'bleu naturel'}, avec lumière cohérente. Conserver bâtiment, végétation, terrain et tous les autres éléments. S’il n’y a aucun ciel visible, conserver la photo.`,
  'Day to Dusk':'Transformer uniquement la lumière et le ciel visibles en ambiance crépusculaire naturelle. Conserver bâtiment, terrain, végétation et mobilier. Ne créer aucune fenêtre ou source lumineuse inexistante.',
  'Image inspiration':'Image 1 : photo originale du bien, seule base architecturale à conserver. Image 2 : référence d’ambiance uniquement. Transposer sa palette, son style et son mobilier dans l’image 1, sans copier la pièce, la géométrie ni les ouvertures de l’image 2.',
  'Prompt personnalisé':'Modifier uniquement les éléments de la photo décrits dans la demande, dans les limites de conservation de la structure.',
  'Supprimer un objet':'Supprimer uniquement l’objet sélectionné dans la zone blanche du masque et reconstruire naturellement son arrière-plan. Conserver les murs, le sol et tout élément hors sélection.'
 };
 return `${structure}\n${instructions[input.action]||'Modifier uniquement les éléments demandés.'}${o.style?'\nStyle : '+o.style+'.':''}`;
}

function toolLabel(input){
 const detail=input.options?.floor||input.options?.wall||input.options?.usage||input.options?.renovation||input.options?.style||input.options?.sky;
 return input.prompt||input.action+(detail?' · '+detail:'');
}

window.PropertyTwinAITools={styles,roomTypes,floors,walls,usages,renovations,skies,tools,normalizeTool};
})();
window.PropertyTwinAuth=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function call(action,body){
  const res=await fetch('/api/auth/'+action,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  const result=await res.json();if(!res.ok)throw Object.assign(Error(result.message),{status:res.status});return result;
 }
 function page(title,description,form){
  document.title=title+' — PropertyTwin';
  document.querySelector('#app').innerHTML=`<div class="agent-login saas-auth"><a href="/auth/login" class="agent-brand"><span class="brand-symbol">P</span>PropertyTwin</a><main class="login-card"><div class="agent-kicker">PROPERTYTWIN STUDIO</div><h1>${esc(title)}</h1><p>${esc(description)}</p>${form}<p id="auth-status" role="status" aria-live="polite"></p></main></div>`;
 }
 function form(fields,label){return `<form id="saas-auth-form">${fields.map(([name,text,type])=>`<label>${text}<input name="${name}" type="${type}" required ${name==='password'?'minlength="12" maxlength="128" autocomplete="new-password"':name==='email'?'autocomplete="email" maxlength="254"':'maxlength="200" autocomplete="organization"'}></label>`).join('')}<button class="agent-primary">${label}</button></form>`;}
 function submit(action,after){
  const element=document.querySelector('#saas-auth-form');
  element.onsubmit=async e=>{
   e.preventDefault();const button=element.querySelector('button');if(button.disabled)return;button.disabled=true;document.querySelector('#auth-status').textContent='';
   try{await after(await call(action,Object.fromEntries(new FormData(element))));}
   catch(error){document.querySelector('#auth-status').textContent=error.message||'Connexion interrompue. Réessayez.';}
   finally{button.disabled=false;}
  };
 }
 async function workspace(){
  const identity=await call('me');
  if(!identity.memberships?.length){
   page('Bienvenue dans votre agence.','Créez votre espace, puis renseignez son identité et ajoutez votre premier bien.',form([['name','Nom de l’agence','text']],'Créer mon agence'));
   submit('onboard',()=>{location.href='/agent';});return;
  }
  await window.PropertyTwinDashboard(identity);
 }
 async function boot(){
  const route=location.pathname;
  try{
   const config=await call('config');
   if(!config.enabled){
    if(route.startsWith('/auth')){page('Connexion à préparer.','Configurez Supabase pour activer les comptes agence.','<a class="button" href="/agent">Ouvrir l’espace local</a>');return;}
    if(route==='/'){page('PropertyTwin Studio','Vos biens, vos photos et vos prospects réunis dans un seul espace.','<a class="button primary" href="/agent">Ouvrir mon espace agence</a>');return;}
    await window.PropertyTwinDashboard();return;
   }
   if(route==='/auth/callback'){
    const params=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'','/auth/callback');
    if(params.get('error'))throw Error('Le lien de connexion est expiré ou invalide. Demandez un nouveau lien.');
    await call('session',{access_token:params.get('access_token'),refresh_token:params.get('refresh_token')});
    if(params.get('type')==='recovery'){
     page('Votre nouveau mot de passe.','Choisissez au moins 12 caractères.',form([['password','Nouveau mot de passe','password']],'Enregistrer le mot de passe'));
     submit('password',()=>{location.href='/agent';});return;
    }
    location.href='/agent';return;
   }
   const action=route.split('/')[2];
   if(route==='/agent'||route.startsWith('/properties')||route==='/'){
    try{await workspace();return;}catch(error){if(error.status!==401)throw error;}
   }
   if(action==='signup'){
    page('Votre prochain mandat commence ici.','Créez votre compte professionnel.',form([['email','Email professionnel','email'],['password','Mot de passe · 12 caractères minimum','password']],'Créer mon compte')+'<a href="/auth/login">J’ai déjà un compte</a>');
    submit('signup',result=>{if(result.confirmationRequired)document.querySelector('#auth-status').textContent='Consultez votre email pour confirmer votre compte.';else location.href='/agent';});return;
   }
   if(action==='magic'||action==='recover'){
    page(action==='magic'?'Recevoir un lien de connexion.':'Retrouver votre accès.',action==='magic'?'Connectez-vous avec le lien envoyé par email.':'Recevez un email pour définir un nouveau mot de passe.',form([['email','Email professionnel','email']],'Envoyer le lien')+'<a href="/auth/login">Retour à la connexion</a>');
    submit(action,()=>{document.querySelector('#auth-status').textContent='Si cette adresse est associée à un compte, un email vous sera envoyé.';});return;
   }
   page('Votre studio immobilier.','Connectez-vous pour retrouver vos biens et vos prospects.',form([['email','Email professionnel','email'],['password','Mot de passe','password']],'Me connecter')+'<div class="auth-links"><a href="/auth/magic">Recevoir un lien de connexion</a><a href="/auth/recover">Mot de passe oublié</a><a href="/auth/signup">Créer un compte</a></div>');
   const password=document.querySelector('[name=password]');password.minLength=1;password.autocomplete='current-password';
   submit('login',()=>{location.href='/agent';});
  }catch(error){page('Votre espace est indisponible.',error.message||'Vérifiez la connexion puis réessayez.','<a class="button" href="/auth/login">Réessayer</a>');}
 }
 return {boot,call};
})();

window.PropertyTwinAdmin=async function(){
 const root=document.querySelector('#app');document.title='Administration IA — PropertyTwin';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let credential=sessionStorage.getItem('pt-platform-key')||'',state;
 const names={agentPreview:'Studio agent',homeStaging:'Home staging',magicErase:'Gomme IA',buyerPreview:'Aperçu acheteur',finalHD:'Rendu HD'};
 const types={http:'Backend existant',openai:'OpenAI',gemini:'Gemini',flux:'Flux'};
 async function request(body){const response=await fetch('/api/admin/ai-routing',{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.message),{status:response.status});return value;}
 function login(message=''){
  root.innerHTML=`<div class="platform-login"><a class="agent-brand" href="/agent"><span class="brand-symbol">P</span>PropertyTwin</a><form id="platform-login"><div class="agent-kicker">ADMINISTRATION PROPERTYTWIN</div><h1>Configurer l’IA.</h1><p>Accès réservé à l’administration de la plateforme.</p><label>Clé d’administration<input name="credential" type="password" required autocomplete="off" maxlength="512"></label><button class="agent-primary">Ouvrir l’administration</button><p role="alert" id="platform-error">${esc(message)}</p></form></div>`;
  root.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');if(button.disabled)return;credential=event.target.elements.credential.value;button.disabled=true;try{state=await request();sessionStorage.setItem('pt-platform-key',credential);render();}catch(error){root.querySelector('#platform-error').textContent=error.message;button.disabled=false;}};
 }
 function options(selected,empty=false){return `${empty?'<option value="">Aucun secours</option>':''}${state.config.profiles.map(profile=>`<option value="${esc(profile.id)}" ${selected===profile.id?'selected':''}>${esc(profile.name)}${profile.enabled?'':' · désactivé'}</option>`).join('')}`;}
 function render(){
  const config=state.config;root.innerHTML=`<main class="platform-admin"><div class="platform-header"><a class="agent-brand" href="/agent"><span class="brand-symbol">P</span>PropertyTwin</a><button id="platform-logout">Fermer l’accès</button></div><div class="agent-kicker">ADMINISTRATION PROPERTYTWIN</div><h1>Les bons modèles,<br>pour chaque transformation.</h1><p class="platform-intro">Choisissez le fournisseur et le secours par outil. Les tâches déjà envoyées conservent leur modèle ; les nouvelles utilisent votre configuration.</p><form id="routing-form"><div class="platform-switches"><label><input type="checkbox" name="enabled" ${config.enabled?'checked':''}> Activer les transformations IA</label><label><input type="checkbox" name="buyerEnabled" ${config.buyerEnabled?'checked':''}> Autoriser l’IA côté acheteur</label></div><h2>Fournisseurs</h2><p>Les clés API sont configurées sur le serveur. Une clé disponible ne garantit pas l’accès au modèle.</p><div class="platform-profiles">${config.profiles.map((profile,index)=>{const status=state.profiles.find(p=>p.id===profile.id);return `<fieldset data-profile="${index}"><legend>${esc(types[profile.type])}</legend><label>Nom<input name="profile-name-${index}" value="${esc(profile.name)}" maxlength="80" required></label><label>Modèle<input name="profile-model-${index}" value="${esc(profile.model)}" maxlength="100" ${profile.type==='http'?'readonly placeholder="Défini par votre backend"':'required'}></label><label class="platform-check"><input name="profile-enabled-${index}" type="checkbox" ${profile.enabled?'checked':''}> Autoriser ce profil</label><p class="provider-availability ${status?.configured?'ready':''}">${status?.configured?'Clé / endpoint disponible':'Clé / endpoint manquant'}${status?.supportsMasks?' · Masques pris en charge':''}${status?.supportsHD?' · HD pris en charge':''}</p></fieldset>`;}).join('')}</div><h2>Routage des outils</h2><div class="platform-routes">${Object.entries(names).map(([key,label])=>`<div class="platform-route"><h3>${esc(label)}</h3><label>Principal<select name="${key}-primary">${options(config.routes[key].primary)}</select></label><label>Secours<select name="${key}-fallback">${options(config.routes[key].fallback,true)}</select></label></div>`).join('')}</div><p class="platform-policy">Un secours intervient si le principal est indisponible avant l’appel ou refuse la requête pour quota (HTTP 429). Un timeout ou un résultat ambigu échoue sans second appel automatique. L’échec rembourse les crédits internes.</p><div class="platform-actions"><button id="routing-save" class="agent-primary" ${state.storageReady?'':'disabled'}>Enregistrer le routage</button><button type="button" id="routing-reload">Recharger la configuration</button><span>Révision ${config.revision}</span></div><p id="routing-message" role="status" aria-live="polite">${state.storageReady?'':'Migration SQL 202610060005_ai_routing.sql requise pour enregistrer.'}</p></form><p class="platform-footnote">Le rendu HD se demande depuis une variante du Studio. Le profil doit prendre en charge une sortie haute définition. Aucun appel IA n’est lancé depuis cette page.</p></main>`;
  root.querySelector('#platform-logout').onclick=()=>{credential='';sessionStorage.removeItem('pt-platform-key');login();};
  const form=root.querySelector('#routing-form');
  form.onsubmit=async event=>{
   event.preventDefault();const button=root.querySelector('#routing-save');if(button.disabled)return;button.disabled=true;form.inert=true;const submittedCredential=credential;
   const next=structuredClone(config);next.enabled=form.elements.enabled.checked;next.buyerEnabled=form.elements.buyerEnabled.checked;
   for(const [index,profile] of next.profiles.entries()){profile.name=form.elements['profile-name-'+index].value;profile.model=form.elements['profile-model-'+index].value;profile.enabled=form.elements['profile-enabled-'+index].checked;}
   for(const key of Object.keys(names))next.routes[key]={primary:form.elements[key+'-primary'].value,fallback:form.elements[key+'-fallback'].value||null};
   try{const result=await request({config:next,baseline:config.revision});if(credential!==submittedCredential)return;state=result;render();root.querySelector('#routing-message').textContent='Routage enregistré. Les prochains envois utiliseront cette configuration.';}
   catch(error){if(credential===submittedCredential&&form.isConnected){root.querySelector('#routing-message').textContent=error.message;button.disabled=false;}}
   finally{if(form.isConnected)form.inert=false;}
  };
  root.querySelector('#routing-reload').onclick=async event=>{event.target.disabled=true;const submittedCredential=credential;try{const result=await request();if(credential!==submittedCredential)return;state=result;render();}catch(error){if(credential===submittedCredential){root.querySelector('#routing-message').textContent=error.message;event.target.disabled=false;}}};
 }
 if(!credential)return login();try{state=await request();render();}catch(error){if(error.status===401){sessionStorage.removeItem('pt-platform-key');credential='';}login(error.message);}
};

window.PropertyTwinRoomplan=({root,load,onRoom,onLoad=()=>{}})=>{
 const button=document.createElement('button');button.type='button';button.className='agent-primary';button.textContent='Explorer le RoomPlan';
 const stage=document.createElement('div'),status=document.createElement('p');status.setAttribute('role','status');root.replaceChildren(button,status,stage);
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;button.textContent='Chargement du RoomPlan…';status.textContent='La structure du logement se prépare…';
  let viewer;
  try{
   const data=await load();if(!root.isConnected)return;if(!data.roomplan)throw Error('Aucune structure RoomPlan compatible disponible.');
   const module=await import('/roomplan-viewer.js');if(!root.isConnected)return;
   viewer=module.mountRoomplan(stage,data.roomplan,{onRoom});stage.roomplanViewer=viewer;status.textContent='';button.hidden=true;onLoad();
  }catch(error){viewer?.dispose();stage.replaceChildren();status.textContent=error.message||'Le RoomPlan est indisponible. Réessayez.';button.textContent='Réessayer le RoomPlan';}
  finally{button.disabled=false;}
 };
};

window.PropertyTwinAIJobs={
 key:()=>crypto.randomUUID().replaceAll('-',''),
 async wait(initial,load,{onState=()=>{},alive=()=>true}={}){
  // Immediate results preserve compatibility with older endpoints.
  if(!initial.job)return initial;
  let job=initial.job,failures=0;
  while(alive()){
   onState(job);
   if(job.status==='completed'){
    if(!job.result)throw Object.assign(Error(job.resultUnavailable?'Cette version a été supprimée. Retrouvez l’historique de la photo.':'Le résultat de cette transformation est indisponible.'),{jobTerminal:true});
    return {...job.result,credits:job.credits};
   }
   if(job.status==='failed')throw Object.assign(Error(job.message||'La transformation a échoué.'),{jobTerminal:true});
   if(!['queued','processing'].includes(job.status))throw Error('État de transformation invalide.');
   await new Promise(resolve=>setTimeout(resolve,1000));
   if(!alive())throw Error('Suivi interrompu. Retrouvez votre transformation à la prochaine connexion.');
   try{
    const result=await load(job.id);
    const fresh=result.jobs?.find(item=>item.id===job.id);
    if(!fresh)throw Error('Transformation introuvable.');
    job=fresh;failures=0;
   }catch(error){
    if(error.status===401||error.status===403||++failures>=5)throw Error('Le suivi est momentanément indisponible. Votre tâche reste enregistrée ; actualisez pour la retrouver.',{cause:error});
   }
  }
  throw Error('Suivi interrompu.');
 }
};

// History concerns photo references only: room geometry, names and other fields stay intact.
window.PropertyTwinPhotoHistory=function(property){
 const undo=[],redo=[];let structure='';
 const snapshot=()=>({rooms:property.rooms.map(room=>({id:room.id,photos:[...room.photos]})),hero:property.hero||''});
 function synchronize(){const next=JSON.stringify(property.rooms.map(room=>room.id));if(next!==structure){undo.length=redo.length=0;structure=next;}}
 function apply(state){for(const room of property.rooms)room.photos=[...state.rooms.find(item=>item.id===room.id).photos];property.hero=state.hero;}
 return {
  get canUndo(){synchronize();return undo.length>0;},
  get canRedo(){synchronize();return redo.length>0;},
  change(operation){
   synchronize();const before=snapshot(),next=structuredClone(before);operation(next);
   if(next.rooms.some(room=>room.photos.length>100))throw Error('Une pièce peut contenir au maximum 100 photos.');
   if(JSON.stringify(next)===JSON.stringify(before))return false;
   apply(next);undo.push(before);if(undo.length>50)undo.shift();redo.length=0;return true;
  },
  undo(){synchronize();if(!undo.length)return false;redo.push(snapshot());apply(undo.pop());return true;},
  redo(){synchronize();if(!redo.length)return false;undo.push(snapshot());apply(redo.pop());return true;},
  clear(){undo.length=redo.length=0;structure=JSON.stringify(property.rooms.map(room=>room.id));}
 };
};

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

window.PropertyTwinStudioForm=function({form,draft,onGenerate,onErase,onUpload}){
 const c=window.PropertyTwinAITools;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const select=(name,label,values)=>`<label data-tool-field="${name}">${label}<select name="${name}">${values.map(value=>`<option ${value===draft[name]?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`;
 draft.action||='Meubler';draft.prompt??='';
 form.innerHTML=`<label>Transformation<select name="action">${c.tools.filter(t=>t.action!=='Supprimer un objet').map(t=>`<option value="${esc(t.action)}" ${t.action===draft.action?'selected':''}>${esc(t.label)}</option>`).join('')}</select></label><p id="studio-tool-hint" class="studio-tool-hint"></p>
 <div class="studio-tool-fields">${select('roomType','Type de pièce',c.roomTypes)}${select('style','Style',c.styles)}${select('floor','Revêtement du sol',c.floors)}${select('wall','Couleur des murs',[...Object.keys(c.walls),'Personnalisée'])}<label data-tool-field="wallColor">Couleur personnalisée<input name="wallColor" type="color" value="${esc(draft.wallColor||c.walls[draft.wall]||c.walls['Blanc cassé'])}"></label>${select('usage','Nouvel usage',c.usages)}${select('renovation','Niveau de rénovation',c.renovations)}${select('sky','Ambiance du ciel',c.skies)}</div>
 <div data-tool-field="inspiration" class="studio-inspiration"><label>Image d’inspiration<input id="studio-inspiration-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><div id="studio-inspiration-preview"></div><p class="studio-tool-hint">L’image guide l’ambiance, la palette et le mobilier. L’architecture de votre photo reste la référence.</p></div>
 <label><span id="studio-prompt-label">Votre instruction (facultatif)</span><textarea name="prompt" maxlength="1000" placeholder="Décrivez votre idée">${esc(draft.prompt)}</textarea></label><p id="studio-renovation-notice" class="studio-tool-notice" hidden>Visualisation non contractuelle. Cette projection ne constitue ni un devis ni une validation de faisabilité.</p><button class="agent-primary" data-generate>Générer la transformation ✧</button><button type="button" id="clear-studio-inspiration" hidden>Retirer l’inspiration</button><button id="magic-eraser" type="button">Gomme IA · sélectionner un objet</button><p class="muted">Crédits restants : <span data-studio-credits></span>. La photo originale est conservée.</p><p id="agent-ai-message" role="status"></p>`;
 const field=name=>form.elements.namedItem(name);
 const preview=()=>{
  form.querySelector('#studio-inspiration-preview').innerHTML=draft.inspiration?`<img src="${esc(draft.inspiration)}" alt="Image d’inspiration importée">`:'<p>Aucune image sélectionnée.</p>';
  form.querySelector('#clear-studio-inspiration').hidden=draft.action!=='Image inspiration'||!draft.inspiration;
 };
 const update=()=>{
  const tool=c.tools.find(t=>t.action===draft.action);
  form.querySelectorAll('[data-tool-field]').forEach(label=>{const active=tool.fields.includes(label.dataset.toolField);label.hidden=!active;label.querySelectorAll('input,select').forEach(input=>input.disabled=!active);});
  form.querySelector('#studio-tool-hint').textContent=tool.hint;
  field('prompt').required=draft.action==='Prompt personnalisé';
  form.querySelector('#studio-prompt-label').textContent=field('prompt').required?'Décrivez votre idée':'Votre instruction (facultatif)';
  form.querySelector('#studio-renovation-notice').hidden=draft.action!=='Rénover';preview();
 };
 const collect=()=>{for(const name of ['action','prompt','roomType','style','floor','wall','wallColor','usage','renovation','sky'])draft[name]=field(name).value;};
 form.addEventListener('input',event=>{
  if(event.target.name==='wallColor'){field('wall').value='Personnalisée';}
  collect();if(event.target.name==='wallColor')update();
 });
 form.addEventListener('change',event=>{
  if(event.target.name==='wall'&&c.walls[event.target.value])field('wallColor').value=c.walls[event.target.value];
  collect();update();
 });
 let uploading=false;
 field('action').onchange=()=>{collect();update();};
 form.querySelector('#studio-inspiration-upload').onchange=async event=>{
  const file=event.target.files[0];if(!file||uploading)return;uploading=true;event.target.disabled=true;
  const message=form.querySelector('#agent-ai-message');message.textContent='Import de l’inspiration…';
  try{const result=await onUpload(file);draft.inspiration=result.url;preview();message.textContent='Inspiration importée.';}
  catch(error){message.textContent=error.message||'L’import a échoué. Réessayez.';}
  finally{uploading=false;event.target.disabled=draft.action!=='Image inspiration';event.target.value='';}
 };
 form.querySelector('#clear-studio-inspiration').onclick=()=>{delete draft.inspiration;preview();};
 form.querySelector('#magic-eraser').onclick=onErase;
 form.onsubmit=async event=>{
  event.preventDefault();collect();if(uploading)return;
  const tool=c.tools.find(t=>t.action===draft.action),options={};
  for(const key of tool.fields)if(key!=='inspiration')options[key]=draft[key];
  const payload={action:draft.action,prompt:draft.prompt,options,...(draft.action==='Image inspiration'?{inspiration:draft.inspiration}: {})};
  try{c.normalizeTool(payload);await onGenerate(payload);}
  catch(error){form.querySelector('#agent-ai-message').textContent=error.message||'La transformation n’a pas abouti.';}
 };
 collect();update();
};

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

window.PropertyTwinDashboard=async function(authSession=null){
const root=document.querySelector('#app');const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={home:'▦',properties:'▤',media:'▧',studio:'✧',leads:'♧',distribution:'↗',settings:'⚙',trash:'⌫'};
const studioDrafts=new Map();
let roomToFocus=null;let key=authSession?'cookie':sessionStorage.getItem('pt-agent-key')||'',workspace={},props=[],activity={sessions:[],leads:[],variants:[]},page='home',selected=null,editingBaseline=null,creationKey=null,creationBaseline=null,mediaJobs=0,tab='Informations',search='',filter='all',leadSearch='',leadStage='all',dirty=false,agentVariants=[],studioPhoto=null,studioParentId=null,studioComparisonId=null;
root.addEventListener('click',async event=>{if(!event.target.closest('#connect-iphone'))return;try{const [pair,connection]=await Promise.all([call('pair',{}),call('connection')]);const dialog=document.createElement('dialog');dialog.className='iphone-connection';const origins=pair.origins.length?pair.origins:[location.origin];dialog.innerHTML=`<form method="dialog"><button aria-label="Fermer">Fermer</button></form><h2>Connecter l’iPhone</h2><p>${connection.database==='postgres'?'Base PostgreSQL commune active.':'Stockage local JSON actif.'} Gardez le Mac allumé et les deux appareils sur le même Wi-Fi.</p><p>Avec la nouvelle version de l’app, ouvrez ce lien dans Safari sur votre iPhone. Il expire dans cinq minutes et ne fonctionne qu’une fois.</p>${origins.map(origin=>{const link='propertytwin://connect?'+new URLSearchParams({origin,code:pair.code});return `<p><b>${esc(origin)}</b><br><a href="${esc(link)}">Connecter PropertyTwin</a><br><button type="button" data-copy-pair="${esc(link)}">Copier le lien</button></p>`;}).join('')}`;dialog.querySelectorAll('[data-copy-pair]').forEach(button=>button.onclick=()=>navigator.clipboard.writeText(button.dataset.copyPair).then(()=>{button.textContent='Lien copié';}).catch(()=>{notify('Ouvrez le dashboard dans Safari sur l’iPhone pour toucher le lien.');}));dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();}catch(error){notify(error.message);}});
const notify=message=>{const n=document.querySelector('#notice');n.textContent=message;n.style.display='block';setTimeout(()=>n.style.display='none',5000);};
async function call(endpoint,body){
 const controller=new AbortController();let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},endpoint==='generate'?180000:120000);
 try{
  const res=await fetch('/api/agent/'+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authSession?{}:{Authorization:'Bearer '+key})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
  const data=await res.json();if(!res.ok)throw Object.assign(Error(data.message),{field:data.field,status:res.status});return data;
 }catch(error){if(timedOut)throw Error('Le serveur tarde à répondre. Vérifiez la connexion puis réessayez.',{cause:error});throw error;}
 finally{clearTimeout(timer);}
}
async function mediaTask(operation){
 mediaJobs++;root.inert=true;
 const state=document.querySelector('#save-state');if(state)state.textContent='Traitement des médias en cours…';
 try{return await operation();}
 finally{mediaJobs--;root.inert=mediaJobs>0;const current=document.querySelector('#save-state');if(current)current.textContent=mediaJobs?'Traitement des médias en cours…':dirty?'Modifications non enregistrées':'Votre espace de création';}
}

let aiConfig={},signedUploads=false;const uploadIntents=new WeakMap(),photoHistories=new WeakMap();
function photoHistory(property=selected){if(!photoHistories.has(property))photoHistories.set(property,window.PropertyTwinPhotoHistory(property));return photoHistories.get(property);}
function photoChanged(){dirty=true;document.querySelector('#save-state').textContent='Modifications non enregistrées';const count=document.querySelector('[data-editor-tab="Photos"] span');if(count)count.textContent=selected.rooms.reduce((sum,r)=>sum+r.photos.length,0);}
function changePhotos(operation){try{if(photoHistory().change(operation)){photoChanged();editorBody();}}catch(error){notify(error.message);}}
let dashboardAlive=true;const generationJobs=new Map(),generationErrors=new Map(),generationKeys=new Map();
const names={Draft:'Brouillon',Published:'Publié',Unlisted:'Lien privé',Archived:'Archivé'};
function shell(){root.innerHTML=`<div class="agent-shell"><aside class="agent-sidebar"><a class="agent-brand" href="/agent"><span class="brand-symbol">P</span>PropertyTwin<span class="brand-pro">PRO</span></a><div class="workspace-label">ESPACE DE TRAVAIL</div><nav class="agent-nav">${[['home','Vue d’ensemble'],['properties','Mes biens'],['media','Médiathèque'],['studio','Studio IA'],['leads','Contacts'],['distribution','Diffusion & statistiques'],['trash','Corbeille'],['settings','Identité de l’agence']].map(([id,name])=>`<button data-page="${id}" class="${page===id?'selected':''}"><span>${icons[id]}</span>${name}${id==='leads'?'<small>'+activity.leads.length+'</small>':''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="studio-promo"><span>✧ Votre studio immobilier</span><p>Du premier visuel<br>au prochain rendez-vous.</p><button data-page="studio">Explorer le studio ↗</button></div><div class="workspace-person"><span class="avatar">${esc((workspace.agentName||workspace.name||'A')[0])}</span><div><b>${esc(workspace.name||'Votre agence')}</b><small>${esc(workspace.agentName||'Espace professionnel')}</small></div><button id="logout" aria-label="Déconnexion">↪</button></div></div></aside><div class="agent-main"><header class="agent-topbar"><div class="breadcrumb">Espace agence <span>/</span> <b>${selected?esc(selected.title):({home:'Vue d’ensemble',properties:'Mes biens',media:'Médiathèque',studio:'Studio IA',leads:'Contacts',distribution:'Diffusion',settings:'Paramètres',trash:'Corbeille'})[page]}</b></div><div class="topbar-actions">${!authSession?'<button id="connect-iphone" type="button">Connecter l’iPhone</button>':''}<span class="connection-dot"></span><span>${authSession?esc(({owner:'Propriétaire',admin:'Administrateur',agent:'Agent',viewer:'Lecture seule'})[authSession.role]):'Votre espace synchronisé'}</span>${authSession?.memberships.length>1?'<select id="active-agency" aria-label="Agence active">'+authSession.memberships.map(m=>'<option value="'+esc(m.agency_id)+'" '+(m.agency_id===authSession.agency?'selected':'')+'>'+esc(m.agencies?.name||'Agence')+'</option>').join('')+'</select>':''}<button id="new-property" class="agent-primary">＋ Nouveau bien</button><span class="avatar">A</span></div></header><div id="agent-content" class="agent-content"></div></div></div>`;root.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{if(dirty&&!confirm('Quitter l’éditeur sans enregistrer les modifications ?'))return;page=button.dataset.page;selected=null;dirty=false;shell();render();});document.querySelector('#new-property').onclick=newProperty;const agencySelect=document.querySelector('#active-agency');if(agencySelect)agencySelect.onchange=async()=>{if(dirty&&!confirm('Quitter sans enregistrer les modifications ?')){agencySelect.value=authSession.agency;return;}agencySelect.disabled=true;try{await window.PropertyTwinAuth.call('agency',{agency:agencySelect.value});location.href='/agent';}catch(error){agencySelect.value=authSession.agency;agencySelect.disabled=false;notify(error.message);}};document.querySelector('#logout').onclick=async()=>{if(authSession){try{await window.PropertyTwinAuth.call('logout',{});location.href='/auth/login';}catch(error){notify(error.message);}return;}sessionStorage.removeItem('pt-agent-key');key='';login();};}
function login(){root.innerHTML=`<div class="agent-login"><div class="agent-brand"><span class="brand-symbol">P</span>PropertyTwin</div><div class="login-card"><div class="agent-kicker">VOTRE ESPACE PROFESSIONNEL</div><h1>Tout votre marketing.<br>Un seul espace.</h1><p>Vos biens, vos visuels et vos contacts.<br>Un espace commun à votre app et au web, sans compte utilisateur.</p><form id="agent-login"><label>Jeton de votre agence<input id="agent-token" type="password" required autocomplete="off" placeholder="Votre jeton agent"></label><button class="agent-primary">Accéder à mon espace →</button><p id="login-error" role="alert"></p></form><small>Utilisez la clé de connexion de votre serveur.</small></div></div>`;document.querySelector('#agent-login').onsubmit=async e=>{e.preventDefault();key=document.querySelector('#agent-token').value;try{await refresh();sessionStorage.setItem('pt-agent-key',key);shell();render();}catch(error){document.querySelector('#login-error').textContent=error.message;}};}
async function refresh(){const results=await Promise.all([call('properties'),call('activity'),call('workspace'),call('media-config'),call('ai-config')]);aiConfig=results[4];signedUploads=results[3].signedUploads===true;[props,activity]=results;workspace=results[2].workspace||{};const tasks=await call('jobs');restoreGenerationJobs(tasks.jobs||[]);if(!Object.keys(workspace).length){let legacy;try{legacy=JSON.parse(localStorage.getItem('pt-agency-settings')||'{}');}catch{legacy={};}if(Object.keys(legacy).length){try{const migrated=await call('sync-workspace',{patch:legacy,baseline:{}});workspace=migrated.workspace||{};localStorage.removeItem('pt-agency-settings');props=await call('properties');}catch(error){notify('Préférences locales à vérifier : '+error.message);}}}}
function commonBranding(){const agency={},agent={};for(const key of ['name','logo','color','email','phone','website','address'])if(workspace[key])agency[key]=workspace[key];for(const [source,target] of [['agentName','name'],['agentPhoto','photo'],['agentEmail','email'],['agentPhone','phone']])if(workspace[source])agent[target]=workspace[source];if(!agent.email&&workspace.email)agent.email=workspace.email;if(!agent.phone&&workspace.phone)agent.phone=workspace.phone;if(agent.name)agent.firstName=agent.name.split(/\s+/)[0];return {agency,agent};}
function heading(kicker,title,subtitle,extra=''){return `<div class="agent-page-heading"><div><div class="agent-kicker">${kicker}</div><h1>${title}</h1><p>${subtitle}</p></div>${extra}</div>`;}
function stats(){const visits=activity.sessions.reduce((n,s)=>n+s.visits,0);return `<div class="agent-metrics">${[['Biens en portefeuille',props.length,'Tous vos projets immobiliers','▤'],['Visuels disponibles',props.reduce((n,p)=>n+p.rooms.reduce((n,r)=>n+r.photos.length,0),0),'Prêts à valoriser vos biens','▧'],['Visites de vos liens',visits,'Cumul des consultations','↗'],['Contacts générés',activity.leads.length,'De nouvelles conversations','♧']].map(([label,value,detail,icon])=>`<div class="metric-card"><div>${label}<span>${icon}</span></div><strong>${value}</strong><small>${detail}</small></div>`).join('')}</div>`;}
function propertyCards(items){return `<div class="property-grid">${items.map(p=>`<article class="property-card"><button class="property-cover" data-open="${esc(p.slug)}">${p.hero?`<img src="${esc(p.media?.[p.hero]?.thumbnail||p.hero)}" alt="${esc(p.title)}" loading="lazy">`:'<div class="property-placeholder">▧</div>'}<span class="property-state ${p.status.toLowerCase()}">${names[p.status]}</span></button><div class="property-card-info"><small>${esc(p.listingType||'Bien immobilier')}</small><button class="property-title" data-open="${esc(p.slug)}">${esc(p.title)}</button><p>${esc(p.location||'Adresse à renseigner')}</p><div class="property-card-facts">${p.surface?esc(p.surface)+' m²':''}${p.roomsCount?' · '+esc(p.roomsCount)+' pièces':''}<b>${p.price?new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(p.price):'Prix à définir'}</b></div><div class="property-card-footer"><span>▧ ${p.rooms.reduce((n,r)=>n+r.photos.length,0)} photos</span><button data-open="${esc(p.slug)}">Éditer le bien ↗</button></div></div></article>`).join('')}</div>`;}
function empty(title,text){return `<div class="agent-empty"><div>＋</div><h3>${title}</h3><p>${text}</p><button class="agent-primary" id="empty-create">Créer mon premier bien</button></div>`;}
function render(){const content=document.querySelector('#agent-content');if(selected){editor();return;}
if(page==='home'){content.innerHTML=heading('VOTRE AGENCE, EN MOUVEMENT','Chaque bien mérite<br>une présentation remarquable.','Créez vos contenus. Valorisez vos biens. Engagez vos prospects.')+stats()+`<div class="agent-section-title"><h2>Votre portefeuille</h2><button id="all-properties">Voir tous les biens →</button></div>`+(props.length?propertyCards(props.slice(-3).reverse()):empty('Votre prochain mandat commence ici.','Ajoutez un bien, rassemblez ses médias et préparez sa diffusion.'))+`<div class="dashboard-tools"><article><span>✧</span><div><small>STUDIO IA</small><h3>Révélez le potentiel<br>de chaque espace.</h3><p>Home staging, rénovation, murs et sols.</p><button data-page-shortcut="studio">Ouvrir le studio ↗</button></div></article><article><span>↗</span><div><small>DIFFUSION & CONTACTS</small><h3>Chaque visite compte.<br>Chaque contact aussi.</h3><p>Retrouvez l’activité de vos prospects.</p><button data-page-shortcut="distribution">Voir mes performances ↗</button></div></article></div>`;document.querySelector('#all-properties').onclick=()=>go('properties');}
if(page==='properties'){const visible=props.filter(p=>(filter==='all'||p.status===filter)&&(p.title+' '+p.location).toLowerCase().includes(search.toLowerCase()));content.innerHTML=heading('PORTEFEUILLE','Vos biens, parfaitement organisés.','Un espace dédié à chaque mandat, du premier visuel à la diffusion.')+`<div class="portfolio-toolbar"><div class="portfolio-filters">${[['all','Tous les biens'],['Draft','Brouillons'],['Unlisted','Liens privés'],['Published','Publiés'],['Archived','Archives']].map(([id,label])=>`<button data-filter="${id}" class="${filter===id?'selected':''}">${label} <span>${id==='all'?props.length:props.filter(p=>p.status===id).length}</span></button>`).join('')}</div><input id="search-properties" placeholder="Rechercher un bien, une adresse…" value="${esc(search)}"></div>`+(visible.length?propertyCards(visible):empty('Votre portefeuille est prêt à grandir.','Créez un bien pour commencer à préparer vos visuels.'));content.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});document.querySelector('#search-properties').oninput=e=>{search=e.target.value;const pos=e.target.selectionStart;render();const field=document.querySelector('#search-properties');field.focus();field.setSelectionRange(pos,pos);};}
if(page==='media'){const photos=props.flatMap(p=>p.rooms.flatMap(r=>r.photos.map(url=>({p,r,url}))));content.innerHTML=heading('TOUS VOS CONTENUS','La médiathèque de votre agence.','Retrouvez vos photos par bien et ouvrez leur éditeur.')+`<div class="media-grid">${photos.map(({p,r,url})=>`<button class="media-tile" data-open="${esc(p.slug)}"><img src="${esc(p.media?.[url]?.thumbnail||url)}" loading="lazy" alt="${esc(r.name)}"><span><b>${esc(r.name)}</b><small>${esc(p.title)}</small></span></button>`).join('')}</div>`+(photos.length?'':empty('Vos visuels, réunis au même endroit.','Importez des photos dans un bien pour les retrouver ici.'));}
if(page==='leads'||page==='distribution'){content.innerHTML=heading(page==='leads'?'RELATIONS CLIENTS':'PERFORMANCES',page==='leads'?'De visiteurs à futurs acquéreurs.':'Comprenez ce qui intéresse vos prospects.',page==='leads'?'Toutes les demandes générées par vos liens immobiliers.':'Des consultations aux conversations, suivez les signaux de vos biens.')+stats()+(page==='leads'?leadToolbar():distributionCharts())+`<div class="agent-table-wrap"><table class="agent-table ${page==='leads'?'agent-contact-table':''}" role="table"><thead><tr><th>Prospect</th><th>Bien</th><th>${page==='leads'?'Demande':'Consultations'}</th><th>${page==='leads'?'Coordonnées':'Temps cumulé'}</th>${page==='leads'?'<th>Statut</th>':''}</tr></thead><tbody>${(page==='leads'?filteredLeads():activity.sessions).map(item=>`<tr ${page==='leads'?'data-lead="'+esc(item.id)+'" tabindex="0"':''}><td data-label="Prospect"><span class="table-avatar">${esc((item.name||item.lead?.name||'V')[0])}</span>${esc(item.name||item.lead?.name||'Visiteur anonyme')}</td><td data-label="Bien">${esc(props.find(p=>p.slug===item.slug)?.title||'Bien de démonstration')}</td><td data-label="${page==='leads'?'Demande':'Consultations'}">${esc(page==='leads'?({project:'Projet sauvegardé',visit:'Visite',callback:'Rappel',question:'Question',interest:'Intérêt'})[item.kind]||item.kind:item.visits)}</td><td data-label="${page==='leads'?'Coordonnées':'Temps cumulé'}">${page==='leads'?'<span class="lead-contact-lines">'+[item.email,item.phone].filter(Boolean).map(value=>'<span>'+esc(value)+'</span>').join('')+'</span>':esc(Math.floor(item.events.reduce((n,e)=>n+(e.duration||0),0)/60)+' min')}</td>${page==='leads'?'<td data-label="Statut"><span class="lead-stage-badge '+esc(item.stage||'new')+'">'+esc(stageNames[item.stage||'new'])+'</span></td>':''}</tr>`).join('')||'<tr><td colspan="5" class="table-empty">Votre prochaine conversation commence avec le partage d’un bien.</td></tr>'}</tbody></table></div>`;}
if(page==='studio'){content.innerHTML=heading('VOTRE STUDIO CRÉATIF','Des espaces à leur plein potentiel.','Choisissez un bien pour préparer ses photos et ses transformations.')+`<div class="studio-capabilities">${[['Home staging','Meubler et personnaliser'],['Vider une pièce','Repartir de l’espace existant'],['Rénover','Imaginer de nouveaux matériaux'],['Murs & sols','Explorer les finitions'],['Photos & HDR','Préparer les visuels'],['Vidéo & 360°','Organiser les contenus immersifs']].map(([title,subtitle])=>`<article><span>✧</span><h3>${title}</h3><p>${subtitle}</p></article>`).join('')}</div>`+(props.length?propertyCards(props):empty('Commencez par un bien.','Ses photos seront disponibles dans votre éditeur.'));}
if(page==='trash'){content.innerHTML=heading('CORBEILLE','Vos dossiers restent récupérables.','Les biens retirés sont masqués dans l’app et leurs liens clients sont désactivés.')+'<div id="property-trash" class="agent-panel">Chargement…</div>';loadTrash();}
if(page==='settings'){const baseline=structuredClone(workspace);content.innerHTML=heading('IDENTITÉ PARTAGÉE','Une expérience à votre image.','Les coordonnées et visuels sont partagés avec l’app. Les biens utilisant cette identité suivent vos modifications.')+`<form id="agency-settings" class="agent-panel editor-form"><div class="panel-heading"><h2>Votre agence</h2><p>Un espace commun, sans comptes utilisateurs.</p></div>${[['name','Nom de l’agence','text'],['email','Email de l’agence','email'],['phone','Téléphone de l’agence','tel'],['website','Site de l’agence','url'],['address','Adresse de l’agence','text'],['logo','URL du logo','text']].map(([id,label,type])=>`<label>${label}<input name="${id}" type="${type}" value="${esc(workspace[id]||'')}"></label>`).join('')}<label>Couleur de marque<input name="color" type="color" value="${esc(workspace.color||'#5865e9')}"></label><label class="upload-button">Importer le logo<input type="file" accept="image/jpeg,image/png,image/webp" data-workspace-upload="logo"></label><div class="panel-heading secondary-heading"><h2>Votre interlocuteur</h2><p>Les informations affichées aux clients sur les mini-sites.</p></div>${[['agentName','Nom complet','text'],['agentEmail','Email de l’interlocuteur','email'],['agentPhone','Téléphone de l’interlocuteur','tel'],['agentPhoto','URL du portrait','text']].map(([id,label,type])=>`<label>${label}<input name="${id}" type="${type}" value="${esc(workspace[id]||'')}"></label>`).join('')}<label class="upload-button">Importer le portrait<input type="file" accept="image/jpeg,image/png,image/webp" data-workspace-upload="agentPhoto"></label><div class="wide settings-actions"><button class="agent-primary">Enregistrer et synchroniser</button><span id="workspace-save-state">À jour sur votre serveur</span></div></form>`;const form=document.querySelector('#agency-settings'),initial=Object.fromEntries(new FormData(form));form.oninput=()=>{dirty=true;document.querySelector('#workspace-save-state').textContent='Modifications non enregistrées';};form.querySelectorAll('[data-workspace-upload]').forEach(input=>input.onchange=async()=>{input.disabled=true;try{const result=await upload(input.files[0]);form.elements[input.dataset.workspaceUpload].value=result.url;dirty=true;document.querySelector('#workspace-save-state').textContent='Modifications non enregistrées';}catch(error){notify(error.message);}finally{input.disabled=false;}});form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;const values=Object.fromEntries(new FormData(form)),patch={};for(const [field,value] of Object.entries(values))if(String(value).trim()!==String(initial[field]||'').trim())patch[field]=String(value).trim();try{const result=await call('sync-workspace',{patch,baseline});workspace=result.workspace;dirty=false;await refresh();render();notify('Identité enregistrée sur le serveur et disponible pour l’app.');}catch(error){notify(error.message);button.disabled=false;if(error.status===409&&error.field?.startsWith('workspace.'))workspaceConflict(form,baseline,initial,error.field.slice(10));}};}
if(page==='leads'){document.querySelector('#lead-filter').onchange=e=>{leadStage=e.target.value;render();};document.querySelector('#lead-search').oninput=e=>{leadSearch=e.target.value;const pos=e.target.selectionStart;render();const input=document.querySelector('#lead-search');input.focus();input.setSelectionRange(pos,pos);};document.querySelector('#export-leads').onclick=exportLeads;}content.querySelectorAll('[data-page-shortcut]').forEach(b=>b.onclick=()=>go(b.dataset.pageShortcut));bindOpen();content.querySelectorAll('[data-lead]').forEach(row=>{row.onclick=()=>showLead(row.dataset.lead);row.onkeydown=e=>{if(e.key==='Enter')showLead(row.dataset.lead);};});document.querySelector('#empty-create')?.addEventListener('click',newProperty);}
const channelNames={direct:'Lien direct',whatsapp:'WhatsApp',email:'Email',sms:'SMS',qr:'QR code',portal:'Portail immobilier',social:'Réseaux sociaux',website:'Site de l’agence'};
function distributionCharts(){const dateKey=date=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(date);const days=Array.from({length:14},(_,i)=>{const date=new Date(Date.now()-(13-i)*86400000);return {key:dateKey(date),label:date.toLocaleDateString('fr-FR',{day:'numeric',month:'short',timeZone:'Europe/Paris'}),count:0};});const channels={};for(const s of activity.sessions)for(const event of s.events){if(!['mini_site_open','property_return_visit'].includes(event.type))continue;const day=days.find(d=>d.key===dateKey(new Date(event.at)));if(day)day.count++;const source=channelNames[event.source]?event.source:'direct';channels[source]=(channels[source]||0)+1;}const max=Math.max(1,...days.map(d=>d.count)),total=Object.values(channels).reduce((n,v)=>n+v,0);return `<div class="distribution-charts"><article class="agent-panel"><div class="panel-heading"><h2>L’évolution de vos visites</h2><p>Consultations des 14 derniers jours · heure de Paris</p></div><div class="visits-chart" role="img" aria-label="${esc(days.map(d=>d.label+': '+d.count+' visites').join(', '))}">${days.map(d=>`<div class="visit-column" title="${esc(d.label)} : ${d.count} visites"><span>${d.count||''}</span><i style="height:${d.count/max*120}px"></i><small>${esc(d.label)}</small></div>`).join('')}</div></article><article class="agent-panel"><div class="panel-heading"><h2>Vos canaux de diffusion</h2><p>Canal déclaré par les liens partagés, toutes périodes.</p></div><div class="channel-breakdown">${Object.entries(channels).sort((a,b)=>b[1]-a[1]).map(([source,count])=>`<div><span>${channelNames[source]}</span><b>${count}</b><i><em style="width:${count/Math.max(total,1)*100}%"></em></i></div>`).join('')||'<p>Aucune consultation enregistrée pour le moment.</p>'}</div></article></div>`;}
const stageNames={new:'Nouveau',contacted:'Contacté',qualified:'Qualifié',visit:'Visite programmée',won:'Projet concrétisé',lost:'Sans suite'};
function filteredLeads(){return activity.leads.filter(l=>(leadStage==='all'||(l.stage||'new')===leadStage)&&[l.name,l.email,l.phone,props.find(p=>p.slug===l.slug)?.title].join(' ').toLowerCase().includes(leadSearch.toLowerCase()));}
function leadToolbar(){return `<div class="lead-pipeline">${Object.entries(stageNames).map(([stage,label])=>`<div><span>${label}</span><b>${activity.leads.filter(l=>(l.stage||'new')===stage).length}</b></div>`).join('')}</div><div class="lead-toolbar"><input id="lead-search" value="${esc(leadSearch)}" placeholder="Rechercher un nom, un email, un bien…"><select id="lead-filter"><option value="all">Tous les statuts</option>${Object.entries(stageNames).map(([value,label])=>`<option value="${value}" ${leadStage===value?'selected':''}>${label}</option>`).join('')}</select><button id="export-leads">Exporter les contacts CSV ↓</button></div>`;}
function exportLeads(){const cell=value=>{let text=String(value??'');if(/^[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};const rows=[['Nom','Email','Téléphone','Bien','Statut','Demande','Message','Disponibilités'],...filteredLeads().map(l=>[l.name,l.email,l.phone,props.find(p=>p.slug===l.slug)?.title,stageNames[l.stage||'new'],l.kind,l.message,l.availability])];const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='propertytwin-contacts.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function leadActivitySummary(session){if(!session)return '';const events=session.events||[],seconds=Math.round(events.filter(e=>e.type==='session_duration').reduce((sum,e)=>sum+(Number(e.duration)||0),0));return `<div class="lead-activity-summary"><div><strong>${Number(session.visits)||0}</strong><span>Consultations</span></div><div><strong>${Math.floor(seconds/60)} min ${seconds%60} s</strong><span>Temps cumulé</span></div><div><strong>${events.filter(e=>e.type==='ai_generation').length}</strong><span>Transformations</span></div><div><strong>${events.filter(e=>e.type==='variant_saved').length}</strong><span>Versions sauvegardées</span></div></div>`;}
function leadEventLabel(event,property){const labels={mini_site_open:'Mini-site ouvert',property_return_visit:'Nouvelle visite',gallery_open:'Galerie consultée',photo_view:'Photo consultée',room_view:'Pièce consultée',floorplan_open:'Plan ouvert','3d_open':'3D ouverte',ai_studio_open:'Studio IA ouvert',ai_generation:'Transformation créée',variant_saved:'Version sauvegardée',interest_submitted:'Intérêt exprimé',lead_identified:'Projet sauvegardé',visit_requested:'Visite demandée',contact_clicked:'Contact ouvert'};const room=property?.rooms?.find(r=>r.id===event.room)?.name;return (labels[event.type]||event.type)+(room?' · '+room:'');}
function showLead(id){const lead=activity.leads.find(l=>l.id===id);if(!lead)return;const session=activity.sessions.find(s=>s.id===lead.sessionId),property=props.find(p=>p.slug===lead.slug);const drawer=document.createElement('dialog');drawer.className='lead-drawer';drawer.innerHTML=`<button class="lead-close" aria-label="Fermer">×</button><div class="agent-kicker">FICHE PROSPECT</div><h2>${esc(lead.name)}</h2><p>${esc(property?.title||lead.slug)}</p><div class="lead-contact-actions">${lead.email?`<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>`:''}${lead.phone?`<a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a>`:''}</div><label>Suivi commercial<select id="lead-stage">${[['new','Nouveau'],['contacted','Contacté'],['qualified','Qualifié'],['visit','Visite programmée'],['won','Projet concrétisé'],['lost','Sans suite']].map(([value,label])=>`<option value="${value}" ${lead.stage===value?'selected':''}>${label}</option>`).join('')}</select></label><h3>Sa demande</h3><p class="lead-request-kind">${esc(({project:"Projet sauvegardé",visit:"Demande de visite",callback:"Demande de rappel",question:"Question",interest:"Intérêt pour le bien"})[lead.kind]||lead.kind||"")}</p><p>${esc(lead.interest||'')}</p><p>${esc(lead.message||'Aucun message complémentaire.')}</p>${lead.availability?'<p>Disponibilités : '+esc(lead.availability)+'</p>':''}<h3>Notes de l’agence</h3><form id="lead-note-form"><textarea name="note" required placeholder="Ajouter une note pour le suivi…"></textarea><button class="agent-primary">Ajouter une note</button></form><div class="lead-notes">${(lead.notes||[]).map(n=>`<p>${esc(n.text)}<small>${new Date(n.at).toLocaleString('fr-FR')}</small></p>`).join('')}</div><h3>Activité sur le bien</h3>${leadActivitySummary(session)}<div class="lead-timeline">${(session?.events||[]).filter(e=>e.type!=='session_duration').map(e=>`<div><span>${new Date(e.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span><p>${esc(leadEventLabel(e,property))}</p></div>`).join('')||'<p>Aucune activité enregistrée.</p>'}</div>`;document.body.append(drawer);drawer.showModal();drawer.querySelector('.lead-close').onclick=()=>drawer.close();drawer.onclose=()=>drawer.remove();drawer.querySelector('#lead-stage').onchange=async e=>{try{await call('lead',{id,stage:e.target.value});lead.stage=e.target.value;render();notify('Statut du contact enregistré.');}catch(error){notify(error.message);}};drawer.querySelector('#lead-note-form').onsubmit=async e=>{e.preventDefault();try{await call('lead',{id,note:new FormData(e.target).get('note')});await refresh();drawer.close();showLead(id);}catch(error){notify(error.message);}};}
function workspaceConflict(form,baseline,initial,field){form.querySelector('#workspace-conflict')?.remove();const panel=document.createElement('div');panel.id='workspace-conflict';panel.className='wide workspace-conflict';panel.innerHTML='<p>Ce paramètre a aussi été modifié ailleurs. Choisissez la valeur à conserver.</p><button type="button" data-workspace-choice="local">Conserver ma valeur</button><button type="button" data-workspace-choice="web">Utiliser la valeur du serveur</button>';form.append(panel);panel.querySelectorAll('button').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const latest=(await call('workspace')).workspace;baseline[field]=latest[field]||'';if(button.dataset.workspaceChoice==='web'){form.elements[field].value=latest[field]||(field==='color'?'#5865e9':'');initial[field]=form.elements[field].value;}panel.remove();form.requestSubmit();}catch(error){notify(error.message);button.disabled=false;}});}
async function loadTrash(){const container=document.querySelector('#property-trash');try{const result=await call('trash');if(!container?.isConnected)return;container.innerHTML=result.properties.map((p,i)=>`<div class="trash-property"><div><h3>${esc(p.title)}</h3><p>${esc(p.location)} · retiré le ${new Date(p.deletedAt).toLocaleDateString('fr-FR')}</p></div><button data-restore-property="${i}">Restaurer le bien</button></div>`).join('')||'<p>Votre corbeille est vide.</p>';container.querySelectorAll('[data-restore-property]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const p=result.properties[Number(button.dataset.restoreProperty)];await call('removal',{slug:p.slug,removed:false,baseline:p});await refresh();render();notify('Bien restauré. Le même dossier revient dans l’app.');}catch(error){notify(error.message);button.disabled=false;}});}catch(error){if(container?.isConnected)container.textContent=error.message;}}
async function removeSelectedProperty(){if(dirty){notify('Enregistrez ou annulez vos modifications avant de retirer le dossier.');return;}if(!confirm('Mettre ce bien à la corbeille ? Vous pourrez le restaurer.'))return;try{await call('removal',{slug:selected.slug,removed:true,baseline:selected});await refresh();go('properties');notify('Bien retiré de l’app et du web. Vous pouvez le restaurer depuis la corbeille.');}catch(error){notify(error.message);}}
function go(next){page=next;selected=null;shell();render();}
function bindOpen(){root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{selected=structuredClone(props.find(p=>p.slug===b.dataset.open));editingBaseline=structuredClone(selected);creationKey=null;creationBaseline=null;tab=page==='studio'?'Studio IA':'Informations';dirty=false;shell();editor();});}
function newProperty(){if(authSession?.role==='viewer'){notify('Votre accès permet uniquement la consultation.');return;}if(dirty&&!confirm('Quitter sans enregistrer les modifications ?'))return;editingBaseline=null;creationKey=crypto.randomUUID();creationBaseline=null;selected={title:'Nouveau bien',location:'',description:'',features:[],rooms:[],privacy:'Unlisted',status:'Draft',credits:5,brandingMode:'workspace',...commonBranding()};tab=page==='studio'?'Studio IA':'Informations';dirty=false;shell();editor();}
function collect(){const form=document.querySelector('#editor-form');if(!form)return;const values=Object.fromEntries(new FormData(form));for(const [k,v] of Object.entries(values)){if(k.includes('.')){const [group,field]=k.split('.');selected[group]||={};if(v)selected[group][field]=v;else delete selected[group][field];}else if(k==='features')selected.features=v.split('\n').filter(Boolean);else if(['price','surface','roomsCount','bedrooms','credits','bathrooms','floor','totalFloors','landArea','charges','propertyTax','constructionYear'].includes(k)){if(v!=='')selected[k]=Number(v);else delete selected[k];}else selected[k]=v;}}
function editor(){const content=document.querySelector('#agent-content');const tabs=['Informations','Photos','Studio IA','Plans & 3D','Vidéo & 360°','Données app','Diffusion'];content.innerHTML=`<div class="editor-topline"><button id="back-properties">← Mes biens</button><span class="editor-status">${names[selected.status]}</span></div><div class="editor-heading"><div><div class="agent-kicker">ÉDITEUR DU BIEN</div><h1>${esc(selected.title)}</h1><p>${esc(selected.location||'Renseignez les informations et préparez vos contenus.')}</p></div><div class="editor-buttons">${selected.slug?'<button id="delete-property">Mettre à la corbeille</button>':''}<span id="save-state" role="status" aria-live="polite">${dirty?'Modifications non enregistrées':'Votre espace de création'}</span><button id="save-draft">Enregistrer</button><button id="publish-property" class="agent-primary">Partager au client ↗</button></div></div><div class="editor-tabs">${tabs.map(t=>`<button data-editor-tab="${t}" class="${tab===t?'selected':''}">${t}${t==='Photos'?'<span>'+selected.rooms.reduce((n,r)=>n+r.photos.length,0)+'</span>':''}</button>`).join('')}</div><div id="editor-body"></div>`;document.querySelector('#back-properties').onclick=()=>{if(dirty&&!confirm('Quitter sans enregistrer ?'))return;dirty=false;go('properties');};content.querySelectorAll('[data-editor-tab]').forEach(b=>b.onclick=()=>{collect();tab=b.dataset.editorTab;editorBody();content.querySelectorAll('[data-editor-tab]').forEach(x=>x.classList.toggle('selected',x===b));});document.querySelector('#delete-property')?.addEventListener('click',removeSelectedProperty);document.querySelector('#save-draft').onclick=()=>save(false);document.querySelector('#publish-property').onclick=()=>save(true);editorBody();}
function editorBody(){const body=document.querySelector('#editor-body');
if(tab==='Informations'){body.innerHTML=`<div class="editor-layout"><form id="editor-form" class="agent-panel editor-form"><div class="panel-heading"><h2>L’essentiel du bien</h2><p>Des informations précises pour une présentation complète.</p></div><label class="wide">Nom du bien<input name="title" required value="${esc(selected.title)}"></label>${[['listingType','Type de bien',['Appartement','Maison','Terrain','Bureau','Commerce','Immeuble','Autre']],['transaction','Transaction',['Vente','Location']]].map(([id,label,values])=>`<label>${label}<select name="${id}"><option value="">Choisir</option>${values.map(value=>`<option ${selected[id]===value?'selected':''}>${value}</option>`).join('')}</select></label>`).join('')}${[['address','Adresse du bien'],['city','Ville'],['postalCode','Code postal']].map(([id,label])=>`<label>${label}<input name="${id}" value="${esc(selected[id]||'')}"></label>`).join('')}<label class="wide">Adresse / quartier<input name="location" value="${esc(selected.location)}" placeholder="Adresse ou quartier à afficher"></label>${[['price','Prix (€)'],['surface','Surface (m²)'],['roomsCount','Pièces'],['bedrooms','Chambres'],['bathrooms','Salles de bain'],['floor','Étage'],['totalFloors','Nombre d’étages'],['landArea','Terrain (m²)']].map(([id,label])=>`<label>${label}<input name="${id}" type="number" min="${id==='floor'?-20:0}" step="${['roomsCount','bedrooms','bathrooms','floor','totalFloors'].includes(id)?1:'any'}" value="${selected[id]??''}"></label>`).join('')}<div class="panel-heading secondary-heading"><h2>Caractéristiques & prestations</h2><p>Renseignez uniquement les informations connues.</p></div>${[['condition','État',['À rénover','Bon état','Très bon état','Neuf']],['heating','Chauffage',['Non renseigné','Individuel','Collectif']],['orientation','Orientation',['Non renseignée','Nord','Sud','Est','Ouest','Traversant']]].map(([id,label,values])=>`<label>${label}<select name="${id}"><option value="">Choisir</option>${values.map(value=>`<option ${selected[id]===value?'selected':''}>${value}</option>`).join('')}</select></label>`).join('')}<label>Année de construction<input name="constructionYear" type="number" min="0" value="${selected.constructionYear??''}"></label><label>Charges annuelles (€)<input name="charges" type="number" min="0" value="${selected.charges??''}"></label><label>Taxe foncière (€)<input name="propertyTax" type="number" min="0" value="${selected.propertyTax??''}"></label><label class="wide">Référence du mandat<input name="reference" value="${esc(selected.reference||'')}"></label><label class="wide">Description<textarea name="description" placeholder="Racontez ce qui rend ce bien unique…">${esc(selected.description)}</textarea></label><label class="wide">Équipements & caractéristiques<textarea name="features" placeholder="Ascenseur&#10;Balcon&#10;Parking">${esc((selected.features||[]).join('\n'))}</textarea></label><label>DPE<select name="dpe"><option value="">Non renseigné</option>${'ABCDEFG'.split('').map(x=>`<option ${selected.dpe===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Crédits IA<input name="credits" type="number" min="0" value="${selected.credits}"></label><div class="panel-heading secondary-heading"><h2>Agence & interlocuteur</h2><p>L’identité et les coordonnées présentées aux prospects de ce bien.</p></div><label class="wide">Identité du bien<select name="brandingMode" id="property-branding-mode"><option value="workspace" ${selected.brandingMode==='workspace'?'selected':''}>Identité partagée de l’agence</option><option value="custom" ${selected.brandingMode!=='workspace'?'selected':''}>Présentation personnalisée de ce bien</option></select></label>${[['agency.name','Nom de l’agence','text'],['agency.color','Couleur de marque','color'],['agency.logo','URL du logo','text'],['agency.email','Email agence','email'],['agency.phone','Téléphone agence','tel'],['agent.name','Nom complet de l’agent','text'],['agent.firstName','Prénom affiché','text'],['agent.email','Email de l’agent','email'],['agent.phone','Téléphone de l’agent','tel'],['agent.photo','URL du portrait','text']].map(([id,label,type])=>{const [group,field]=id.split('.');return `<label>${label}<input name="${id}" type="${type}" ${selected.brandingMode==='workspace'?'disabled':''} value="${esc(selected[group]?.[field]||(type==='color'?'#5262ea':''))}"></label>`;}).join('')}<label class="upload-button">Importer le logo<input type="file" accept="image/jpeg,image/png,image/webp" data-brand-upload="agency.logo" ${selected.brandingMode==='workspace'?'disabled':''}></label><label class="upload-button">Importer le portrait<input type="file" accept="image/jpeg,image/png,image/webp" data-brand-upload="agent.photo" ${selected.brandingMode==='workspace'?'disabled':''}></label></form><aside class="editor-sidecard"><div class="editor-preview">${selected.hero?`<img src="${esc(selected.hero)}" alt="">`:'<span>▧</span>'}</div><div><small>APERÇU DU BIEN</small><h3>${esc(selected.title)}</h3><p>${esc(selected.location||'Adresse à renseigner')}</p><hr><h4>Votre checklist</h4>${[['Informations du bien',!!selected.title],['Photos du logement',selected.rooms.some(r=>r.photos.length)],['Plan disponible',!!selected.floorplan],['Modèle 3D disponible',!!selected.model3d]].map(([label,ok])=>`<p class="checklist"><span class="${ok?'checked':''}">${ok?'✓':'○'}</span>${label}</p>`).join('')}</div></aside></div>`;document.querySelector('#property-branding-mode').onchange=()=>{collect();if(selected.brandingMode==='workspace')Object.assign(selected,commonBranding());dirty=true;editorBody();};body.querySelectorAll('[data-brand-upload]').forEach(input=>input.onchange=async()=>{input.disabled=true;try{const result=await upload(input.files[0]);const [group,field]=input.dataset.brandUpload.split('.');selected[group]||={};selected[group][field]=result.url;document.querySelector('#editor-form').elements[input.dataset.brandUpload].value=result.url;dirty=true;document.querySelector('#save-state').textContent='Modifications non enregistrées';notify('Image importée. Enregistrez le dossier pour la conserver.');}catch(error){notify(error.message);}finally{input.disabled=false;}});document.querySelector('#editor-form').oninput=()=>{dirty=true;document.querySelector('#save-state').textContent='Modifications non enregistrées';};}
if(tab==='Photos'){body.innerHTML=`<div class="agent-panel"><div class="panel-heading row-heading"><div><h2>Vos photos, votre première impression.</h2><p>Organisez les images par pièce et choisissez votre couverture.</p></div><button id="add-room" class="agent-primary">＋ Ajouter une pièce</button></div><div class="photo-library-toolbar"><span>Organisation des photos · sans crédit IA</span><div><button id="undo-photos" ${photoHistory().canUndo?'':'disabled'}>↶ Annuler</button><button id="redo-photos" ${photoHistory().canRedo?'':'disabled'}>↷ Rétablir</button></div></div><div id="rooms-editor">${selected.rooms.map((r,i)=>`<section class="room-editor" data-room-editor="${esc(r.id)}"><div class="room-editor-heading"><input data-room-name="${i}" value="${esc(r.name)}" aria-label="Nom de la pièce"><label class="upload-button">＋ Importer des photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload="${i}"></label><button data-remove-room="${i}" aria-label="Retirer la pièce">×</button></div><div class="editor-photo-grid">${r.photos.map((url,j)=>`<article><img src="${esc(selected.media?.[url]?.thumbnail||url)}" loading="lazy" alt="${esc(r.name)}"><div class="photo-primary-actions"><button data-cover="${i},${j}">${selected.hero===url?'★ Couverture':'☆ Couverture'}</button><button data-retouch="${i},${j}">Retoucher</button></div><details class="photo-organize"><summary>Organiser la photo</summary><div><button data-move="${i},${j}" ${j===0?'disabled':''} aria-label="Déplacer vers la gauche">←</button><button data-move-right="${i},${j}" ${j===r.photos.length-1?'disabled':''} aria-label="Déplacer vers la droite">→</button><button data-duplicate-photo="${i},${j}">Dupliquer</button><button data-remove-photo="${i},${j}" aria-label="Retirer cette photo">Retirer</button><label>Déplacer vers une pièce<select data-photo-room="${i},${j}" ${selected.rooms.length<2?'disabled':''}><option value="">Choisir une pièce</option>${selected.rooms.filter(target=>target.id!==r.id).map(target=>`<option value="${esc(target.id)}">${esc(target.name)}</option>`).join('')}</select></label></div></details></article>`).join('')||'<div class="photo-drop-empty">Vos photos trouveront leur place ici.</div>'}</div></section>`).join('')||'<div class="table-empty">Ajoutez une pièce pour importer vos premières photos.</div>'}</div></div>`;for(const [id,action] of [['undo-photos','undo'],['redo-photos','redo']])document.querySelector('#'+id).onclick=()=>{if(photoHistory()[action]()){photoChanged();editorBody();}};document.querySelector('#add-room').onclick=()=>{selected.rooms.push({id:'room-'+crypto.randomUUID(),name:'Nouvelle pièce',photos:[]});dirty=true;editorBody();};body.querySelectorAll('[data-room-name]').forEach(input=>input.oninput=()=>{selected.rooms[+input.dataset.roomName].name=input.value;dirty=true;});body.querySelectorAll('[data-remove-room]').forEach(button=>button.onclick=()=>{if(confirm('Retirer cette pièce et ses photos du bien ?')){const [removed]=selected.rooms.splice(+button.dataset.removeRoom,1);if(selected.floorplan?.zones)selected.floorplan.zones=selected.floorplan.zones.filter(z=>z.room!==removed.id);if(selected.scans)selected.scans=selected.scans.filter(s=>s.room!==removed.id);if(selected.roomplan){selected.roomplan.rooms=selected.roomplan.rooms.filter(s=>s.room!==removed.id);if(!selected.roomplan.rooms.length)delete selected.roomplan;}if(removed.photos.includes(selected.hero)&&!selected.rooms.some(r=>r.photos.includes(selected.hero)))selected.hero=selected.rooms.flatMap(r=>r.photos)[0]||'';photoHistory().clear();dirty=true;editorBody();}});body.querySelectorAll('[data-retouch]').forEach(button=>button.onclick=()=>{const [i,j]=button.dataset.retouch.split(',').map(Number);retouchPhoto(i,j);});for(const attribute of ['cover','move','moveRight','removePhoto','duplicatePhoto'])body.querySelectorAll('[data-'+attribute.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']').forEach(button=>button.onclick=()=>{const [i,j]=button.dataset[attribute].split(',').map(Number);changePhotos(state=>{const photos=state.rooms[i].photos,url=photos[j];if(attribute==='cover')state.hero=url;if(attribute==='move'&&j>0)[photos[j-1],photos[j]]=[photos[j],photos[j-1]];if(attribute==='moveRight'&&j<photos.length-1)[photos[j+1],photos[j]]=[photos[j],photos[j+1]];if(attribute==='duplicatePhoto')photos.splice(j+1,0,url);if(attribute==='removePhoto'){photos.splice(j,1);if(state.hero===url&&!state.rooms.some(r=>r.photos.includes(url)))state.hero=state.rooms.flatMap(r=>r.photos)[0]||'';}});});body.querySelectorAll('[data-photo-room]').forEach(input=>input.onchange=()=>{const [i,j]=input.dataset.photoRoom.split(',').map(Number),target=input.value;if(!target)return;changePhotos(state=>{const destination=state.rooms.find(r=>r.id===target);if(!destination)throw Error('Cette pièce n’est plus disponible.');destination.photos.push(state.rooms[i].photos.splice(j,1)[0]);});input.value='';});body.querySelectorAll('[data-upload]').forEach(input=>input.onchange=async()=>{
 const property=selected,room=property.rooms[Number(input.dataset.upload)],files=[...input.files];input.disabled=true;
 try{
  await mediaTask(async()=>{for(const file of files){if(room.photos.length>=100)throw Error('Une pièce peut contenir au maximum 100 photos.');const uploaded=await upload(file);photoHistory(property).change(state=>{state.rooms.find(r=>r.id===room.id).photos.push(uploaded.url);if(!state.hero)state.hero=uploaded.url;});dirty=true;}});
  notify('Photos importées. Enregistrez votre bien pour les conserver dans le dossier.');
 }catch(error){notify(error.message);}
 finally{input.disabled=false;if(selected===property)editorBody();}
});}
if(tab==='Photos'&&roomToFocus){body.querySelector('[data-room-editor="'+CSS.escape(roomToFocus)+'"]')?.scrollIntoView();roomToFocus=null;}
if(tab==='Studio IA'){const all=selected.rooms.flatMap(r=>r.photos.map(url=>({room:r.id,name:r.name,url})));studioPhoto=all.find(p=>p.url===studioPhoto?.url&&p.room===studioPhoto?.room)||all[0];body.innerHTML=`<div class="agent-panel"><div class="panel-heading"><h2>Révélez le potentiel de vos pièces.</h2><p>Une vraie transformation à partir de votre photo originale.</p></div>${studioPhoto?`<div class="agent-studio-layout"><div><div id="agent-compare" class="agent-compare"><img src="${esc(studioPhoto.url)}" alt="Photo originale"></div><div class="agent-studio-thumbnails">${all.map((photo,i)=>`<button data-studio-photo="${i}" class="${photo.url===studioPhoto.url?'selected':''}"><img src="${esc(photo.url)}" alt="${esc(photo.name)}"><span>${esc(photo.name)}</span></button>`).join('')}</div></div><form id="agent-generate-form"></form></div><div id="agent-variants" class="editor-photo-grid"></div>`:'<p>Importez les photos de vos pièces avant de lancer une transformation.</p>'}</div>`;body.querySelectorAll('[data-studio-photo]').forEach(button=>button.onclick=()=>{studioPhoto=all[+button.dataset.studioPhoto];editorBody();});if(studioPhoto){
 const photo={...studioPhoto},property=selected;
 const parent=agentVariants.find(v=>v.id===studioParentId&&v.slug===property.slug&&v.room===photo.room&&v.original===photo.url&&!v.deletedAt);
 if(!parent)studioParentId=null;
 const source=parent?{parentVariantId:parent.id}:{},draftKey=(property.slug||creationKey)+'/'+photo.room+'/'+photo.url+'/'+(parent?.id||'original');
 const context=document.createElement('div');context.className='studio-source-context';context.textContent=parent?'Transformer la version « '+parent.label+' »':'Transformer la photo originale';document.querySelector('#agent-compare').before(context);
 if(parent)showComparison(parent);else studioComparisonId=null;
 if(!studioDrafts.has(draftKey))studioDrafts.set(draftKey,{});
 const form=document.querySelector('#agent-generate-form');
 window.PropertyTwinStudioForm({form,draft:studioDrafts.get(draftKey),onUpload:async file=>{
  if(!property.slug||dirty||selected!==property)throw Error('Enregistrez le bien et ses photos avant d’importer une inspiration.');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choisissez une image PNG, JPEG ou WebP.');
  return upload(file);
 },onGenerate:payload=>generateAgentPhoto({...payload,...source,slug:property.slug,room:photo.room,photo:photo.url,async:true},photo,property.title),onErase:()=>{
  if(!property.slug||dirty){notify('Enregistrez le bien et ses photos avant de sélectionner un objet.');return;}
  if(!(parent?.image||photo.url).startsWith('/media/')&&!(parent?.image||'').startsWith('data:image/')){notify('Importez cette photo dans le dossier avant de sélectionner un objet.');return;}
  if(generationJobs.has(property.slug)){notify('Une transformation est déjà en cours pour ce bien.');return;}
  window.PropertyTwinMaskEditor({photo:{...photo,url:parent?.image||photo.url},onSubmit:(mask,prompt,onAccepted)=>generateAgentPhoto({...source,slug:property.slug,room:photo.room,photo:photo.url,action:'Supprimer un objet',prompt:prompt||'Supprimer l’objet sélectionné',mask,async:true},photo,property.title,onAccepted)});
 }});
 form.querySelector('[data-studio-credits]').textContent=property.credits;renderGenerationStatus();
 const variantView=selected.slug,variantKey=key;call('variants').then(variants=>{if(key!==variantKey)return;mergeAgentVariants(variants);if(selected?.slug===variantView&&tab==='Studio IA')renderAgentVariants();}).catch(error=>{if(key===variantKey&&selected?.slug===variantView&&tab==='Studio IA')notify(error.message);});}}
if(tab==='Plans & 3D'){body.innerHTML=`<div class="asset-panels">${[['plan','Plan 2D','Un vrai plan pour comprendre les espaces.',selected.floorplan?.image],['model','Modèle 3D','Importez votre export GLB ou USDZ, ou renseignez une URL GLB/GLTF.',typeof selected.model3d==='string'?selected.model3d:selected.model3d?.src]].map(([id,title,desc,url])=>`<article class="agent-panel"><span class="asset-icon">${id==='plan'?'▤':'◇'}</span><h2>${title}</h2><p>${desc}</p>${id==='plan'&&url?`<div class="plan-zone-canvas" id="plan-zone-canvas"><img src="${esc(url)}" alt="Plan du logement" draggable="false"><div id="plan-zone-overlays"></div></div>`:''}<label>URL du fichier<input data-asset="${id}" value="${esc(url||'')}" placeholder="https://…"></label>${id==='plan'?'<label class="upload-button">Importer le plan<input id="upload-plan" type="file" accept="image/png,image/jpeg,image/webp"></label>':'<label class="upload-button">Importer un modèle 3D<input id="upload-model" type="file" accept=".glb,.usdz,model/gltf-binary,model/vnd.usdz+zip"></label>'}</article>`).join('')}</div>`+`<div class="agent-panel roomplan-panel"><h2>Vue RoomPlan</h2><p>Consultez les structures scannées sur iPhone, pièce par pièce.</p><label class="upload-button">Importer les structures RoomPlan<input id="upload-roomplan" type="file" accept=".json,application/json"></label><p id="roomplan-import-status" role="status"></p><div id="agent-roomplan"></div></div>`;const roomplanRoot=document.querySelector('#agent-roomplan');if(selected.slug)window.PropertyTwinRoomplan({root:roomplanRoot,load:()=>call('roomplan?slug='+encodeURIComponent(selected.slug)),onRoom:id=>{roomToFocus=id;studioPhoto=selected.rooms.flatMap(r=>r.photos.map(url=>({room:r.id,name:r.name,url}))).find(photo=>photo.room===id);tab='Photos';editor();}});else roomplanRoot.textContent='Enregistrez le bien avant de recevoir son RoomPlan.';document.querySelector('#upload-roomplan').onchange=async e=>{const property=selected,input=e.target,file=input.files[0];if(!file)return;input.disabled=true;try{if(!property.slug||dirty)throw Error('Enregistrez le dossier avant d’importer son RoomPlan.');if(file.size>8000000)throw Error('Export trop volumineux : 8 Mo maximum.');const asset=JSON.parse(await file.text());await mediaTask(async()=>{const result=await call('roomplan?slug='+encodeURIComponent(property.slug),{roomplan:asset,baseline:property.roomplan??null});Object.assign(property,result.property);editingBaseline=structuredClone(property);});await refresh();editorBody();notify('RoomPlan importé. La structure reçue est conservée.');}catch(error){document.querySelector('#roomplan-import-status').textContent=error.message||'Export invalide.';}finally{input.disabled=false;}};body.querySelectorAll('[data-asset]').forEach(input=>input.onchange=()=>{if(input.dataset.asset==='plan'){if(input.value)selected.floorplan={...(selected.floorplan||{}),image:input.value};else delete selected.floorplan;}else{if(input.value)selected.model3d=typeof selected.model3d==='object'?{...selected.model3d,src:input.value}:input.value;else delete selected.model3d;}dirty=true;});if(selected.floorplan?.image)bindPlanZones();document.querySelector('#upload-model').onchange=async e=>{const input=e.target;input.disabled=true;try{const file=input.files[0];const ext=file?.name.toLowerCase().split('.').at(-1);if(!['glb','usdz'].includes(ext))throw Error('Choisissez un fichier GLB ou USDZ.');const model=await upload(file,{type:ext==='glb'?'model/gltf-binary':'model/vnd.usdz+zip',limit:50000000});selected.model3d=model.url;dirty=true;editorBody();notify('Modèle importé. Enregistrez le dossier pour le conserver.');}catch(error){notify(error.message);input.disabled=false;}};document.querySelector('#upload-plan').onchange=async e=>{try{const image=await upload(e.target.files[0]);selected.floorplan={image:image.url};dirty=true;editorBody();}catch(e){notify(e.message);}};}
if(tab==='Vidéo & 360°'){body.innerHTML=`<div class="agent-panel"><div class="panel-heading"><h2>Vos contenus immersifs</h2><p>Centralisez les vidéos et liens de visites existantes dans le dossier du bien.</p></div><form id="immersive-form" class="editor-form"><label class="wide">Vidéo du bien (URL HTTPS)<input name="videoURL" value="${esc(selected.videoURL||'')}" placeholder="https://…"></label><label class="wide">Visite 360° / Matterport (URL HTTPS)<input name="tourURL" value="${esc(selected.tourURL||'')}" placeholder="https://…"></label><label class="wide">Documents (une URL HTTPS par ligne)<textarea name="documents">${esc((selected.documents||[]).join('\n'))}</textarea></label><button class="agent-primary">Ajouter au dossier</button></form><p class="muted">La création vidéo IA, la capture HDR et les sessions guidées nécessitent leurs moteurs dédiés. Les liens existants peuvent être gérés ici.</p></div>`;document.querySelector('#immersive-form').onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));selected.videoURL=values.videoURL;selected.tourURL=values.tourURL;selected.documents=values.documents.split('\n').filter(Boolean);dirty=true;notify('Contenus ajoutés. Enregistrez le dossier du bien.');};}
if(tab==='Données app'){body.innerHTML='<div class="agent-panel"><h2>Données du dossier synchronisées</h2><div id="business-records">Chargement…</div></div>';loadBusinessRecords();}
if(tab==='Diffusion'){body.innerHTML=`<div class="agent-panel"><div class="panel-heading"><h2>Préparez la prochaine conversation.</h2><p>Un lien par bien, et des liens personnels pour vos prospects.</p></div><label>Visibilité<select id="property-privacy">${[['Unlisted','Accessible par lien · non indexé'],['Public','Public'],['Private','Coordonnées requises']].map(([value,label])=>`<option value="${value}" ${selected.privacy===value?'selected':''}>${label}</option>`).join('')}</select></label><label id="indexable-control" ${selected.privacy==='Public'?'':'hidden'}><span><input id="property-indexable" type="checkbox" ${selected.indexable?'checked':''}> Autoriser les moteurs de recherche à indexer ce bien</span></label>${selected.slug?`<div class="editor-buttons"><button id="return-draft" type="button" ${selected.status==='Draft'?'disabled':''}>Remettre en brouillon</button><button id="archive-property" type="button" ${selected.status==='Archived'?'disabled':''}>Archiver le bien</button></div>`:''}${selected.slug&&['Published','Unlisted'].includes(selected.status)?`<div class="share-link-box"><code>${esc(location.origin+'/p/'+selected.slug)}</code><button id="copy-property-link">Copier</button><a class="agent-primary" target="_blank" href="/p/${esc(selected.slug)}">Aperçu du mini-site ↗</a></div><div id="property-qr" class="property-qr" aria-live="polite"></div><form id="client-link-form" class="editor-form"><label>Nom du prospect<input name="name" required></label><label>Canal de diffusion<select name="channel">${Object.entries(channelNames).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>Email<input name="email" type="email"></label><label>Téléphone<input name="phone" type="tel"></label><button class="agent-primary">Créer un lien personnalisé</button></form><div id="client-link-result"></div>`:'<p>Enregistrez puis publiez le bien pour activer sa diffusion.</p>'}</div>`;document.querySelector('#return-draft')?.addEventListener('click',()=>changePublicationState('Draft'));document.querySelector('#archive-property')?.addEventListener('click',()=>changePublicationState('Archived'));if(document.querySelector('#property-qr'))renderPropertyQR(selected.slug);document.querySelector('#property-privacy').onchange=e=>{selected.privacy=e.target.value;if(selected.privacy!=='Public'){selected.indexable=false;document.querySelector('#property-indexable').checked=false;}document.querySelector('#indexable-control').hidden=selected.privacy!=='Public';dirty=true;};document.querySelector('#property-indexable').onchange=e=>{selected.indexable=e.target.checked;dirty=true;};document.querySelector('#copy-property-link')?.addEventListener('click',()=>navigator.clipboard.writeText(location.origin+'/p/'+selected.slug).then(()=>notify('Lien copié.')));document.querySelector('#client-link-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const b=await call('link',{slug:selected.slug,...Object.fromEntries(new FormData(e.target))});const url=location.origin+b.url;showClientShare(url,Object.fromEntries(new FormData(e.target)));}catch(error){notify(error.message);}});}
}
async function generateAgentPhoto(payload,photo,title,onAccepted=()=>{}){
 const slug=payload.slug,credential=key;
 if(!slug||(selected?.slug===slug&&dirty)){const error=Error('Enregistrez le bien et ses photos avant de générer.');notify(error.message);throw error;}
 if(generationJobs.has(slug)){const error=Error('Une transformation est déjà en cours pour ce bien.');notify(error.message);throw error;}
 const job={photo,title};let accepted=false;generationJobs.set(slug,job);generationErrors.delete(slug);renderGenerationStatus();
 try{
  const signature=JSON.stringify(payload);let pending=generationKeys.get(slug);
  if(pending?.signature!==signature){pending={signature,key:window.PropertyTwinAIJobs.key()};generationKeys.set(slug,pending);}
  const initial=await call('generate',{...payload,idempotencyKey:pending.key});accepted=true;onAccepted();
  const v=await window.PropertyTwinAIJobs.wait(initial,id=>call('jobs?id='+encodeURIComponent(id)),{alive:()=>dashboardAlive&&key===credential,onState:state=>{if(key===credential)applyGenerationCredits(state.slug,state.credits);}});
  generationKeys.delete(slug);if(key!==credential)return;
  if(v.slug!==slug||v.room!==photo.room||v.original!==photo.url||(v.parentVariantId||null)!==(payload.parentVariantId||null))throw Error('Le résultat reçu ne correspond pas à la photo sélectionnée.');
  mergeAgentVariants([v]);applyGenerationCredits(slug,v.credits);
  if(selected?.slug===slug&&tab==='Studio IA'){if(studioPhoto?.url===photo.url&&studioPhoto.room===photo.room)showComparison(v);renderAgentVariants();}
  notify((payload.quality==='hd'?'Rendu HD créé pour ':'Transformation créée pour ')+title+'.');
 }catch(error){
  if(error.jobTerminal||error.status&&error.status<500)generationKeys.delete(slug);
  if(key===credential){generationErrors.set(slug,error.message);if(selected?.slug!==slug||tab!=='Studio IA')notify('Transformation non aboutie pour '+title+' : '+error.message);}
  if(!accepted)throw error;
 }finally{if(generationJobs.get(slug)===job)generationJobs.delete(slug);if(key===credential&&selected?.slug===slug&&tab==='Studio IA'){renderGenerationStatus();renderAgentVariants();}}
}
function restoreGenerationJobs(incoming){
 for(const remote of incoming){
  if(!['queued','processing'].includes(remote.status)||generationJobs.has(remote.slug))continue;
  const property=props.find(p=>p.slug===remote.slug);if(!property)continue;
  const job={photo:{room:remote.room,url:remote.original,name:property.rooms.find(r=>r.id===remote.room)?.name||'la pièce'},title:property.title};
  generationJobs.set(remote.slug,job);trackRestoredGeneration(remote,job,key);
 }
}
async function trackRestoredGeneration(remote,job,credential){
 try{
  const variant=await window.PropertyTwinAIJobs.wait({job:remote},id=>call('jobs?id='+encodeURIComponent(id)),{alive:()=>dashboardAlive&&key===credential,onState:state=>{if(key===credential)applyGenerationCredits(state.slug,state.credits);}});
  if(key!==credential)return;
  if(variant.slug!==remote.slug||variant.room!==remote.room||variant.original!==remote.original)throw Error('Résultat de transformation invalide.');
  mergeAgentVariants([variant]);applyGenerationCredits(remote.slug,variant.credits);
  if(selected?.slug===remote.slug&&tab==='Studio IA')renderAgentVariants();
  notify('Transformation prête pour '+job.title+'.');
 }catch(error){if(key===credential){generationErrors.set(remote.slug,error.message);notify(error.message);}}
 finally{if(generationJobs.get(remote.slug)===job)generationJobs.delete(remote.slug);if(key===credential){renderGenerationStatus();renderAgentVariants();}}
}
function mergeAgentVariants(incoming){const variants=new Map(agentVariants.map(v=>[v.id,v]));for(const v of incoming)variants.set(v.id,v);agentVariants=[...variants.values()];}
function renderGenerationStatus(){
 const form=document.querySelector('#agent-generate-form');if(!form||!selected)return;
 for(const hdButton of document.querySelectorAll('[data-variant-hd]'))hdButton.disabled=generationJobs.has(selected.slug)||hdButton.dataset.hdEligible!=='true';
 const job=generationJobs.get(selected.slug),button=form.querySelector('[data-generate]');button.disabled=Boolean(job);const maskButton=form.querySelector('#magic-eraser');if(maskButton)maskButton.disabled=Boolean(job);button.textContent=job?'Transformation en cours…':'Générer la transformation ✧';
 document.querySelector('#agent-ai-message').textContent=job?'Transformation de '+job.photo.name+' en cours. Vous pouvez continuer à naviguer.':generationErrors.get(selected.slug)||'';
}
function applyGenerationCredits(slug,credits){
 if(!Number.isInteger(credits)||credits<0)return;
 const cached=props.find(p=>p.slug===slug);if(cached)cached.credits=credits;
 if(selected?.slug!==slug)return;
 const input=document.querySelector('#editor-form [name="credits"]'),current=input?Number(input.value):selected.credits;
 if(current===(editingBaseline?.credits??selected.credits)){
  selected.credits=credits;if(editingBaseline)editingBaseline.credits=credits;if(input)input.value=credits;
 }
 const label=document.querySelector('#agent-generate-form [data-studio-credits]');if(label)label.textContent=selected.credits;
}

function showComparison(variant){if(!variant||variant.deletedAt)return;studioComparisonId=variant.id;const target=document.querySelector('#agent-compare');if(!target)return;target.innerHTML=`<img src="${esc(variant.original)}" alt="Avant"><img class="agent-after" src="${esc(variant.image)}" alt="Transformation"><input type="range" min="0" max="100" value="50" aria-label="Comparer avant après"><span class="compare-before-label">Avant</span><span class="compare-after-label">Après</span>`;target.querySelector('input').oninput=e=>target.querySelector('.agent-after').style.clipPath=`inset(0 ${100-e.target.value}% 0 0)`;}
function renderAgentVariants(){
 const target=document.querySelector('#agent-variants');if(!target||!studioPhoto||!selected)return;
 const property=selected,credential=key;
 const hdPrice=aiConfig.prices?.hd;
 window.PropertyTwinVariantHistory({root:target,variants:agentVariants.filter(v=>v.slug===property.slug),photo:studioPhoto,photos:property.rooms.flatMap(r=>r.photos.map(url=>({room:r.id,name:r.name,url}))),sourceId:studioParentId,hd:{enabled:aiConfig.hdRendering===true&&Number.isInteger(hdPrice)&&hdPrice>0,credits:hdPrice,balance:property.credits,busy:generationJobs.has(property.slug)},onHD:variant=>{const photo=property.rooms.flatMap(r=>r.photos.map(url=>({room:r.id,name:r.name,url}))).find(photo=>photo.room===variant.room&&photo.url===variant.original);if(!photo)throw Error('La photo originale n’est plus disponible.');return generateAgentPhoto({slug:property.slug,room:photo.room,photo:photo.url,parentVariantId:variant.id,action:'Rendu HD',quality:'hd',async:true},photo,property.title);},onCompare:variant=>{if(studioPhoto.room!==variant.room||studioPhoto.url!==variant.original){studioPhoto=property.rooms.flatMap(r=>r.photos.map(url=>({room:r.id,name:r.name,url}))).find(photo=>photo.room===variant.room&&photo.url===variant.original);studioParentId=null;editorBody();}showComparison(variant);},
  onSource:variant=>{if(variant)studioPhoto=property.rooms.flatMap(r=>r.photos.map(url=>({room:r.id,name:r.name,url}))).find(photo=>photo.room===variant.room&&photo.url===variant.original);studioParentId=variant?.id||null;editorBody();},
  update:body=>call('variant',{...body,slug:property.slug}),
  onChange:variant=>{if(key!==credential)return;mergeAgentVariants([variant]);if(selected?.slug===property.slug&&tab==='Studio IA'){if(variant.deletedAt&&(studioParentId===variant.id||studioComparisonId===variant.id)||studioParentId===variant.id){if(variant.deletedAt)studioParentId=null;editorBody();}else renderAgentVariants();}},
  onReload:async()=>{const variants=await call('variants');if(key!==credential)return;mergeAgentVariants(variants);if(selected?.slug===property.slug&&tab==='Studio IA')editorBody();return variants;},notify});
}
async function loadBusinessRecords(){const container=document.querySelector('#business-records');if(!selected.slug){container.textContent='Enregistrez le dossier pour synchroniser ses données.';return;}try{const result=await call('records');if(!container.isConnected)return;const records=result.records.filter(r=>r.slug===selected.slug||['agency','profile'].includes(r.kind));const labels={firstName:'Prénom',lastName:'Nom',email:'Email',phone:'Téléphone',website:'Site de l’agence',address:'Adresse',brandHex:'Couleur de marque',title:'Nom de la variante',style:'Style',prompt:'Instruction',isFavorite:'Favorite',type:'Événement',event:'Interaction',timestamp:'Date',amount:'Montant proposé (€)',financing:'Financement',message:'Message',name:'Nom du mobilier',widthCM:'Largeur (cm)',depthCM:'Profondeur (cm)',heightCM:'Hauteur (cm)'};container.innerHTML=records.map((r,i)=>`<form class="editor-form business-record" data-business-record="${i}"><h3 class="wide">${({offer:'Intention d’offre',measurement:'Mesure de mobilier',variant:'Variante du studio',agency:'Coordonnées agence',profile:'Coordonnées du présentateur',event:'Activité enregistrée',interaction:'Interaction acheteur'})[r.kind]||'Donnée synchronisée'}</h3>${r.data.image?`<img class="plan-preview" src="${esc(r.data.image)}" alt="Variante du logement" loading="lazy">`:''}${Object.entries(r.data).filter(([key])=>labels[key]).map(([key,value])=>`<label>${labels[key]}${typeof value==='boolean'?`<select name="${key}"><option value="true" ${value?'selected':''}>Oui</option><option value="false" ${!value?'selected':''}>Non</option></select>`:`<input name="${key}" type="${typeof value==='number'?'number':'text'}" ${typeof value==='number'?'min="0" step="any"':''} value="${esc(value)}">`}</label>`).join('')}<button class="agent-primary">Enregistrer</button></form>`).join('')||'<p>Les offres et mesures enregistrées dans l’app apparaîtront ici automatiquement.</p>';container.querySelectorAll('form').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const record=records[Number(form.dataset.businessRecord)],patch=Object.fromEntries(new FormData(form));for(const key of Object.keys(patch))if(typeof record.data[key]==='number')patch[key]=Number(patch[key]);else if(typeof record.data[key]==='boolean')patch[key]=patch[key]==='true';try{await call('sync-record',{id:record.id,patch,baseline:record.data});notify('Données enregistrées et disponibles pour l’app.');loadBusinessRecords();}catch(error){notify(error.message);}});}catch(error){if(container.isConnected)container.textContent=error.message;}}
function bindPlanZones(){const canvas=document.querySelector('#plan-zone-canvas');if(!canvas)return;selected.floorplan.zones||=[];const controls=document.createElement('div');controls.className='plan-zone-controls';controls.innerHTML=`<label>Pièce à associer<select id="plan-zone-room">${selected.rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label><p>Tracez un rectangle sur le plan pour rendre une pièce cliquable.</p><div id="plan-zone-list"></div>`;canvas.after(controls);const overlays=canvas.querySelector('#plan-zone-overlays');function renderZones(){overlays.innerHTML=selected.floorplan.zones.map(z=>`<span style="left:${z.x}%;top:${z.y}%;width:${z.width}%;height:${z.height}%">${esc(selected.rooms.find(r=>r.id===z.room)?.name||'Pièce')}</span>`).join('');controls.querySelector('#plan-zone-list').innerHTML=selected.floorplan.zones.map((z,i)=>`<button type="button" data-remove-zone="${i}" aria-label="Retirer la zone ${esc(selected.rooms.find(r=>r.id===z.room)?.name||'Pièce')}">${esc(selected.rooms.find(r=>r.id===z.room)?.name||'Pièce')} ×</button>`).join('');controls.querySelectorAll('[data-remove-zone]').forEach(b=>b.onclick=()=>{selected.floorplan.zones.splice(Number(b.dataset.removeZone),1);dirty=true;renderZones();});}renderZones();let start,preview;const point=e=>{const rect=canvas.getBoundingClientRect();return {x:Math.min(100,Math.max(0,(e.clientX-rect.left)/rect.width*100)),y:Math.min(100,Math.max(0,(e.clientY-rect.top)/rect.height*100))};};canvas.onpointerdown=e=>{if(!selected.rooms.length||e.button!==0)return;e.preventDefault();start=point(e);canvas.setPointerCapture(e.pointerId);preview=document.createElement('span');overlays.append(preview);};canvas.onpointermove=e=>{if(!start)return;const end=point(e);Object.assign(preview.style,{left:Math.min(start.x,end.x)+'%',top:Math.min(start.y,end.y)+'%',width:Math.abs(end.x-start.x)+'%',height:Math.abs(end.y-start.y)+'%'});};canvas.onpointerup=e=>{if(!start)return;const end=point(e);const zone={room:controls.querySelector('#plan-zone-room').value,x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};if(zone.width>=1&&zone.height>=1){selected.floorplan.zones.push(zone);dirty=true;}start=null;renderZones();};canvas.onpointercancel=()=>{start=null;renderZones();};}
async function changePublicationState(status){if(dirty){notify('Enregistrez les modifications du dossier avant de changer son état.');return;}try{await call('status',{slug:selected.slug,status});selected.status=status;await refresh();shell();editor();notify(status==='Archived'?'Bien archivé. Son lien est désactivé.':'Bien remis en brouillon. Son lien est désactivé.');}catch(error){notify(error.message);}}
async function renderPropertyQR(slug){const container=document.querySelector('#property-qr');container.textContent='Préparation du QR code…';try{const result=await call('qr',{url:location.origin+'/p/'+slug+'?utm_source=qr'});if(!container.isConnected)return;container.innerHTML=`<img src="${esc(result.image)}" width="160" height="160" alt="QR code pour ouvrir ce bien"><div><h3>Prolongez la visite.</h3><p>À afficher lors du rendez-vous ou à joindre à votre dossier.</p><a class="agent-primary" href="${esc(result.image)}" download="propertytwin-${esc(slug)}.png">Télécharger le QR code</a>${['localhost','127.0.0.1'].includes(location.hostname)?'<p>Le lien local fonctionne sur cet ordinateur. Une URL publique sera nécessaire pour le scanner sur un téléphone.</p>':''}</div>`;}catch(error){if(container.isConnected)container.textContent=error.message;}}
function showClientShare(url,client){const result=document.querySelector('#client-link-result');const message=`Bonjour ${client.name},

Merci pour votre visite de ${selected.title}.
Vous pouvez retrouver ici les photos, le plan et imaginer différentes possibilités d’aménagement :

${url}

Bien à vous,
${selected.agent?.firstName||selected.agent?.name||'Votre agent'}`;result.innerHTML=`<label>Votre message après visite<textarea id="client-share-message" rows="9">${esc(message)}</textarea></label><div class="share-link-box"><code>${esc(url)}</code><button id="copy-client-link" type="button">Copier le lien</button><button id="copy-client-message" type="button">Copier le message</button></div><div class="lead-contact-actions"><a id="client-whatsapp" target="_blank" rel="noopener">WhatsApp ↗</a><a id="client-email">Email</a><a id="client-sms">SMS</a></div>`;const field=result.querySelector('#client-share-message');function update(){const text=encodeURIComponent(field.value);result.querySelector('#client-whatsapp').href='https://wa.me/'+String(client.phone||'').replace(/[^0-9]/g,'')+'?text='+text;result.querySelector('#client-email').href='mailto:'+encodeURIComponent(client.email||'')+'?subject='+encodeURIComponent(selected.title+' · Votre visite')+'&body='+text;result.querySelector('#client-sms').href='sms:'+encodeURIComponent(client.phone||'')+'?body='+text;}field.oninput=update;update();for(const [id,value] of [['copy-client-link',()=>url],['copy-client-message',()=>field.value]])result.querySelector('#'+id).onclick=()=>navigator.clipboard.writeText(value()).then(()=>notify('Copié.')).catch(()=>notify('La copie est indisponible. Sélectionnez le texte pour le copier.'));}
function retouchPhoto(roomIndex,photoIndex){
 if(!selected.slug||dirty){notify('Enregistrez le dossier avant de retoucher ses photos.');return;}
 const property=selected,room=property.rooms[roomIndex],url=room.photos[photoIndex];
 if(!/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$/.test(url)){notify('Importez cette photo dans le dossier pour la retoucher.');return;}
 const photos=property.rooms.flatMap(r=>r.photos.map(url=>({room:r.id,name:r.name,url,thumbnail:property.media?.[url]?.thumbnail,editable:/^\/media\//.test(url)})));
 window.PropertyTwinPhotoEditor({title:property.title,photos,initial:photos.findIndex(photo=>photo.room===room.id&&photo.url===url),onSave:async(photo,settings)=>{
  const target=property.rooms.find(r=>r.id===photo.room);if(target.photos.length>=100)throw Error('Une pièce peut contenir au maximum 100 photos.');
  await mediaTask(async()=>{const result=await call('photo-edit',{slug:property.slug,room:photo.room,photo:photo.url,...settings});photoHistory(property).change(state=>state.rooms.find(r=>r.id===photo.room).photos.push(result.url));dirty=true;});
  if(selected===property){photoChanged();editorBody();}notify('Nouvelle photo ajoutée. Enregistrez le dossier pour la conserver.');
 }});
}

async function upload(file,{type=file?.type,limit=8000000}={}){
 if(!file)throw Error('Choisissez un fichier.');if(file.size>limit)throw Error('Fichier trop volumineux : '+(limit/1000000)+' Mo maximum.');
 return mediaTask(async()=>{
  if(signedUploads&&selected){
   collect();
   if(!selected.slug){creationKey||=crypto.randomUUID();creationBaseline||=structuredClone(selected);const created=await call('sync',{clientKey:creationKey,patch:selected,baseline:{}});if(!created.property?.slug)throw Error('Enregistrez le dossier avant d’importer.');selected.slug=created.property.slug;editingBaseline=structuredClone(created.property);}
   let intents=uploadIntents.get(file);if(!intents){intents=new Map();uploadIntents.set(file,intents);}let intent=intents.get(selected.slug);if(!intent){intent=crypto.randomUUID();intents.set(selected.slug,intent);}
   let upload;try{upload=await call('upload-url',{slug:selected.slug,type,size:file.size,idempotencyKey:intent});}catch(error){if(error.status===410)intents.delete(selected.slug);throw error;}if(upload.status==='completed')return upload.result;
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
   try{const response=await fetch(upload.uploadURL,{method:'PUT',headers:upload.headers,body:file,credentials:'omit',signal:controller.signal});if(!response.ok&&response.status!==409)throw Error('L’import a été interrompu. Réessayez ce fichier.');}finally{clearTimeout(timer);}
   try{return await call('upload-complete',{slug:selected.slug,uploadId:upload.uploadId});}catch(error){if(error.status===410)intents.delete(selected.slug);throw error;}
  }
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});return call('upload',{type,base64});
 });
}
function propertyConflict(field,publish){
 const labels={title:'Nom du bien',location:'Adresse affichée',address:'Adresse',city:'Ville',postalCode:'Code postal',description:'Description',price:'Prix',surface:'Surface',roomsCount:'Nombre de pièces',floor:'Étage',rooms:'Photos et pièces',hero:'Photo principale',agency:'Identité de l’agence',agent:'Interlocuteur',credits:'Crédits IA',privacy:'Visibilité',indexable:'Indexation',floorplan:'Plan',model3d:'Modèle 3D',scans:'Scans',features:'Équipements',information:'Informations',listingType:'Type de bien',transaction:'Transaction',documents:'Documents',videoURL:'Vidéo',tourURL:'Visite 360°'};
 document.querySelector('#property-conflict')?.remove();
 const panel=document.createElement('div');panel.id='property-conflict';panel.className='workspace-conflict';panel.setAttribute('role','alert');
 panel.innerHTML=`<p>Le champ « ${esc(labels[field]||'Informations du bien')} » a changé sur le serveur pendant votre édition. Choisissez la valeur à conserver ; vos autres modifications restent en attente.</p><button data-property-choice="local">Conserver ma valeur web</button><button data-property-choice="server">Utiliser la valeur synchronisée</button>`;
 document.querySelector('#editor-body').before(panel);
 panel.querySelectorAll('button').forEach(button=>button.onclick=async()=>{
  panel.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   collect();const latest=(await call('properties')).find(p=>p.slug===selected.slug||creationKey&&p.syncKey===creationKey);if(!latest)throw Error('Le bien n’est plus disponible.');
   if(!selected.slug){selected.slug=latest.slug;editingBaseline=structuredClone(creationBaseline);}
   editingBaseline[field]=latest[field];
   if(button.dataset.propertyChoice==='server')selected[field]=latest[field];
   panel.remove();editorBody();await save(publish);
  }catch(error){notify(error.message);panel.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
}
async function save(publish){
 if(mediaJobs){notify('Attendez la fin du traitement des médias avant d’enregistrer.');return;}
 collect();const button=document.querySelector(publish?'#publish-property':'#save-draft');button.disabled=true;root.inert=true;const state=document.querySelector('#save-state');state.textContent='Enregistrement en cours…';
 try{
  let created=false;
  if(!selected.slug){
   creationKey||=crypto.randomUUID();creationBaseline||=structuredClone(selected);
   const existing=(await call('properties')).find(p=>p.syncKey===creationKey);
   if(existing){selected.slug=existing.slug;editingBaseline=structuredClone(creationBaseline);}
   else{creationBaseline=structuredClone(selected);const result=await call('sync',{clientKey:creationKey,patch:selected,baseline:{}});if(!result.property?.slug)throw Error('La création n’a pas retourné le dossier. Réessayez.');selected.slug=result.property.slug;editingBaseline=structuredClone(result.property);created=true;}
  }
  if(!created)await call('update',{slug:selected.slug,property:selected,baseline:editingBaseline});
  if(publish)await call('prepare-share',{slug:selected.slug});
  dirty=false;await refresh();selected=structuredClone(props.find(p=>p.slug===selected.slug));editingBaseline=structuredClone(selected);if(publish)tab='Diffusion';shell();editor();notify(publish?'Bien publié. Votre lien est disponible dans Diffusion.':'Dossier enregistré.');
 }catch(error){state.textContent='Enregistrement à reprendre';dirty=true;notify(error.status===409&&error.field?'Le bien a été modifié pendant votre édition. Choisissez la version à conserver.':error.message);button.disabled=false;if(error.status===409&&error.field)propertyConflict(error.field,publish);}
 finally{root.inert=false;}
}
let polling=false;
async function syncActivity(){if(polling||!key||!root.querySelector('.agent-shell')||selected||document.hidden||document.querySelector('dialog[open]')||root.contains(document.activeElement)&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;polling=true;const currentKey=key;try{const [fresh,freshProps,freshWorkspace]=await Promise.all([call('activity'),call('properties'),call('workspace')]);if(key!==currentKey)return;activity=fresh;props=freshProps;workspace=freshWorkspace.workspace||{};const badge=root.querySelector('[data-page="leads"] small');if(badge)badge.textContent=activity.leads.length;if(page!=='settings')render();}catch(error){notify('Actualisation momentanément indisponible : '+error.message);}finally{polling=false;}}
const activityTimer=setInterval(syncActivity,10000);window.addEventListener('pagehide',()=>{dashboardAlive=false;clearInterval(activityTimer);},{once:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncActivity();});
if(key){try{await refresh();shell();render();}catch(error){if(authSession)throw error;login();}}else login();
};

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
