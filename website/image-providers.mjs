import sharp from 'sharp';
import {imageDataURL,providerImage} from './image-result.mjs';

export class ProviderError extends Error{constructor(code,{safeFallback=false,status=null}={}){super('La génération fournisseur a échoué.');Object.assign(this,{code,safeFallback,httpStatus:status});}}
const error=code=>new ProviderError(code);
export async function responseBytes(response,limit=24000000){let length=0;const chunks=[];for await(const chunk of response.body){length+=chunk.length;if(length>limit)throw error('oversized_result');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
async function jsonResponse(response){try{return JSON.parse((await responseBytes(response)).toString('utf8'));}catch(e){if(e instanceof ProviderError)throw e;throw error('invalid_result');}}
async function checked(fetcher,url,options,{beforeAcceptance=true}={}){
 let response;try{response=await fetcher(url,{...options,redirect:'error'});}catch{throw error('network_unknown');}
 if(!response.ok){await response.body?.cancel();throw new ProviderError('http_'+response.status,{status:response.status,safeFallback:beforeAcceptance&&response.status===429});}return response;
}
function base64Image(value){if(typeof value!=='string'||value.length>22000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw error('invalid_result');return imageDataURL(Buffer.from(value,'base64'));}
const safeUsage=value=>{if(!value||typeof value!=='object')return null;const result={};for(const [key,item] of Object.entries(value))if(/^[a-z_]{1,60}$/.test(key)&&Number.isFinite(item)&&item>=0)result[key]=item;return Object.keys(result).length?result:null;};
const reference=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value)?value:null;
const prompt=input=>`${input.instruction}\nOpération : ${input.action}.\n${input.style?'Style : '+input.style+'.\n':''}Demande : ${input.prompt}`;

export function providerCatalog(env=process.env,{fetcher=(...args)=>fetch(...args),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 return {
  configured(profile){return profile.enabled&&Boolean(profile.type==='http'?env.AI_ENDPOINT:profile.type==='openai'?env.OPENAI_API_KEY:profile.type==='gemini'?env.GEMINI_API_KEY:env.BFL_API_KEY);},
  masks(profile){return profile.type==='openai'||profile.type==='flux'&&profile.model==='flux-pro-1.0-fill'||profile.type==='http'&&env.AI_SUPPORTS_MASK==='1';},
  references(profile){return ['openai','gemini'].includes(profile.type)||profile.type==='flux'&&['flux-2-pro','flux-2-pro-preview'].includes(profile.model)||profile.type==='http'&&env.AI_SUPPORTS_REFERENCE==='1';},
  hd(profile){return profile.type==='http'?env.AI_SUPPORTS_HD==='1':profile.type==='openai'?/^gpt-image-(?:2|2\.5-(?:sunburst|flare))(?:-\d{4}-\d{2}-\d{2})?$/.test(profile.model):profile.type==='gemini'?/^gemini-(?:3\.1-flash|3-pro)-image(?:-preview)?$/.test(profile.model):['flux-2-pro','flux-2-pro-preview'].includes(profile.model);},
  accepts(profile,input){return (input.quality!=='hd'||this.hd(profile))&&(!input.inspiration&&!input.reference||this.references(profile))&&(!input.mask&&(profile.type!=='flux'||profile.model!=='flux-pro-1.0-fill')||Boolean(input.mask)&&this.masks(profile));},
  async edit(profile,input,{signal,attemptKey}){
   if(!this.accepts(profile,input))throw error('unsupported_input');
   if(input.quality==='hd'&&!input.hdSize)throw error('missing_hd_dimensions');
   const headers={'Content-Type':'application/json','Idempotency-Key':attemptKey};
   let result;
   if(profile.type==='http'){
    const response=await checked(fetcher,env.AI_ENDPOINT,{method:'POST',signal,headers:{...headers,...(env.AI_TOKEN?{Authorization:'Bearer '+env.AI_TOKEN}:{})},body:JSON.stringify({...input.image,...(input.hdSize?{output_width:input.hdSize.width,output_height:input.hdSize.height}:{}),...(input.reference?{reference_image_base64:input.reference.image_base64,reference_mime_type:input.reference.mime}:{}),...(input.mask?{mask_base64:input.mask.base64,mask_width:input.mask.width,mask_height:input.mask.height,mask_convention:input.mask.convention}:{}),action:input.action,style:input.style,options:input.options||{},user_prompt:input.prompt,quality:input.quality,preserve_geometry:true,instruction:input.instruction})});
    return {image:await providerImage(response),provider:'http-image-editing',model:null,actualProviderCost:null};
   }
   if(profile.type==='openai'){
    let mask;if(input.mask){const raw=await sharp(Buffer.from(input.mask.base64,'base64')).greyscale().raw().toBuffer();const alpha=Buffer.alloc(raw.length*4,255);for(let i=0;i<raw.length;i++)alpha[i*4+3]=255-raw[i];const png=await sharp(alpha,{raw:{width:input.mask.width,height:input.mask.height,channels:4}}).png().toBuffer();if(png.length>=4000000)throw error('mask_too_large');mask={image_url:imageDataURL(png)};}
    const response=await checked(fetcher,'https://api.openai.com/v1/images/edits',{method:'POST',signal,headers:{...headers,Authorization:'Bearer '+env.OPENAI_API_KEY},body:JSON.stringify({model:profile.model,images:[{image_url:input.image.image_url||input.dataURL},...(input.reference?[{image_url:input.reference.dataURL}]:[])],...(mask?{mask}:{}),prompt:prompt(input),n:1,size:input.hdSize?input.hdSize.width+'x'+input.hdSize.height:'auto',quality:input.quality==='hd'?'high':'low',output_format:'png'})});
    result=await jsonResponse(response);return {image:base64Image(result.data?.[0]?.b64_json),provider:'openai',model:profile.model,usage:safeUsage(result.usage),providerRequestId:reference(response.headers.get('x-request-id')),actualProviderCost:null};
   }
   if(profile.type==='gemini'){
    const ratios=['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'];
    const ratio=value=>value.split(':').reduce((a,b)=>a/b);
    const aspect=input.hdSize&&ratios.sort((a,b)=>Math.abs(ratio(a)-input.hdSize.width/input.hdSize.height)-Math.abs(ratio(b)-input.hdSize.width/input.hdSize.height))[0];
    const image={type:'image',...(input.image.image_url?{uri:input.image.image_url}:{data:input.image.image_base64,mime_type:input.mime})};
    const response=await checked(fetcher,'https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',signal,headers:{...headers,'x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({model:profile.model,input:[{type:'text',text:prompt(input)},image,...(input.reference?[{type:'image',data:input.reference.image_base64,mime_type:input.reference.mime}]:[])],response_format:{type:'image',mime_type:'image/png',image_size:input.quality==='hd'?'2K':'1K',...(aspect?{aspect_ratio:aspect}:{})},store:false})});
    result=await jsonResponse(response);if(result.status!=='completed')throw error('incomplete_result');const images=(result.steps||[]).filter(step=>step.type==='model_output').flatMap(step=>step.content||[]).filter(part=>part.type==='image'&&part.data);if(!images.length)throw error('invalid_result');return {image:base64Image(images[0].data),provider:'gemini',model:profile.model,usage:safeUsage(result.usage),providerRequestId:reference(result.id),actualProviderCost:null};
   }
   if(profile.type==='flux'){
    const fill=profile.model==='flux-pro-1.0-fill';const image=input.image.image_base64||input.image.image_url;
    const response=await checked(fetcher,'https://api.bfl.ai/v1/'+profile.model,{method:'POST',signal,headers:{...headers,'x-key':env.BFL_API_KEY},body:JSON.stringify({prompt:prompt(input),...(fill?{image,mask:input.mask.base64}:{input_image:image}),...(input.hdSize?input.hdSize:{}),...(input.reference?{input_image_2:input.reference.image_base64}:{}),output_format:'png'})});
    result=await jsonResponse(response);const polling=new URL(result.polling_url);if(polling.protocol!=='https:'||!(polling.hostname==='api.bfl.ai'||/^api\.[a-z0-9-]+\.bfl\.ai$/.test(polling.hostname))||polling.username||polling.password||polling.port)throw error('invalid_polling_url');const requestId=reference(result.id);
    for(let i=0;i<120&&!signal.aborted;i++){
     await sleep(500);if(signal.aborted)throw error('network_unknown');const polled=await checked(fetcher,polling.href,{signal,headers:{'x-key':env.BFL_API_KEY}},{beforeAcceptance:false});result=await jsonResponse(polled);
     if(result.status==='Ready'){
      const sample=new URL(result.result?.sample);const extraHosts=(env.BFL_RESULT_HOSTS||'').split(',').map(value=>value.trim()).filter(Boolean);if(sample.protocol!=='https:'||sample.username||sample.password||sample.port||!(sample.hostname.endsWith('.bfl.ai')||/^bfldelivery[a-z0-9]+\.blob\.core\.windows\.net$/.test(sample.hostname)||extraHosts.includes(sample.hostname)))throw error('invalid_result');
      const download=await checked(fetcher,sample.href,{signal,headers:{}},{beforeAcceptance:false});return {image:imageDataURL(await responseBytes(download,16000000)),provider:'flux',model:profile.model,providerRequestId:requestId,actualProviderCost:null};
     }
     if(!['Pending','Processing','Queued','Task not found'].includes(result.status))throw error('terminal_result');
    }throw error('network_unknown');
   }
   throw error('unknown_provider');
  }
 };
}
