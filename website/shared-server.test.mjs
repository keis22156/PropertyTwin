import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {runningSharedServer} from './shared-server.mjs';

test('A second launch reuses only the authenticated shared PropertyTwin database',async()=>{
 const workspace='technical-workspace';let config={database:'postgres',shared:true,accounts:false,workspaceID:workspace};
 const server=http.createServer((req,res)=>{assert.equal(req.url,'/api/agent/connection');assert.equal(req.headers.authorization,'Bearer test-only');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(config));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{
  assert.equal(await runningSharedServer({port,token:'test-only',workspace}),true);
  for(const other of [{...config,workspaceID:'another-workspace'},{...config,database:'json'},{...config,accounts:true}]){config=other;await assert.rejects(runningSharedServer({port,token:'test-only',workspace}),/déjà utilisé/);}
 }finally{await new Promise(resolve=>server.close(resolve));}
 assert.equal(await runningSharedServer({port,token:'test-only',workspace}),false);
});
test('Unauthorized, malformed, redirected or unresponsive ports are never claimed as our server',async()=>{
 const options={port:12345,token:'test-only',workspace:'technical'};
 for(const fetcher of [async()=>new Response('Forbidden',{status:401}),async()=>new Response('not-json'),async()=>new Response('x'.repeat(10001)),async()=>{throw Object.assign(Error('timeout'),{cause:{code:'ETIMEDOUT'}});}])await assert.rejects(runningSharedServer({...options,fetcher}),/port 12345/);
});
