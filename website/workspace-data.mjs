import {mediaURL} from './property-data.mjs';

export const workspaceFields=['name','logo','color','email','phone','website','address','agentName','agentPhoto','agentEmail','agentPhone'];
export function validateWorkspacePatch(input){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Paramètres d’agence invalides.');
 const patch={};
 for(const [key,value] of Object.entries(input)){
  if(!workspaceFields.includes(key)||typeof value!=='string'||value.length>2048)fail('Paramètre invalide : '+key);
  const text=value.trim();
  if(['logo','agentPhoto'].includes(key)&&text&&(!mediaURL(text)||text.startsWith('/media/')&&!/\.(png|jpg|webp)$/.test(text)))fail('Le média doit utiliser une URL HTTPS ou un fichier importé.');
  if(key==='website'&&text){try{const url=new URL(text);if(url.protocol!=='https:'||url.username||url.password)fail('Adresse du site invalide.');}catch{fail('Adresse du site invalide.');}}
  if(key==='color'&&text&&!/^#[0-9a-f]{6}$/i.test(text))fail('Couleur de marque invalide.');
  if(['email','agentEmail'].includes(key)&&text&&!/^\S+@\S+\.\S+$/.test(text))fail('Adresse email invalide.');
  if(!['logo','agentPhoto','website'].includes(key)&&text.length>300)fail('Paramètre trop long : '+key);
  patch[key]=text;
 }
 return patch;
}

export function workspaceBranding(workspace){
 const agency={},agent={};
 for(const key of ['name','logo','color','email','phone','website','address'])if(workspace[key])agency[key]=workspace[key];
 for(const [source,target] of [['agentName','name'],['agentPhoto','photo'],['agentEmail','email'],['agentPhone','phone']])if(workspace[source])agent[target]=workspace[source];
 if(!agent.email&&workspace.email)agent.email=workspace.email;
 if(!agent.phone&&workspace.phone)agent.phone=workspace.phone;
 if(agent.name)agent.firstName=agent.name.split(/\s+/)[0];
 return {agency,agent};
}
