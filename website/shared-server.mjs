// Check the authenticated identity of an occupied port before reusing it.
export async function runningSharedServer({port,token,workspace,fetcher=fetch}){
 let response;
 try{response=await fetcher(`http://127.0.0.1:${port}/api/agent/connection`,{headers:{Authorization:'Bearer '+token,Connection:'close'},redirect:'error',signal:AbortSignal.timeout(3000)});}
 catch(error){if(error.cause?.code==='ECONNREFUSED')return false;throw Error(`Le port ${port} est occupé ou indisponible. Fermez son serveur avant de relancer PropertyTwin.`,{cause:error});}
 let value;
 try{
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>10000)throw Error('Unexpected response');chunks.push(Buffer.from(chunk));}
  value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{throw Error(`Le port ${port} est déjà utilisé par un autre serveur. Fermez-le ou choisissez un autre PORT.`);}
 if(!response.ok||value.database!=='postgres'||value.shared!==true||value.accounts!==false||value.workspaceID!==workspace)throw Error(`Le port ${port} est déjà utilisé par un autre serveur ou une autre configuration. Fermez-le ou choisissez un autre PORT.`);
 return true;
}
