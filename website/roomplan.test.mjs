import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRoomplan,publicRoomplan,roomplanForProperty} from './roomplan-data.mjs';
import {technicalRoomplan} from './scripts/fixtures/roomplan.mjs';
const rooms=[{id:'salon',name:'Salon',photos:[]},{id:'chambre',name:'Chambre',photos:[]}];
await test('RoomPlan preserves source transforms and qualified measurements, and removes scan identifiers from the buyer response',()=>{
 const source=technicalRoomplan(),asset=validateRoomplan(source,rooms);assert.deepEqual(asset,source);
 const property={rooms,roomplan:asset},publicAsset=publicRoomplan(property);
 assert.equal(publicAsset.rooms[0].geometry.roomIdentifier,'salon');assert.equal(publicAsset.rooms[0].geometry.doors[0].parentIdentifier,'walls-0');
 assert.deepEqual(publicAsset.rooms[0].geometry.walls[0].transform,source.rooms[0].geometry.walls[0].transform);
 assert.equal(publicAsset.rooms[0].reliableDimensions,undefined);assert.deepEqual(publicAsset.rooms[1].reliableDimensions,{width:5,length:4,height:2.6});
 assert.equal(publicAsset.rooms[0].name,'Salon');assert.ok(!JSON.stringify(publicAsset).includes('wall-back'));
 const legacy={rooms,scans:[{room:'salon',area:200,geometry:Buffer.from(JSON.stringify(source.rooms[0].geometry)).toString('base64')}]};
 assert.equal(roomplanForProperty(legacy).rooms[0].reliableDimensions,undefined);assert.deepEqual(roomplanForProperty(legacy).rooms[0].geometry,source.rooms[0].geometry);
 assert.equal(roomplanForProperty({scans:[{room:'salon',geometry:'aGVsbG8='}]}),null);
});
await test('RoomPlan rejects malformed matrices, measurements, duplicate rooms and excessive structures',()=>{
 for(const mutate of [a=>a.rooms[0].geometry.walls[0].transform.values.pop(),a=>a.rooms[0].geometry.walls[0].transform.values.fill(0),a=>a.rooms[0].geometry.walls[0].width=-1,a=>a.rooms[0].geometry.walls[0].kind='floor',a=>a.rooms[0].room='unknown',a=>a.rooms.push(a.rooms[0]),a=>a.rooms[0].geometry.walls.push(a.rooms[0].geometry.walls[0]),a=>a.rooms[0].geometry.walls[0].polygonCorners=[[Infinity,0]],a=>a.rooms[0].geometry.objects[0].dimensions=[2,3],a=>a.rooms[0].reliableDimensions={area:'20'}]){
  const asset=technicalRoomplan();mutate(asset);assert.throws(()=>validateRoomplan(asset,rooms),error=>error.status===400);
 }
});
