import sharp from 'sharp';
import {createHash} from 'node:crypto';

const fail=message=>{throw Object.assign(Error(message),{status:400});};
export async function validateAIMask(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['base64','width','height'].includes(key)))fail('Masque invalide.');
 const {base64,width,height}=value;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||width*height>40000000)fail('La photo est trop grande pour la sélection (40 mégapixels maximum).');
 if(typeof base64!=='string'||base64.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))fail('Masque PNG invalide ou trop volumineux (2 Mo maximum).');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length>2000000||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('Le masque doit être une image PNG.');
 let decoded;
 try{const image=sharp(bytes,{limitInputPixels:40000000});const meta=await image.metadata();if(meta.pages>1||meta.width!==width||meta.height!==height)fail('Les dimensions du masque ne correspondent pas à la photo.');decoded=await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});}
 catch(error){if(error.status)throw error;fail('Le masque est illisible. Recommencez la sélection.');}
 const pixels=Buffer.alloc(width*height);let selected=0;
 for(let i=0;i<pixels.length;i++){
  const offset=i*4,value=decoded.data[offset];
  if(decoded.data[offset+3]!==255||decoded.data[offset+1]!==value||decoded.data[offset+2]!==value)fail('Le masque doit être opaque et en noir et blanc.');
  pixels[i]=value>=128?255:0;if(pixels[i])selected++;
 }
 if(!selected)fail('Sélectionnez au moins un objet sur la photo.');
 const canonical=await sharp(pixels,{raw:{width,height,channels:1}}).png({compressionLevel:9}).toBuffer();
 if(canonical.length>2000000)fail('Le masque est trop complexe. Simplifiez la sélection.');
 return {base64:canonical.toString('base64'),width,height,digest:createHash('sha256').update(canonical).digest('hex'),convention:'white-edit-black-keep'};
}

export async function maskedSource(bytes,mask){
 try{
  const result=await sharp(bytes,{limitInputPixels:40000000}).autoOrient().png().toBuffer({resolveWithObject:true});
  if(result.info.width!==mask.width||result.info.height!==mask.height)throw Error('Mask dimensions mismatch');
  return result.data;
 }catch{throw Error('Photo ou dimensions du masque invalides.');}
}
