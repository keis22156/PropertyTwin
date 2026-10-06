// Pure pixel/geometry operations shared by browser previews and server exports.
export const defaults=Object.freeze({exposure:0,brightness:1,contrast:0,highlights:0,shadows:0,temperature:0,tint:0,saturation:1,sharpness:0,rotation:0,straighten:0,crop:'original',cropRect:{x:0,y:0,width:1,height:1}});
export function validateSettings(input={}){
 const bad=()=>{throw Object.assign(Error('Paramètres de retouche invalides.'),{status:400});};
 if(!input||typeof input!=='object'||Array.isArray(input))bad();
 const result=structuredClone(defaults);
 for(const [key,min,max] of [['exposure',-2,2],['brightness',.5,1.5],['contrast',-50,50],['highlights',-100,100],['shadows',-100,100],['temperature',-100,100],['tint',-100,100],['saturation',0,2],['sharpness',0,100],['straighten',-15,15]]){
  if(input[key]!==undefined){if(!Number.isFinite(input[key])||input[key]<min||input[key]>max)bad();result[key]=input[key];}
 }
 if(input.rotation!==undefined){if(![0,90,180,270].includes(input.rotation))bad();result.rotation=input.rotation;}
 if(input.crop!==undefined){if(!['original','4:3','16:9','1:1'].includes(input.crop))bad();result.crop=input.crop;}
 if(input.cropRect!==undefined){const r=input.cropRect;if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<.05||r.height<.05||r.x+r.width>1.000001||r.y+r.height>1.000001)bad();result.cropRect={x:r.x,y:r.y,width:r.width,height:r.height};}
 return result;
}
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const luminance=(r,g,b)=>.2126*r+.7152*g+.0722*b;
function checkImage(image){if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width*image.height>40000000||image.data?.length!==image.width*image.height*4)throw Error('Image de retouche invalide.');}
export function autoEnhance(image){
 checkImage(image);const histogram=new Uint32Array(256),neutral=[0,0,0];let count=0,neutrals=0;
 // Sample at most 100k pixels. Ignore transparency and colour-dominant areas for white balance.
 const step=Math.max(1,Math.floor(image.width*image.height/100000));
 for(let i=0;i<image.data.length;i+=4*step){if(image.data[i+3]<128)continue;const rgb=[image.data[i]/255,image.data[i+1]/255,image.data[i+2]/255],y=luminance(...rgb);histogram[Math.round(y*255)]++;count++;if(y>.12&&y<.9&&Math.max(...rgb)-Math.min(...rgb)<.16){rgb.forEach((v,k)=>neutral[k]+=v);neutrals++;}}
 if(!count)return structuredClone(defaults);
 const quantile=fraction=>{let sum=0;for(let i=0;i<256;i++){sum+=histogram[i];if(sum>=count*fraction)return i/255;}return 1;};
 const middle=quantile(.5),low=quantile(.1),high=quantile(.95);
 // Conservative corrections, no content generation, no geometry inference.
 return validateSettings({...defaults,exposure:Math.round(clamp(Math.log2(.43/Math.max(.08,middle))*.6,-.6,.6)*100)/100,shadows:Math.round(clamp((.18-low)*140,0,25)),highlights:-Math.round(clamp((high-.8)*100,0,20)),temperature:neutrals>20?Math.round(clamp((neutral[2]-neutral[0])/neutrals*250,-15,15)):0,tint:neutrals>20?Math.round(clamp(((neutral[0]+neutral[2])/2-neutral[1])/neutrals*250,-15,15)):0,sharpness:12});
}
export function adjustPixels(image,input){
 checkImage(image);const s=validateSettings(input),output=new Uint8ClampedArray(image.data.length),gain=2**s.exposure*s.brightness,contrast=1+s.contrast/100;
 for(let i=0;i<output.length;i+=4){
  const r=image.data[i]/255,g=image.data[i+1]/255,b=image.data[i+2]/255,y=luminance(r,g,b);
  // Luminance-weighted curves keep the extreme black/white endpoints stable.
  const tone=s.shadows/100*(1-y)**2*y*.8+s.highlights/100*y**2*(1-y)*.8;
  const rr=(r*gain-.5)*contrast+.5+tone+s.temperature*.0008+s.tint*.00025;
  const gg=(g*gain-.5)*contrast+.5+tone-s.tint*.0005;
  const bb=(b*gain-.5)*contrast+.5+tone-s.temperature*.0008+s.tint*.00025;
  const gray=luminance(rr,gg,bb);output[i]=clamp(gray+(rr-gray)*s.saturation)*255;output[i+1]=clamp(gray+(gg-gray)*s.saturation)*255;output[i+2]=clamp(gray+(bb-gray)*s.saturation)*255;output[i+3]=image.data[i+3];
 }
 if(s.sharpness){
  const source=output.slice(),amount=s.sharpness/100*.6;
  for(let y=1;y<image.height-1;y++)for(let x=1;x<image.width-1;x++)for(let k=0;k<3;k++){
   const i=(y*image.width+x)*4+k,average=(source[i-4]+source[i+4]+source[i-image.width*4]+source[i+image.width*4])/4;
   output[i]=clamp(source[i]+(source[i]-average)*amount,0,255);
  }
 }
 return {data:output,width:image.width,height:image.height};
}
export function cropGeometry(width,height,input){
 const s=validateSettings(input),rotated=s.rotation%180!==0,w=rotated?height:width,h=rotated?width:height;
 let {x,y,width:rw,height:rh}=s.cropRect;x*=w;y*=h;rw*=w;rh*=h;
 if(s.crop!=='original'){const [a,b]=s.crop.split(':').map(Number),ratio=a/b;if(rw/rh>ratio){const next=rh*ratio;x+=(rw-next)/2;rw=next;}else{const next=rw/ratio;y+=(rh-next)/2;rh=next;}}
 const angle=s.straighten*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle),zoom=Math.max(Math.abs(c)+Math.abs(sn)*h/w,Math.abs(c)+Math.abs(sn)*w/h);
 return {x,y,width:Math.max(1,Math.round(rw)),height:Math.max(1,Math.round(rh)),rotatedWidth:w,rotatedHeight:h,c,sn,zoom};
}
export function transformPixels(image,input){
 checkImage(image);const s=validateSettings(input),g=cropGeometry(image.width,image.height,s),output=new Uint8ClampedArray(g.width*g.height*4);
 for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
  const dx=g.x+x+.5-g.rotatedWidth/2,dy=g.y+y+.5-g.rotatedHeight/2;
  const rx=(g.c*dx+g.sn*dy)/g.zoom+g.rotatedWidth/2,ry=(-g.sn*dx+g.c*dy)/g.zoom+g.rotatedHeight/2;
  let sx=rx,sy=ry;
  if(s.rotation===90){sx=ry;sy=image.height-rx;}
  if(s.rotation===180){sx=image.width-rx;sy=image.height-ry;}
  if(s.rotation===270){sx=image.width-ry;sy=rx;}
  sx=clamp(sx-.5,0,image.width-1);sy=clamp(sy-.5,0,image.height-1);
  const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,image.width-1),y1=Math.min(y0+1,image.height-1),fx=sx-x0,fy=sy-y0;
  const p0=(y0*image.width+x0)*4,p1=(y0*image.width+x1)*4,p2=(y1*image.width+x0)*4,p3=(y1*image.width+x1)*4,target=(y*g.width+x)*4;
  for(let k=0;k<4;k++)output[target+k]=image.data[p0+k]*(1-fx)*(1-fy)+image.data[p1+k]*fx*(1-fy)+image.data[p2+k]*(1-fx)*fy+image.data[p3+k]*fx*fy;
 }
 return {data:output,width:g.width,height:g.height};
}
export function renderPixels(image,settings){return transformPixels(adjustPixels(image,settings),settings);}
