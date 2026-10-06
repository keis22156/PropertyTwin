import {mkdir,readFile,writeFile,access,chmod} from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {runningSharedServer} from '../shared-server.mjs';
import {createPostgresStores} from '../postgres-store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.join(root,'data');
const command=promisify(execFile),cluster=path.join(data,'postgres'),config=path.join(root,'.env');
const bin=process.env.POSTGRES_BIN||'/opt/homebrew/Cellar/postgresql@16/16.12/bin';
const workspace='11111111-7074-4074-8074-111111111111';
await mkdir(data,{recursive:true});
let existing=false;try{await access(config);existing=true;process.loadEnvFile(config);}catch(error){if(error.code!=='ENOENT')throw error;}
if(process.env.NODE_ENV==='production'||process.env.SUPABASE_URL||process.env.SUPABASE_ANON_KEY)throw Error('dev:shared est réservé au serveur local sans comptes. Votre configuration SaaS reste inchangée.');
if(process.env.DATA_DIR&&path.resolve(process.env.DATA_DIR)!==data)throw Error('dev:shared utilise website/data. Utilisez npm run dev pour votre DATA_DIR personnalisé.');
if(existing&&process.env.SHARED_WORKSPACE_ID!==workspace)throw Error('Une configuration .env existe déjà. Elle reste inchangée. Utilisez npm run dev pour votre serveur configuré.');
const port=Number(process.env.LOCAL_POSTGRES_PORT)||54329;
let dbURL=process.env.DATABASE_URL,adminToken=process.env.ADMIN_TOKEN;
if(!existing){
 if(process.env.DATABASE_URL||process.env.SHARED_WORKSPACE_ID)throw Error('Un serveur est déjà configuré dans l’environnement. Utilisez npm run dev, ou un terminal sans ces variables pour créer l’espace local.');
 const password=randomBytes(32).toString('hex');adminToken||=randomBytes(32).toString('hex');
 dbURL=`postgresql://propertytwin:${password}@127.0.0.1:${port}/propertytwin`;
 await writeFile(config,`# Espace commun local app + SaaS. Secrets privés, ne pas publier.\nDATABASE_URL=${dbURL}\nSHARED_WORKSPACE_ID=${workspace}\nADMIN_TOKEN=${adminToken}\nHOST=0.0.0.0\nPORT=3000\nLOCAL_POSTGRES_PORT=${port}\n`,{flag:'wx',mode:0o600});
 process.loadEnvFile(config);
}
const address=new URL(dbURL);
if(address.protocol!=='postgresql:'||address.hostname!=='127.0.0.1'||address.port!==String(port)||address.pathname!=='/propertytwin'||address.username!=='propertytwin'||!address.password)throw Error('dev:shared utilise uniquement sa base locale dédiée. La configuration différente reste inchangée.');
process.env.DATA_DIR=data;
await chmod(config,0o600);
try{await access(path.join(cluster,'PG_VERSION'));}
catch(error){
 if(error.code!=='ENOENT')throw error;
 const passwordFile=path.join(data,'postgres-password.tmp');
 await writeFile(passwordFile,new URL(dbURL).password+'\n',{mode:0o600});
 try{await command(path.join(bin,'initdb'),['-D',cluster,'-A','scram-sha-256','-U','propertytwin','--pwfile='+passwordFile,'--no-locale']);}
 finally{const {unlink}=await import('node:fs/promises');await unlink(passwordFile);}
}
try{await command(path.join(bin,'pg_ctl'),['-D',cluster,'status']);}
catch{await command(path.join(bin,'pg_ctl'),['-D',cluster,'-l',path.join(data,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${data}`,'-w','start']);}
let pool=new pg.Pool({connectionString:dbURL,max:2});
try{
 await pool.query('select 1');
}catch(error){
 await pool.end();if(error.code!=='3D000')throw error;
 const adminURL=new URL(dbURL);adminURL.pathname='/postgres';
 const admin=new pg.Pool({connectionString:adminURL.href});
 try{await admin.query('create database propertytwin');}finally{await admin.end();}
 pool=new pg.Pool({connectionString:dbURL,max:2});
}
try{
 if(!(await pool.query("select to_regclass('private.workspaces') as table_name")).rows[0].table_name){
  await pool.query(await readFile(path.join(root,'standalone-schema.sql'),'utf8'));
 }
 await pool.query(await readFile(path.join(root,'platform-ai-schema.sql'),'utf8'));
 await pool.query('insert into public.agencies(id,name) values($1,$2) on conflict do nothing',[workspace,'PropertyTwin commun']);
 const imported=(await pool.query('select 1 from private.workspaces where agency_id=$1',[workspace])).rowCount;
 if(!imported){
  let snapshot;try{snapshot=await readFile(path.join(data,'store.json'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  // Keep the original JSON and an immutable backup; import once into PostgreSQL.
  if(snapshot){const backup=path.join(data,'store.before-postgres.json');try{await writeFile(backup,snapshot,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}}
  let migrated;
  if(snapshot){
   migrated=JSON.parse(snapshot);const slugs=new Set((migrated.properties||[]).map(p=>p.slug)),orphans={};
   for(const key of ['sessions','links','leads','variants','records','jobs']){
    const records=migrated[key]||[];const detached=records.filter(record=>!slugs.has(record.slug));
    if(detached.length){orphans[key]=detached;migrated[key]=records.filter(record=>slugs.has(record.slug));}
   }
   if(Object.keys(orphans).length){
    await writeFile(path.join(data,'legacy-unlinked-records.json'),JSON.stringify(orphans),{mode:0o600});
    console.log('Les anciennes activités sans bien associé sont conservées dans data/legacy-unlinked-records.json.');
   }
  }
  const stores=await createPostgresStores(data,{pool,sharedWorkspace:workspace}),store=stores.local;
  await stores.run(store,null,async()=>{await stores.importFiles(stores.current());if(migrated)Object.assign(stores.state,migrated);await stores.save();});
  console.log('Données locales conservées et importées dans PostgreSQL.');
 }
 const count=(await pool.query('select count(*)::int n from public.properties where agency_id=$1',[workspace])).rows[0].n;
 console.log(`Base PostgreSQL commune prête (${count} biens).`);
}finally{await pool.end();}
const addresses=Object.values(networkInterfaces()).flat().filter(i=>i?.family==='IPv4'&&!i.internal).map(i=>i.address);
const sitePort=Number(process.env.PORT)||3000;
const urls=[`http://localhost:${sitePort}`,...addresses.map(ip=>`http://${ip}:${sitePort}`)];
const connection=`Dashboard : ${urls[0]}/agent\nDepuis l’iPhone (même Wi-Fi) : ${urls.slice(1).join(' ou ')}\nClé agent : ${adminToken}\nDans l’app : Profil → App & site web → connexion par clé.\n`;
await writeFile(path.join(data,'connection.txt'),connection,{mode:0o600});
console.log(`Dashboard : ${urls[0]}/agent`);
for(const url of urls.slice(1))console.log(`iPhone : ${url}`);
console.log('Clé et instructions : website/data/connection.txt (fichier privé).');
if(process.argv.includes('--setup-only'))process.exit(0);
await command(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root});
if(await runningSharedServer({port:sitePort,token:adminToken,workspace})){console.log('Serveur PropertyTwin déjà démarré : '+urls[0]+'/agent. Vous pouvez utiliser le dashboard directement.');process.exit(0);}
const child=spawn(process.execPath,['--watch',path.join(root,'server.mjs')],{cwd:root,stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exitCode=code||0);
