import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function createAuth({env=process.env,fetcher=(...args)=>fetch(...args),onboard=async()=>{}}={}){
 const enabled=Boolean(env.SUPABASE_URL&&env.SUPABASE_ANON_KEY),production=env.NODE_ENV==='production';
 if(Boolean(env.SUPABASE_URL)!==Boolean(env.SUPABASE_ANON_KEY))throw Error('Configurez SUPABASE_URL et SUPABASE_ANON_KEY ensemble.');
 const configuredSecret=env.AUTH_COOKIE_SECRET;
 if(configuredSecret&&!/^[a-f0-9]{64}$/i.test(configuredSecret))throw Error('AUTH_COOKIE_SECRET doit contenir 64 caractères hexadécimaux.');
 if(production&&(!enabled||!configuredSecret||!env.PUBLIC_SITE_URL?.startsWith('https://')))throw Error('Production : configurez Supabase, PUBLIC_SITE_URL HTTPS et AUTH_COOKIE_SECRET.');
 const secret=configuredSecret?Buffer.from(configuredSecret,'hex'):randomBytes(32);
 let base;if(enabled){base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('SUPABASE_URL doit être une origine HTTPS.');}
 const refreshes=new Map(),attempts=new Map();
 const publicOrigin=()=>{try{return new URL(env.PUBLIC_SITE_URL).origin;}catch{fail(503,'Configurez PUBLIC_SITE_URL pour les emails de connexion.');}};
 function sameOrigin(req){
  const allowed=env.PUBLIC_SITE_URL?publicOrigin():'http://'+req.headers.host;
  if(req.headers.origin!==allowed)fail(403,'Cette action doit être effectuée depuis le site PropertyTwin.');
 }
 async function request(route,{method='GET',body,accessToken}={}){
  const response=await fetcher(new URL(route,base).href,{method,signal:AbortSignal.timeout(20000),headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+(accessToken||env.SUPABASE_ANON_KEY),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok){if(response.status===401||response.status===403)fail(401,'Votre session a expiré. Connectez-vous à nouveau.');if(response.status===429)fail(429,'Trop de tentatives. Réessayez plus tard.');fail(response.status>=500?503:400,'La demande n’a pas abouti. Vérifiez vos informations ou réessayez.');}
  return data;
 }
 function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
 function unseal(value){try{const data=Buffer.from(value,'base64url');if(data.length<29||data.length>4000)return null;const decipher=createDecipheriv('aes-256-gcm',secret,data.subarray(0,12));decipher.setAuthTag(data.subarray(-16));const result=JSON.parse(Buffer.concat([decipher.update(data.subarray(12,-16)),decipher.final()]).toString());return result.deadline>Date.now()?result:null;}catch{return null;}}
 function setCookie(res,value){
  const encoded=value?seal(value):'';
  if(encoded.length>3800)fail(502,'La session de connexion est trop volumineuse.');
  const secure=production||env.PUBLIC_SITE_URL?.startsWith('https://');
  res.setHeader('Set-Cookie',`pt_auth=${encoded}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${value?604800:0}${secure?'; Secure':''}`);
 }
 const pair=data=>{
  if(typeof data.access_token!=='string'||typeof data.refresh_token!=='string'||!Number.isFinite(data.expires_in))fail(502,'Réponse de connexion invalide.');
  return {access:data.access_token,refresh:data.refresh_token,expires:Date.now()+data.expires_in*1000,deadline:Date.now()+604800000};
 };
 async function principal(req,res){
  const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  let cookie;
  if(!bearer){const value=(req.headers.cookie||'').split(/;\s*/).find(v=>v.startsWith('pt_auth='))?.slice(8);cookie=value?unseal(value):null;if(!cookie)fail(401,'Connectez-vous à votre espace.');
   if(cookie.expires<Date.now()+30000){
    const key=createHash('sha256').update(cookie.refresh).digest('hex');
    if(!refreshes.has(key))refreshes.set(key,request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:cookie.refresh}}).finally(()=>refreshes.delete(key)));
    cookie={...cookie,...pair(await refreshes.get(key))};setCookie(res,cookie);
   }
  }
  const accessToken=bearer||cookie.access,user=await request('/auth/v1/user',{accessToken});
  if(!uuid.test(user.id||''))fail(401,'Session invalide.');
  const memberships=await request('/rest/v1/agency_members?select=agency_id,role,agencies(id,name)&user_id=eq.'+encodeURIComponent(user.id),{accessToken});
  if(!Array.isArray(memberships))fail(502,'Réponse agence invalide.');
  const valid=memberships.filter(m=>uuid.test(m.agency_id||'')&&['owner','admin','agent','viewer'].includes(m.role));
  const requested=bearer?req.headers['x-propertytwin-agency']:cookie?.agency;
  if(bearer&&requested&&!valid.some(m=>m.agency_id===requested))fail(403,'Vous n’appartenez pas à cette agence.');
  const selected=valid.find(m=>m.agency_id===requested)||valid[0];
  return {user:{id:user.id,email:user.email||''},memberships:valid,agency:selected?.agency_id,role:selected?.role,accessToken,cookie,bearer};
 }
 async function authorize(req,res){
  const identity=await principal(req,res);
  if(!identity.agency)fail(403,'Créez ou rejoignez une agence avant de poursuivre.');
  if(!['GET','HEAD'].includes(req.method)){if(!identity.bearer)sameOrigin(req);if(identity.role==='viewer')fail(403,'Votre rôle permet uniquement la consultation.');}
  return identity;
 }
 async function handle(req,res,url,readBody){
  const mobile=url.pathname.startsWith('/api/mobile/');
  if(!mobile&&!url.pathname.startsWith('/api/auth/'))return false;
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));return true;};
  const action=url.pathname.slice((mobile?'/api/mobile/':'/api/auth/').length);
  if(mobile&&!['login','refresh','me','logout'].includes(action))fail(404,'Route inconnue.');
  if(mobile&&!['login','refresh'].includes(action)&&!req.headers.authorization?.startsWith('Bearer '))fail(401,'Connectez-vous dans l’app.');
  if(action==='config'&&req.method==='GET')return send({enabled,local:!enabled&&!production});
  if(!enabled)fail(503,'Supabase n’est pas encore configuré. Le mode local reste disponible.');
  if(action==='me'&&req.method==='GET'){try{const identity=await principal(req,res);return send({user:identity.user,memberships:identity.memberships,agency:identity.agency,role:identity.role});}catch(error){if(error.status===401)return send({user:null},401);throw error;}}
  if(req.method!=='POST')fail(405,'Méthode non autorisée.');if(!mobile)sameOrigin(req);
  const b=await readBody(req);
  if(['login','signup','magic','recover','session','refresh'].includes(action)){
   const address=req.socket.remoteAddress||'local',now=Date.now(),entry=attempts.get(address);
   if(!entry||now-entry.start>900000)attempts.set(address,{start:now,count:1});else if(++entry.count>20)fail(429,'Trop de tentatives. Réessayez dans quelques minutes.');
   for(const [key,value] of attempts)if(now-value.start>900000)attempts.delete(key);
  }
  if(action==='logout'){
   try{const identity=await principal(req,res);await request('/auth/v1/logout',{method:'POST',accessToken:identity.accessToken});}catch(error){if(error.status!==401)throw error;}
   if(!mobile)setCookie(res,null);return send({ok:true});
  }
  if(mobile&&action==='refresh'){
   if(typeof b.refresh_token!=='string'||b.refresh_token.length>1000)fail(400,'Session invalide.');
   const result=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:b.refresh_token}});
   pair(result);return send({access_token:result.access_token,refresh_token:result.refresh_token,expires_in:result.expires_in});
  }
  if(['login','signup','magic','recover'].includes(action)){
   const email=typeof b.email==='string'?b.email.trim():'';
   if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)fail(400,'Indiquez une adresse email valide.');
   if(['login','signup'].includes(action)&&(typeof b.password!=='string'||b.password.length<(action==='signup'?12:1)||b.password.length>128))fail(400,'Le mot de passe doit contenir au moins 12 caractères.');
   if(action==='login'){
    const result=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:b.password}});pair(result);
    if(mobile)return send({access_token:result.access_token,refresh_token:result.refresh_token,expires_in:result.expires_in});
    setCookie(res,pair(result));return send({ok:true});
   }
   const redirect=encodeURIComponent(publicOrigin()+'/auth/callback');
   if(action==='signup'){const result=await request('/auth/v1/signup?redirect_to='+redirect,{method:'POST',body:{email,password:b.password}});if(result.access_token)setCookie(res,pair(result));return send({ok:true,confirmationRequired:!result.access_token});}
   await request('/auth/v1/'+(action==='magic'?'otp':'recover')+'?redirect_to='+redirect,{method:'POST',body:{email,...(action==='magic'?{create_user:false}:{})}});return send({ok:true});
  }
  if(action==='session'){
   if(typeof b.access_token!=='string'||typeof b.refresh_token!=='string'||b.access_token.length>3000||b.refresh_token.length>1000)fail(400,'Lien de connexion invalide.');
   await request('/auth/v1/user',{accessToken:b.access_token});
   // Refresh verifies the complete token pair; never trust an expiry supplied by the browser.
   const result=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:b.refresh_token}});
   const refreshed=await request('/auth/v1/user',{accessToken:result.access_token});
   const original=await request('/auth/v1/user',{accessToken:b.access_token});
   if(refreshed.id!==original.id)fail(401,'Lien de connexion invalide.');setCookie(res,pair(result));return send({ok:true});
  }
  if(action==='password'){if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)fail(400,'Choisissez un mot de passe de 12 caractères minimum.');const identity=await principal(req,res);await request('/auth/v1/user',{method:'PUT',accessToken:identity.accessToken,body:{password:b.password}});return send({ok:true});}
  if(action==='agency'){const identity=await principal(req,res);if(!identity.cookie)fail(400,'Cette action nécessite une session navigateur.');if(!identity.memberships.some(m=>m.agency_id===b.agency))fail(403,'Vous n’appartenez pas à cette agence.');setCookie(res,{...identity.cookie,agency:b.agency});return send({ok:true});}
  if(action==='onboard'){
   if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>200)fail(400,'Indiquez le nom de votre agence.');
   const identity=await principal(req,res);
   const id=await request('/rest/v1/rpc/create_agency',{method:'POST',accessToken:identity.accessToken,body:{agency_name:b.name.trim()}});
   if(!uuid.test(id||''))fail(502,'La création n’a pas retourné une agence valide.');
   await onboard(id,{name:b.name.trim()});
   if(identity.cookie)setCookie(res,{...identity.cookie,agency:id});return send({agency:id},201);
  }
  fail(404,'Route inconnue.');
 }
 return {enabled,handle,authorize};
}
