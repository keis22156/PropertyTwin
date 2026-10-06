import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';

export function createLocalConnection({env=process.env,now=Date.now}={}){
 const pending=new Map(),attempts=new Map();
 const enabled=()=>env.NODE_ENV!=='production'&&!env.SUPABASE_URL&&Boolean(env.ADMIN_TOKEN);
 function origins(){
  const port=Number(env.PORT)||3000;
  return Object.values(networkInterfaces()).flat().filter(i=>i?.family==='IPv4'&&!i.internal).map(i=>`http://${i.address}:${port}`);
 }
 function create(){
  if(!enabled())throw Object.assign(Error('Utilisez votre session SaaS pour connecter l’app.'),{status:403});
  for(const [key,entry] of pending)if(entry.expires<=now())pending.delete(key);
  if(pending.size>=20)throw Object.assign(Error('Trop de connexions en attente. Réessayez dans cinq minutes.'),{status:429});
  const code=randomBytes(24).toString('base64url'),expires=now()+300000;
  pending.set(code,{expires});return {code,expiresAt:new Date(expires).toISOString(),origins:origins()};
 }
 function redeem(code,address){
  if(!enabled())throw Object.assign(Error('Connexion locale indisponible.'),{status:403});
  for(const [key,entry] of attempts)if(entry.deadline<=now())attempts.delete(key);
  const attempt=attempts.get(address)||{count:0,deadline:now()+60000};
  if(++attempt.count>10)throw Object.assign(Error('Trop de tentatives. Réessayez dans une minute.'),{status:429});
  if(attempts.size>=1000&&!attempts.has(address))throw Object.assign(Error('Réessayez dans une minute.'),{status:429});
  attempts.set(address,attempt);
  const entry=pending.get(code);
  if(!entry||entry.expires<=now())throw Object.assign(Error('Lien de connexion expiré ou déjà utilisé. Générez-en un nouveau depuis le dashboard.'),{status:401});
  pending.delete(code);
  return {token:env.ADMIN_TOKEN};
 }
 return {create,redeem};
}
