import * as THREE from '/vendor/three.module.js';
import {OrbitControls} from '/vendor/OrbitControls.js';

const labels={wall:'Mur',door:'Porte',window:'Fenêtre',opening:'Ouverture',floor:'Sol',object:'Objet détecté'};
const colors={wall:0xd8d9dc,door:0xb79070,window:0x74abc3,opening:0x648495,floor:0xe9e2d5,object:0xb2bdcc};
export function mountRoomplan(root,asset,{onRoom=()=>{}}={}){
 if(!asset?.rooms?.length)throw Error('Aucune structure RoomPlan disponible.');
 const wrapper=document.createElement('div');wrapper.className='roomplan-view';
 wrapper.innerHTML='<div class="roomplan-toolbar"><label>Pièce scannée<select aria-label="Pièce RoomPlan"></select></label><div class="roomplan-actions"><button type="button" data-view="reset">Recentrer</button><button type="button" data-view="top">Vue dessus</button><button type="button" data-view="zoom-in" aria-label="Agrandir la vue RoomPlan">＋</button><button type="button" data-view="zoom-out" aria-label="Réduire la vue RoomPlan">−</button><button type="button" data-view="fullscreen">Plein écran</button><button type="button" data-view="photos">Photos de cette pièce</button></div></div><div class="roomplan-canvas"></div><p class="roomplan-help">Glissez pour tourner · molette ou pincement pour zoomer · clic droit ou deux doigts pour déplacer.</p><p class="roomplan-measures" role="status"></p><p class="roomplan-selection" role="status"></p><p class="roomplan-legend">Murs · portes · fenêtres · ouvertures · objets détectés. Structure du scan, consultation uniquement.</p>';
 const stage=wrapper.querySelector('.roomplan-canvas'),select=wrapper.querySelector('select');
 for(const scan of asset.rooms){const option=document.createElement('option');option.value=scan.room;option.textContent=scan.name||scan.room;select.append(option);}
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0xf2f3f5);renderer.domElement.setAttribute('aria-label','Structure RoomPlan du logement');renderer.domElement.tabIndex=0;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,10000),controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=false;controls.screenSpacePanning=true;
 scene.add(new THREE.HemisphereLight(0xffffff,0x8c939d,3));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(5,10,8);scene.add(light);
 const content=new THREE.Group();scene.add(content);const meshes=[];
 let selectedRoom=asset.rooms[0],disposed=false,selectedMesh,resize,observer;
 const draw=()=>{if(!disposed)renderer.render(scene,camera);};
 const setStatus=message=>wrapper.querySelector('.roomplan-selection').textContent=message;
 const clear=()=>{for(const mesh of [...content.children]){mesh.geometry?.dispose();mesh.material?.dispose();content.remove(mesh);}meshes.length=0;selectedMesh=null;};
 const matrix=item=>new THREE.Matrix4().fromArray(item.transform.values);
 const points=item=>item.polygonCorners?.length>=3?item.polygonCorners:[[-item.width/2,-item.height/2],[item.width/2,-item.height/2],[item.width/2,item.height/2],[-item.width/2,item.height/2]];
 function surfaceGeometry(item,openings){
  const shape=new THREE.Shape(points(item).map(([x,y])=>new THREE.Vector2(x,y)));
  if(item.kind==='wall')for(const opening of openings.filter(o=>o.parentIdentifier===item.id)){
   const relative=matrix(item).invert().multiply(matrix(opening));
   const corners=points(opening).map(([x,y])=>new THREE.Vector3(x,y,0).applyMatrix4(relative));
   // Holes use the captured child transform in the wall's own plane.
   if(corners.every(point=>Math.abs(point.z)<.1)){const hole=new THREE.Path(corners.map(point=>new THREE.Vector2(point.x,point.y)));shape.holes.push(hole);}
  }
  if(item.depth>0){const geometry=new THREE.ExtrudeGeometry(shape,{depth:item.depth,bevelEnabled:false,steps:1});geometry.translate(0,0,-item.depth/2);return geometry;}
  return new THREE.ShapeGeometry(shape);
 }
 function add(item,geometry,kind){
  const material=new THREE.MeshStandardMaterial({color:colors[kind],side:THREE.DoubleSide,transparent:['window','opening','wall'].includes(kind),opacity:kind==='wall'?.72:kind==='window'?.4:kind==='opening'?.18:1,depthWrite:!['window','opening'].includes(kind)});
  const mesh=new THREE.Mesh(geometry,material);mesh.applyMatrix4(matrix(item));mesh.userData={kind,item};content.add(mesh);meshes.push(mesh);
 }
 function fit(top=false){
  const bounds=new THREE.Box3().setFromObject(content);if(bounds.isEmpty())throw Error('Le scan ne contient aucune géométrie affichable.');
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),radius=Math.max(size.length()/2,.1);
  const distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)/Math.min(1,camera.aspect)*1.2;
  controls.target.copy(center);camera.position.copy(center).add(top?new THREE.Vector3(0,distance,.001):new THREE.Vector3(distance*.65,distance*.55,distance*.65));
  camera.near=Math.max(.001,distance/10000);camera.far=Math.max(1000,distance*10);camera.updateProjectionMatrix();controls.minDistance=radius*.05;controls.maxDistance=distance*10;controls.update();controls.saveState();draw();
 }
 function renderRoom(){
  clear();const geometry=selectedRoom.geometry,openings=[...geometry.doors,...geometry.windows,...geometry.openings];
  for(const group of ['walls','doors','windows','openings','floors'])for(const item of geometry[group])if(item.width>0&&item.height>0||item.polygonCorners.length>=3)add(item,surfaceGeometry(item,openings),item.kind);
  for(const item of geometry.objects)if(item.dimensions.every(n=>n>0))add(item,new THREE.BoxGeometry(...item.dimensions),'object');
  const measures=selectedRoom.reliableDimensions||{},units={area:'m²',width:'m de largeur',length:'m de longueur',height:'m de hauteur'};
  wrapper.querySelector('.roomplan-measures').textContent=Object.keys(measures).length?Object.entries(measures).map(([key,value])=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(value)+' '+units[key]).join(' · '):'Aucune dimension qualifiée pour cette pièce.';
  setStatus(selectedRoom.name||'Pièce scannée');fit();
 }
 function selectElement(event){
  const bounds=renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);
  const hit=ray.intersectObjects(meshes).find(result=>result.object.userData.kind!=='opening');
  if(selectedMesh)selectedMesh.material.emissive.setHex(0);selectedMesh=hit?.object;
  if(selectedMesh){selectedMesh.material.emissive.setHex(0x173652);const {kind,item}=selectedMesh.userData;
   const name=kind==='object'?item.category:labels[kind];setStatus((selectedRoom.name||'Pièce')+' · '+name+' · confiance '+({high:'élevée',medium:'moyenne',low:'faible',unknown:'non précisée'})[item.confidence]);
  }else setStatus(selectedRoom.name||'Pièce scannée');draw();
 }
 let press;
 const down=e=>press={x:e.clientX,y:e.clientY,time:Date.now()};
 const up=e=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<5&&Date.now()-press.time<700)selectElement(e);press=null;};
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);controls.addEventListener('change',draw);
 select.onchange=()=>{selectedRoom=asset.rooms.find(scan=>scan.room===select.value);renderRoom();};
 wrapper.querySelectorAll('[data-view]').forEach(button=>button.onclick=async()=>{
  const action=button.dataset.view;
  if(action==='reset')fit();
  else if(action==='top')fit(true);
  else if(action.startsWith('zoom-')){camera.position.sub(controls.target).multiplyScalar(action==='zoom-in'?.8:1.25).add(controls.target);controls.update();draw();}
  else if(action==='photos')onRoom(selectedRoom.room);
  else if(action==='fullscreen'){try{if(document.fullscreenElement===wrapper)await document.exitFullscreen();else{if(!wrapper.requestFullscreen)throw Error('Le plein écran est indisponible dans ce navigateur.');await wrapper.requestFullscreen();}}catch(error){setStatus(error.message||'Le plein écran est indisponible.');}}
 });
 function dispose(){
  if(disposed)return;disposed=true;resize?.disconnect();observer?.disconnect();controls.dispose();clear();renderer.dispose();renderer.forceContextLoss();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);
 }
 try{
  root.replaceChildren(wrapper);stage.append(renderer.domElement);
  const size=()=>{const width=stage.clientWidth,height=stage.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();draw();};
  resize=new ResizeObserver(size);resize.observe(stage);size();renderRoom();
  observer=new MutationObserver(()=>{if(!wrapper.isConnected)dispose();});observer.observe(document.body,{childList:true,subtree:true});
  wrapper.dataset.ready='true';
  return {dispose,getState:()=>({disposed,room:selectedRoom.room,camera:camera.position.toArray(),target:controls.target.toArray(),surfaces:meshes.filter(m=>m.userData.kind!=='object').length,objects:meshes.filter(m=>m.userData.kind==='object').length}),selectRoom:id=>{if(!asset.rooms.some(scan=>scan.room===id))return;select.value=id;select.onchange();}};
 }catch(error){dispose();throw error;}
}
