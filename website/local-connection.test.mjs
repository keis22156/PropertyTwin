import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalConnection} from './local-connection.mjs';

test('Local pairing requires an authorized agent and is single use, expiring and rate limited',()=>{
 let clock=1000000;const pairing=createLocalConnection({env:{ADMIN_TOKEN:'test-only'},now:()=>clock});
 const first=pairing.create();assert.ok(first.code.length>=32);
 assert.throws(()=>pairing.redeem('invalid','test-client'),{status:401});
 assert.deepEqual(pairing.redeem(first.code,'test-client'),{token:'test-only'});
 assert.throws(()=>pairing.redeem(first.code,'test-client'),{status:401});
 const second=pairing.create();clock+=300001;
 assert.throws(()=>pairing.redeem(second.code,'test-client'),{status:401});
 for(let i=0;i<9;i++)assert.throws(()=>pairing.redeem('invalid','test-client'),{status:401});
 assert.throws(()=>pairing.redeem('invalid','test-client'),{status:429});
 clock+=60001;assert.throws(()=>pairing.redeem('invalid','test-client'),{status:401});
});
test('Production and SaaS sessions cannot reveal the local server key',()=>{
 for(const env of [{},{ADMIN_TOKEN:'test-only',NODE_ENV:'production'},{ADMIN_TOKEN:'test-only',SUPABASE_URL:'https://example.test'}]){
  const pairing=createLocalConnection({env});assert.throws(()=>pairing.create(),{status:403});assert.throws(()=>pairing.redeem('anything','test-client'),{status:403});
 }
});
