import sharp from 'sharp';
import {renderPixels,validateSettings} from './public/retouch-engine.mjs';

export async function renderRetouch(data,input){
 const settings=validateSettings(input);
 const pipeline=sharp(data,{limitInputPixels:40000000}).autoOrient();
 const meta=await pipeline.metadata(),rotated=[5,6,7,8].includes(meta.orientation),width=rotated?meta.height:meta.width,height=rotated?meta.width:meta.height;
 const scale=Math.min(1,4096/Math.max(width,height),Math.sqrt(12000000/(width*height)));
 const {data:rgba,info}=await pipeline.resize({width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),fit:'fill',withoutEnlargement:true}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const result=renderPixels({data:rgba,width:info.width,height:info.height},settings);
 return {data:await sharp(Buffer.from(result.data),{raw:{width:result.width,height:result.height,channels:4}}).webp({quality:92}).toBuffer(),settings,width:result.width,height:result.height};
}
