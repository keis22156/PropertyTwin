import sharp from 'sharp';

// Preserve framing and aspect ratio. Originals are stored separately, byte for byte.
export async function imageRenditions(data){
 const image=sharp(data,{limitInputPixels:40000000}).autoOrient();
 const metadata=await image.metadata();
 const width=[5,6,7,8].includes(metadata.orientation)?metadata.height:metadata.width;
 if(!width)throw Error('Image illisible.');
 const targets=[...new Set([320,640,1280,1920].map(target=>Math.min(target,width)))];
 const results=[];
 for(const target of targets){
  const {data:buffer,info}=await image.clone().resize({width:target,withoutEnlargement:true}).webp({quality:82}).toBuffer({resolveWithObject:true});
  results.push({data:buffer,width:info.width,height:info.height});
 }
 return results;
}
