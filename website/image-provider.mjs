import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {maskedSource} from './ai-mask.mjs';
import {imageDataURL} from './image-result.mjs';
import {defaultRouting,operationRoute,validateRouting} from './ai-routing.mjs';
import {providerCatalog,ProviderError} from './image-providers.mjs';
import {toolInstruction} from './public/ai-tools.mjs';

// Vendor models, credential handling and fallback stay behind this interface.
export function imageEditingProvider(env=process.env,{readMedia,routing,catalog=providerCatalog(env)}={}){
 const current=async()=>routing?(await routing.read()).config:defaultRouting();
 const available=(profile,input)=>catalog.configured(profile)&&catalog.accepts(profile,input);
 return {
  name:'image-router',
  get configured(){return Boolean(env.AI_ENDPOINT||env.OPENAI_API_KEY||env.GEMINI_API_KEY||env.BFL_API_KEY);},
  get supportsMasks(){return Boolean(env.OPENAI_API_KEY||env.BFL_API_KEY||env.AI_ENDPOINT&&env.AI_SUPPORTS_MASK==='1');},
  async describe(){const config=await current();return config.profiles.map(p=>({...p,configured:catalog.configured(p),supportsMasks:catalog.masks(p)}));},
  async capabilities(){const config=await current(),ready=(operation,input)=>[config.routes[operation].primary,config.routes[operation].fallback].filter(Boolean).some(id=>available(config.profiles.find(p=>p.id===id),input));return {configured:config.enabled&&(ready('agentPreview',{})||ready('homeStaging',{})),maskEditing:config.enabled&&ready('magicErase',{mask:{}})};},
  async prepare(input,{agent=true}={}){
   const config=await current();if(!config.enabled||!agent&&!config.buyerEnabled)throw Object.assign(Error('Les transformations IA sont suspendues.'),{status:503});
   const operation=operationRoute(input,{agent}),route=config.routes[operation],profiles=[route.primary,route.fallback].filter(Boolean).map(id=>({...config.profiles.find(p=>p.id===id)}));
   if(!profiles.some(p=>available(p,input)))throw Object.assign(Error(input.mask?'La suppression d’objet n’est pas encore activée sur le backend IA. Votre sélection reste disponible.':'Les transformations IA ne sont pas encore activées pour cet outil.'),{status:503});
   return {revision:config.revision,operation,agent,profiles};
  },
  async edit(input,{directory,agencyId,assets,jobId,agent=true,onAttempt=async()=>{}}){
   const snapshot=input.routing||await this.prepare(input,{agent}),config=await current();validateRouting({...defaultRouting(),profiles:snapshot.profiles,routes:Object.fromEntries(Object.keys(defaultRouting().routes).map(key=>[key,{primary:snapshot.profiles[0]?.id,fallback:null}]))});
   if(!config.enabled||!snapshot.agent&&!config.buyerEnabled)throw new ProviderError('disabled');
   let image,dataURL,mime;
   const sourceImage=input.sourceImage||input.photo;
   if(sourceImage.startsWith('/media/')||sourceImage.startsWith('data:image/')){
    let source;
    if(sourceImage.startsWith('data:image/')){const encoded=sourceImage.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!encoded)throw new ProviderError('invalid_source');source=Buffer.from(encoded[1],'base64');imageDataURL(source);}
    else source=await (readMedia?readMedia(sourceImage,{directory,agencyId,assets}):readFile(path.join(directory,sourceImage)));
    const bytes=input.mask?await maskedSource(source,input.mask):source;image={image_base64:bytes.toString('base64')};dataURL=imageDataURL(bytes);mime=dataURL.slice(5,dataURL.indexOf(';'));
   }else{if(input.mask)throw new ProviderError('invalid_source');image={image_url:sourceImage};}
   let reference;
   if(input.inspiration){
    if(!/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$/.test(input.inspiration))throw new ProviderError('invalid_reference');
    const bytes=await (readMedia?readMedia(input.inspiration,{directory,agencyId,assets}):readFile(path.join(directory,input.inspiration)));
    const url=imageDataURL(bytes);reference={image_base64:bytes.toString('base64'),dataURL:url,mime:url.slice(5,url.indexOf(';'))};
   }
   const request={...input,image,dataURL,mime,...(reference?{reference}:{}),instruction:toolInstruction(input)};
   const signal=AbortSignal.timeout(120000);let lastError;
   for(const [index,profile] of snapshot.profiles.entries()){
    const latest=await current();if(!latest.enabled||!snapshot.agent&&!latest.buyerEnabled)throw new ProviderError('disabled');
    const live=latest.profiles.find(p=>p.id===profile.id),attempt={id:index+1,profile:profile.id,provider:profile.type==='http'?'http-image-editing':profile.type,model:profile.model||null,startedAt:new Date().toISOString()};
    if(!live?.enabled||live.type!==profile.type||!available(profile,input)){await onAttempt({...attempt,status:'skipped',code:'unavailable',finishedAt:new Date().toISOString()});continue;}
    await onAttempt({...attempt,status:'processing'});
    try{
     const result=await catalog.edit(profile,request,{signal,attemptKey:profile.type==='http'?jobId:jobId+':'+profile.id});
     await onAttempt({...attempt,status:'completed',finishedAt:new Date().toISOString(),providerRequestId:result.providerRequestId||null,usage:result.usage||null,actualProviderCost:result.actualProviderCost??null});return result;
    }catch(error){lastError=error;await onAttempt({...attempt,status:'failed',code:error.code||'unknown_result',httpStatus:error.httpStatus||null,finishedAt:new Date().toISOString()});if(!error.safeFallback||signal.aborted)throw error;}
   }
   throw lastError||new ProviderError('unavailable');
  }
 };
}
