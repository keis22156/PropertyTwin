import sharp from 'sharp';

// Internal product credits, independent from a vendor's actual bill.
export const aiPrices={preview:1,hd:2};
export const storedImage=value=>typeof value==='string'&&/^(data:image\/(png|jpeg|webp);base64,|\/media\/)/.test(value);

export async function hdDimensions(bytes){
 const metadata=await sharp(bytes,{limitInputPixels:40000000}).metadata();
 const {width,height}=metadata.autoOrient||metadata;
 if(!width||!height||width/height>3||height/width>3)throw Error('Format incompatible avec le rendu HD.');
 // Preserve aspect, multiples of 16; stay within OpenAI's non-experimental pixel limit.
 const scale=Math.min(2048/Math.max(width,height),Math.sqrt(3686400/(width*height)));
 const size={width:Math.floor(width*scale/16)*16,height:Math.floor(height*scale/16)*16};
 if(size.width>size.height*3)size.height=Math.ceil(size.width/3/16)*16;
 if(size.height>size.width*3)size.width=Math.ceil(size.height/3/16)*16;
 return size;
}

export async function verifyHD(image){
 const match=typeof image==='string'&&image.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match)throw Error('Le fournisseur HD doit retourner les octets de l’image.');
 const bytes=Buffer.from(match[1],'base64');if(bytes.length>16000000)throw Error('Image HD trop volumineuse.');
 const metadata=await sharp(bytes,{limitInputPixels:40000000}).metadata();
 const {width,height}=metadata.autoOrient||metadata;
 if(!width||!height||Math.max(width,height)<1920||Math.min(width,height)<640)throw Error('Le fournisseur a retourné un aperçu au lieu du rendu HD demandé.');
 // Decode as well as inspect headers: malformed/truncated images cannot claim HD.
 await sharp(bytes,{limitInputPixels:40000000}).stats();
 return {width,height};
}
