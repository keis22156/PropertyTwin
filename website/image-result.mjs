export function imageDataURL(data){
 if(!Buffer.isBuffer(data)||data.length<12||data.length>16000000)throw new Error('Image invalide.');
 let mime;
 if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
 else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';
 else if(data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP')mime='image/webp';
 else throw new Error('Image invalide.');
 return 'data:'+mime+';base64,'+data.toString('base64');
}
export async function providerImage(response){
 const mime=response.headers.get('content-type')||'';
 // Limit the response before decoding to prevent an unbounded provider payload.
 let length=0;const chunks=[];for await(const chunk of response.body){length+=chunk.length;if(length>24000000)throw new Error('Image trop volumineuse.');chunks.push(Buffer.from(chunk));}
 const data=Buffer.concat(chunks);
 if(mime.startsWith('image/'))return imageDataURL(data);
 const result=JSON.parse(data.toString('utf8'));
 if(typeof result.image_url==='string'){const u=new URL(result.image_url);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}
 if(typeof result.image_base64==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(result.image_base64))return imageDataURL(Buffer.from(result.image_base64,'base64'));
 throw new Error('Image invalide.');
}
