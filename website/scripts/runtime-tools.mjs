import {access,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

async function executable(file){try{await access(file,constants.X_OK);return (await stat(file)).isFile();}catch{return false;}}
const directories=value=>(value||'').split(path.delimiter).filter(Boolean);

export async function postgresBin({env=process.env,platform=process.platform}={}){
 const complete=async directory=>(await Promise.all(['initdb','pg_ctl','postgres','psql'].map(name=>executable(path.join(directory,name))))).every(Boolean);
 if(env.POSTGRES_BIN){if(await complete(env.POSTGRES_BIN))return path.resolve(env.POSTGRES_BIN);throw Error('POSTGRES_BIN doit contenir les exécutables initdb, pg_ctl, postgres et psql.');}
 const candidates=[...directories(env.PATH),...(platform==='darwin'?['/opt/homebrew/opt/postgresql@16/bin','/usr/local/opt/postgresql@16/bin']:platform==='linux'?['/usr/lib/postgresql/16/bin']:[])];
 for(const directory of candidates)if(await complete(directory))return path.resolve(directory);
 throw Error('PostgreSQL introuvable. Installez PostgreSQL 16 et définissez POSTGRES_BIN vers son dossier bin, ou ajoutez ce dossier au PATH.');
}

export async function chromeBinary({env=process.env,platform=process.platform}={}){
 if(env.CHROME_BINARY){if(await executable(env.CHROME_BINARY))return path.resolve(env.CHROME_BINARY);throw Error('CHROME_BINARY ne désigne pas un exécutable accessible.');}
 const candidates=directories(env.PATH).flatMap(directory=>['google-chrome','google-chrome-stable','chromium','chromium-browser'].map(name=>path.join(directory,name)));
 if(platform==='darwin')candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
 for(const file of candidates)if(await executable(file))return path.resolve(file);
 throw Error('Chrome/Chromium introuvable. Installez un navigateur et définissez CHROME_BINARY, ou ajoutez-le au PATH.');
}

export function chromeSandboxArgs({env=process.env,platform=process.platform,uid=process.getuid?.()}={}){
 if(env.CHROME_NO_SANDBOX&&env.CHROME_NO_SANDBOX!=='1')throw Error('CHROME_NO_SANDBOX accepte uniquement 1.');
 if(env.CHROME_NO_SANDBOX==='1')return ['--no-sandbox'];
 if(platform==='linux'&&uid===0)throw Error('Chrome doit être lancé sous un utilisateur non root. Pour un conteneur de tests isolé uniquement, CHROME_NO_SANDBOX=1 permet un lancement explicite sans sandbox Chrome.');
 return [];
}
