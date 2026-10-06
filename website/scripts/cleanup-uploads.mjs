import path from 'node:path';
import {createPostgresStores} from '../postgres-store.mjs';
import {createMediaStorage} from '../media-storage.mjs';
const storage=createMediaStorage();if(!storage.enabled)throw Error('Activez MEDIA_STORAGE=supabase.');await storage.verify();
const stores=await createPostgresStores(process.env.DATA_DIR||path.resolve('data'));
try{
 let count=0;const now=Date.now();
 for(const base of stores.all()){
  // Wait until every issued signing token has expired, with a one-minute margin.
  const expired=await stores.run(base,null,()=>Object.values(stores.state.uploads).filter(u=>Math.max(u.expiresAt,(u.lastSignedAt||u.expiresAt-7200000)+7200000,u.leaseExpires||0)+60000<now).map(u=>structuredClone(u)));
  for(const upload of expired){
   await storage.removeStaged(upload);
   await stores.run(base,null,async()=>{const u=stores.state.uploads[upload.id];if(u&&Math.max(u.expiresAt,(u.lastSignedAt||u.expiresAt-7200000)+7200000,u.leaseExpires||0)+60000<now){if(u.status==='completed'&&u.expiresAt+604800000>now)return;delete stores.state.uploads[upload.id];await stores.save();}});count++;
  }
 }
 console.log('Imports temporaires nettoyés : '+count+'. Médias enregistrés conservés.');
}finally{await stores.close();}
