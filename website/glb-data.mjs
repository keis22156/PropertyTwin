// GLB 2.0 container checks; scene/geometry support is verified by the renderer.
// https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
export function validGLB(data){
 try{
  if(data.length<20||data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)return false;
  let offset=12,json,binLength=0,index=0;
  while(offset<data.length){
   if(offset+8>data.length)return false;
   const length=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4);offset+=8;
   if(length%4||offset+length>data.length)return false;
   if(index===0){if(type!==0x4e4f534a)return false;json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(offset,offset+length)));}
   else if(type===0x004e4942){if(index!==1)return false;binLength=length;}
   else if(type===0x4e4f534a)return false;
   offset+=length;index++;
  }
  if(json?.asset?.version!=='2.0'||json.asset.minVersion&&json.asset.minVersion!=='2.0')return false;
  for(const resource of [...(json.buffers||[]),...(json.images||[])])if(resource.uri&&!/^data:/.test(resource.uri))return false;
  const buffers=(json.buffers||[]).filter(buffer=>!buffer.uri);
  if(buffers.length>1)return false;
  if(buffers.length&&(!Number.isInteger(buffers[0].byteLength)||buffers[0].byteLength<0||buffers[0].byteLength>binLength||binLength-buffers[0].byteLength>3))return false;
  return true;
 }catch{return false;}
}
