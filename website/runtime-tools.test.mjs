import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {postgresBin,chromeBinary,chromeSandboxArgs} from './scripts/runtime-tools.mjs';

test('Runtime tools support Linux-style paths with spaces and reject invalid explicit overrides before launch',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'pt-runtime-tools-'));
 try{
  const partial=path.join(root,'partial'),bin=path.join(root,'postgres bin'),browser=path.join(root,'browser bin');
  for(const directory of [partial,bin,browser])await mkdir(directory);
  const file=async(directory,name,mode=0o700)=>writeFile(path.join(directory,name),'#!/bin/sh\nexit 0\n',{mode});
  await file(partial,'pg_ctl');for(const name of ['initdb','pg_ctl','postgres','psql'])await file(bin,name);await file(browser,'chromium');
  const env={PATH:[partial,bin,browser].join(path.delimiter)};
  assert.equal(await postgresBin({env,platform:'linux'}),bin);assert.equal(await chromeBinary({env,platform:'linux'}),path.join(browser,'chromium'));
  assert.equal(await postgresBin({env:{POSTGRES_BIN:bin,PATH:''}}),bin);assert.equal(await chromeBinary({env:{CHROME_BINARY:path.join(browser,'chromium'),PATH:''}}),path.join(browser,'chromium'));
  await assert.rejects(postgresBin({env:{...env,POSTGRES_BIN:partial}}),/POSTGRES_BIN/);await assert.rejects(chromeBinary({env:{...env,CHROME_BINARY:path.join(browser,'missing')}}),/CHROME_BINARY/);
  await file(browser,'non-executable',0o600);await assert.rejects(chromeBinary({env:{CHROME_BINARY:path.join(browser,'non-executable')}}),/CHROME_BINARY/);
  await assert.rejects(chromeBinary({env:{CHROME_BINARY:browser}}),/CHROME_BINARY/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Chrome sandbox remains enabled by default, including on Linux; disabling is explicit for isolated fixtures',()=>{
 assert.deepEqual(chromeSandboxArgs({env:{},platform:'linux',uid:1000}),[]);assert.deepEqual(chromeSandboxArgs({env:{},platform:'darwin',uid:501}),[]);
 assert.throws(()=>chromeSandboxArgs({env:{},platform:'linux',uid:0}),/non root/);
 assert.deepEqual(chromeSandboxArgs({env:{CHROME_NO_SANDBOX:'1'},platform:'linux',uid:0}),['--no-sandbox']);
 assert.throws(()=>chromeSandboxArgs({env:{CHROME_NO_SANDBOX:'true'}}),/uniquement 1/);
});
