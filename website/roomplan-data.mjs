const groups={walls:'wall',doors:'door',windows:'window',openings:'opening',floors:'floor'};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function vector(value,length,max=10000){
 if(!Array.isArray(value)||value.length!==length||value.some(n=>!Number.isFinite(n)||Math.abs(n)>max))fail('Coordonnées RoomPlan invalides.');
 return [...value];
}
function transform(value){
 const values=vector(value?.values,16);
 if(Math.abs(values[3])+Math.abs(values[7])+Math.abs(values[11])>1e-4||Math.abs(values[15]-1)>1e-4)fail('Matrice RoomPlan non affine.');
 const [a,b,c,,d,e,f,,g,h,i]=values;
 if(Math.abs(a*(e*i-f*h)-d*(b*i-c*h)+g*(b*f-c*e))<1e-6)fail('Matrice RoomPlan singulière.');
 return {values};
}
function dimension(value){if(!Number.isFinite(value)||value<0||value>1000)fail('Dimension RoomPlan invalide.');return value;}
const identifier=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))fail('Identifiant RoomPlan invalide.');return value;};
const confidence=value=>['high','medium','low'].includes(value)?value:'unknown';
export function validateGeometry(input){
 if(!object(input))fail('Structure RoomPlan invalide.');
 const result={roomIdentifier:identifier(input.roomIdentifier)},seen=new Set();let total=0;
 const list=(value,max=1000)=>{if(!Array.isArray(value)||value.length>max)fail('Liste RoomPlan invalide.');total+=value.length;if(total>3000)fail('Structure RoomPlan trop volumineuse.');return value;};
 for(const [group,kind] of Object.entries(groups))result[group]=list(input[group]||[]).map(surface=>{
  if(!object(surface)||surface.kind!==kind)fail('Surface RoomPlan invalide.');
  const id=identifier(surface.id);if(seen.has(id))fail('Identifiant RoomPlan dupliqué.');seen.add(id);
  const polygonCorners=list(surface.polygonCorners||[],200).map(point=>vector(point,2));
  return {id,kind,width:dimension(surface.width),height:dimension(surface.height),depth:dimension(surface.depth),transform:transform(surface.transform),confidence:confidence(surface.confidence),polygonCorners,...(surface.parentIdentifier?{parentIdentifier:identifier(surface.parentIdentifier)}:{}),...(typeof surface.isOpen==='boolean'?{isOpen:surface.isOpen}:{})};
 });
 result.objects=list(input.objects||[]).map(item=>{
  if(!object(item)||typeof item.category!=='string'||item.category.length>100)fail('Objet RoomPlan invalide.');
  const id=identifier(item.id);if(seen.has(id))fail('Identifiant RoomPlan dupliqué.');seen.add(id);
  return {id,category:item.category,dimensions:vector(item.dimensions,3,1000).map(dimension),transform:transform(item.transform),confidence:confidence(item.confidence)};
 });
 result.sections=list(input.sections||[],100).map(section=>{
  if(!object(section)||typeof section.label!=='string'||section.label.length>100)fail('Section RoomPlan invalide.');
  return {label:section.label,center:vector(section.center,3)};
 });
 if(!Object.keys(groups).some(group=>result[group].length))fail('Le scan ne contient aucune surface.');
 return result;
}
export function validateRoomplan(input,rooms){
 if(!object(input)||input.version!==1||!Array.isArray(input.rooms)||!input.rooms.length||input.rooms.length>100)fail('Export RoomPlan invalide.');
 if(JSON.stringify(input).length>8000000)fail('Export RoomPlan trop volumineux.');
 const seen=new Set(),allowed=new Set(rooms.map(room=>room.id));
 return {version:1,rooms:input.rooms.map(scan=>{
  if(!object(scan)||!allowed.has(scan.room)||seen.has(scan.room))fail('Pièce RoomPlan inconnue ou dupliquée.');seen.add(scan.room);
  const dimensions={};
  if(scan.reliableDimensions){if(!object(scan.reliableDimensions))fail('Mesures RoomPlan invalides.');for(const key of ['area','width','length','height'])if(scan.reliableDimensions[key]!==undefined)dimensions[key]=dimension(scan.reliableDimensions[key]);}
  return {room:scan.room,geometry:validateGeometry(scan.geometry),...(Object.keys(dimensions).length?{reliableDimensions:dimensions}:{})};
 })};
}
export function roomplanForProperty(property){
 if(property.roomplan)return property.roomplan;
 const rooms=[];
 // Compatibility with the existing iPhone RoomGeometry export. No geometry is guessed.
 for(const scan of property.scans||[]){try{const decoded=JSON.parse(Buffer.from(scan.geometry,'base64').toString('utf8'));rooms.push({room:scan.room,geometry:validateGeometry(decoded)});}catch{/* Old or unsupported scans remain stored but are not rendered. */}}
 return rooms.length?{version:1,rooms}:null;
}
export function publicRoomplan(property){
 const asset=roomplanForProperty(property);if(!asset)return null;
 return {version:1,rooms:asset.rooms.map(scan=>{
  const geometry=structuredClone(scan.geometry),mapping=new Map();
  for(const group of [...Object.keys(groups),'objects'])geometry[group].forEach((item,index)=>mapping.set(item.id,group+'-'+index));
  geometry.roomIdentifier=scan.room;
  for(const group of [...Object.keys(groups),'objects'])for(const item of geometry[group]){item.id=mapping.get(item.id);if(item.parentIdentifier){const parent=mapping.get(item.parentIdentifier);if(parent)item.parentIdentifier=parent;else delete item.parentIdentifier;}}
  return {...scan,name:property.rooms.find(room=>room.id===scan.room)?.name||'Pièce',geometry};
 })};
}
