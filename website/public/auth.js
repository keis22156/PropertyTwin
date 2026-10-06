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
