// Technical cuboid fixture, never a simulated property or RoomPlan export.
export function technicalGLB(overrides={}){
 const vertices=[],normals=[];
 const faces=[
  [[0,0,1],[[-1,-.5,1],[1,-.5,1],[1,.5,1],[-1,.5,1]]],
  [[0,0,-1],[[1,-.5,-1],[-1,-.5,-1],[-1,.5,-1],[1,.5,-1]]],
  [[1,0,0],[[1,-.5,1],[1,-.5,-1],[1,.5,-1],[1,.5,1]]],
  [[-1,0,0],[[-1,-.5,-1],[-1,-.5,1],[-1,.5,1],[-1,.5,-1]]],
  [[0,1,0],[[-1,.5,1],[1,.5,1],[1,.5,-1],[-1,.5,-1]]],
  [[0,-1,0],[[-1,-.5,-1],[1,-.5,-1],[1,-.5,1],[-1,-.5,1]]]
 ];
 for(const [normal,points] of faces)for(const i of [0,1,2,0,2,3]){vertices.push(...points[i]);normals.push(...normal);}
 const binary=Buffer.concat([Buffer.from(new Float32Array(vertices).buffer),Buffer.from(new Float32Array(normals).buffer)]);
 const json={asset:{version:'2.0',generator:'PropertyTwin technical fixture, not RoomPlan'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.38,.48,.64,1],metallicFactor:0,roughnessFactor:.8}}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.length*4},{buffer:0,byteOffset:vertices.length*4,byteLength:normals.length*4}],accessors:[{bufferView:0,componentType:5126,count:vertices.length/3,type:'VEC3',min:[-1,-.5,-1],max:[1,.5,1]},{bufferView:1,componentType:5126,count:normals.length/3,type:'VEC3'}],...overrides};
 const text=Buffer.from(JSON.stringify(json)),padding=(4-text.length%4)%4,chunk=Buffer.concat([text,Buffer.alloc(padding,32)]);
 const result=Buffer.alloc(12+8+chunk.length+8+binary.length);result.write('glTF');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(chunk.length,12);result.write('JSON',16);chunk.copy(result,20);result.writeUInt32LE(binary.length,20+chunk.length);result.write('BIN\0',24+chunk.length);binary.copy(result,28+chunk.length);return result;
}
