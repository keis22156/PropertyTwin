import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createPostgresStores} from '../postgres-store.mjs';
import {createMediaStorage} from '../media-storage.mjs';
const agency=process.argv[2]?.match(/^--agency=([0-9a-f-]{36})$/i)?.[1];
if(!agency)throw Error('Usage : node scripts/migrate-media.mjs --agency=UUID');
const storage=createMediaStorage();if(!storage.enabled)throw Error('Activez MEDIA_STORAGE=supabase.');await storage.verify();
const stores=await createPostgresStores(process.env.DATA_DIR||path.resolve('data'));
try{
 const base=await stores.load(agency),files=await stores.run(base,null,()=>[...stores.current().files]);let count=0;
 for(const url of files){
  const local=await stores.run(base,null,()=>stores.state.assets[url]?.backend!=='supabase');if(!local)continue;
  const type={png:'image/png',jpg:'image/jpeg',webp:'image/webp',glb:'model/gltf-binary',usdz:'model/vnd.usdz+zip'}[url.split('.').at(-1)];
  const data=await readFile(path.join(base.dir,url)),temporary={...base,db:{assets:{}},files:new Set()};
  const uploaded=await storage.write(temporary,data,type);
  await stores.run(base,null,async()=>{if(stores.current().files.has(url)&&stores.state.assets[url]?.backend!=='supabase'){stores.state.assets[url]=temporary.db.assets[uploaded];await stores.save();count++;}});
 }
 console.log('Médias migrés : '+count+'. URLs conservées ; fichiers locaux conservés.');
}finally{await stores.close();}
