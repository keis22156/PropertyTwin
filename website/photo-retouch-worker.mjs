import {isMainThread,Worker,parentPort,workerData} from 'node:worker_threads';
import {renderRetouch} from './photo-retouch.mjs';

// Keep full-size pixel loops outside the HTTP event loop.
export function renderRetouchInWorker(data,settings){
 const source=Uint8Array.from(data);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{source,settings},transferList:[source.buffer]});
  let finished=false;
  const timer=setTimeout(()=>{finish(Object.assign(Error('La retouche a pris trop de temps. Réessayez.'),{status:503}));worker.terminate().catch(()=>{});},60000);
  function finish(error,value){if(finished)return;finished=true;clearTimeout(timer);if(error)reject(error);else resolve(value);}
  worker.once('message',message=>{if(message.error)finish(Object.assign(Error(message.error.message),{status:message.error.status}));else finish(null,{...message.result,data:Buffer.from(message.result.data)});});
  worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!finished)finish(Error('Le moteur de retouche s’est arrêté : '+code));});
 });
}
if(!isMainThread){
 try{const result=await renderRetouch(Buffer.from(workerData.source),workerData.settings);const data=Uint8Array.from(result.data);parentPort.postMessage({result:{...result,data}},[data.buffer]);}
 catch(error){parentPort.postMessage({error:{message:error.status?error.message:'Impossible de retoucher cette image.',status:error.status||400}});}
}
