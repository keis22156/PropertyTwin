import {readFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {createPostgresStores} from '../postgres-store.mjs';
import {validateProperty} from '../property-data.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const match=arg.match(/^--(source|agency)=(.+)$/);if(!match)throw Error('Usage : --source=/dossier --agency=UUID');return [match[1],match[2]];}));
if(!args.source||!args.agency)throw Error('Indiquez --source=/dossier et --agency=UUID.');
const source=path.resolve(args.source),db=JSON.parse(await readFile(path.join(source,'store.json'),'utf8'));
for(const key of ['properties','sessions','links','leads','variants','records','jobs']){db[key]||=[];if(!Array.isArray(db[key]))throw Error('Collection invalide : '+key);}
db.workspace||={};db.media||={};db.assets||={};db.uploads||={};
if(Object.values(db.assets).some(asset=>asset.backend==='supabase')||Object.keys(db.uploads).length)throw Error('Ce script importe un store local ; les références Storage et imports temporaires ne sont pas transférables vers une autre agence.');
for(const p of db.properties){if(p.demo)throw Error('Un bien de démonstration ne peut pas être importé.');validateProperty(p,{draft:true});}
for(const lead of db.leads)if(!lead.id){lead.id=randomBytes(24).toString('base64url');lead.stage||='new';lead.notes||=[];}
for(const job of db.jobs)job.agencyId=args.agency;
const stores=await createPostgresStores(process.env.DATA_DIR||path.resolve('data'));
try{
 const base=await stores.load(args.agency);
 await stores.run(base,null,async()=>{
  if(['properties','jobs','leads','sessions','links','variants','records'].some(key=>stores.state[key].length)||Object.keys(stores.state.workspace).length||Object.keys(stores.state.media).length||stores.current().files.size)throw Error('L’agence cible contient déjà des données. Import annulé.');
  await mkdir(path.join(base.dir,'media'),{recursive:true});
  let files=[];try{files=await readdir(path.join(source,'media'));}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const name of files){
   if(!/^[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/.test(name))throw Error('Nom de média invalide.');
   const target=path.join(base.dir,'media',name),original=path.join(source,'media',name);
   if(target!==original)try{await copyFile(original,target,constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;if(!(await readFile(original)).equals(await readFile(target)))throw Error('Un média différent porte déjà le même nom.',{cause:error});}
   stores.current().files.add('/media/'+name);
  }
  Object.assign(stores.current().db,db);await stores.save();
 });
 console.log('Import terminé : '+db.properties.length+' biens, '+db.leads.length+' contacts. Les fichiers sources sont conservés.');
}finally{await stores.close();}
