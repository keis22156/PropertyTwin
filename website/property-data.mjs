import {validateRoomplan} from './roomplan-data.mjs';
export function mediaURL(value){if(typeof value==='string'&&/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp|glb|usdz)$/.test(value))return true;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
export function validateProperty(input,{draft=false}={}){
 const error=message=>{throw Object.assign(new Error(message),{status:400});};
 const text=(value,max=5000)=>typeof value==='string'?value.slice(0,max):'';
 const url=value=>{if(!mediaURL(value))error('Les médias doivent utiliser une URL HTTPS valide.');return value;};
 if(!input||typeof input!=='object'||Array.isArray(input))error('Bien invalide.');
 if(typeof input.title!=='string'||!input.title.trim())error('Le titre du bien est obligatoire.');
 if(!Array.isArray(input.rooms)||(!draft&&!input.rooms.length)||input.rooms.length>100)error('Ajoutez au moins une pièce.');
 const ids=new Set();const rooms=input.rooms.map(r=>{if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||!Array.isArray(r.photos)||r.photos.length>100)error('Chaque pièce doit posséder un identifiant unique, un nom et une photo.');ids.add(r.id);return {id:r.id,name:text(r.name,100),photos:r.photos.map(url),...(r.reliableDimensions?{reliableDimensions:text(r.reliableDimensions,100)}:{})};});
 if(!draft&&!rooms.some(r=>r.photos.length))error('Ajoutez au moins une photo au bien.');
 const privacy=input.privacy||'Unlisted';if(!['Public','Unlisted','Private'].includes(privacy))error('Mode de confidentialité invalide.');
 const data={title:text(input.title.trim(),200),location:text(input.location,300),description:text(input.description),information:text(input.information),privacy,indexable:privacy==='Public'&&input.indexable===true,rooms,hero:input.hero?url(input.hero):rooms[0]?.photos[0]||'',features:Array.isArray(input.features)?input.features.slice(0,50).map(v=>text(v,200)):[],credits:input.credits??5};
 if(!Number.isInteger(data.credits)||data.credits<0||data.credits>100000)error('Crédits invalides.');
 for(const key of ['price','surface','roomsCount','bedrooms','bathrooms','floor','totalFloors','landArea','charges','propertyTax','constructionYear'])if(input[key]!==undefined){if(!Number.isFinite(input[key])||(key==='floor'?input[key]<-20||input[key]>300:input[key]<0)||(['roomsCount','bedrooms','bathrooms','floor','totalFloors','constructionYear'].includes(key)&&!Number.isInteger(input[key])))error('Caractéristique numérique invalide.');data[key]=input[key];}
 if(input.dpe){if(!/^[A-G]$/.test(input.dpe))error('DPE invalide.');data.dpe=input.dpe;}
 for(const [field,allowed] of Object.entries({listingType:['Appartement','Maison','Terrain','Bureau','Commerce','Immeuble','Autre'],transaction:['Vente','Location'],condition:['À rénover','Bon état','Très bon état','Neuf'],heating:['Individuel','Collectif','Non renseigné'],orientation:['Nord','Sud','Est','Ouest','Traversant','Non renseignée']})){if(input[field]){if(!allowed.includes(input[field]))error('Caractéristique du bien invalide.');data[field]=input[field];}}
 for(const field of ['address','city','postalCode'])if(input[field]!==undefined)data[field]=text(input[field],300);
 if(input.reference)data.reference=text(input.reference,100);
 if(input.brandingMode!==undefined){if(!['workspace','custom'].includes(input.brandingMode))error('Identité du bien invalide.');data.brandingMode=input.brandingMode;}
 for(const key of ['agency','agent']){const v=input[key]||{};data[key]={};for(const field of key==='agency'?['name','color','email','phone','website','address']:['name','firstName','email','phone'])if(v[field])data[key][field]=text(v[field],300);for(const field of ['logo','photo'])if(v[field])data[key][field]=url(v[field]);}
 if(input.scans){if(!Array.isArray(input.scans)||input.scans.length>100)error('Scans invalides.');data.scans=input.scans.map(scan=>{if(!ids.has(scan.room)||typeof scan.geometry!=='string'||scan.geometry.length>4000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(scan.geometry))error('Géométrie de scan invalide.');return {room:scan.room,geometry:scan.geometry,type:text(scan.type,100),floorLevel:Number.isInteger(scan.floorLevel)?scan.floorLevel:0,...(Number.isFinite(scan.area)&&scan.area>=0?{area:scan.area}:{}),...(scan.model?{model:url(scan.model)}:{})};});}
 if(input.roomplan)data.roomplan=validateRoomplan(input.roomplan,rooms);
 if(input.floorplan){data.floorplan={image:url(input.floorplan.image),zones:[]};for(const z of input.floorplan.zones||[]){if(!ids.has(z.room)||!['x','y','width','height'].every(k=>Number.isFinite(z[k])&&z[k]>=0&&z[k]<=100)||z.x+z.width>100||z.y+z.height>100)error('Zone du plan invalide.');data.floorplan.zones.push({room:z.room,x:z.x,y:z.y,width:z.width,height:z.height});}}
 if(input.model3d){if(typeof input.model3d==='string')data.model3d=url(input.model3d);else data.model3d={src:url(input.model3d.src),...(input.model3d.iosSrc?{iosSrc:url(input.model3d.iosSrc)}:{})};}
 if(input.media){data.media={};for(const [original,m] of Object.entries(input.media)){url(original);data.media[original]={};if(m.thumbnail)data.media[original].thumbnail=url(m.thumbnail);if(m.sources){if(!Array.isArray(m.sources)||m.sources.length>20)error('Images responsive invalides.');data.media[original].sources=m.sources.map(s=>{if(!Number.isInteger(s.width)||s.width<=0||s.width>20000)error('Largeur image invalide.');return {url:url(s.url),width:s.width};});}}}
 for(const field of ['videoURL','tourURL'])if(input[field])data[field]=url(input[field]);
 if(input.documents){if(!Array.isArray(input.documents)||input.documents.length>100)error('Documents invalides.');data.documents=input.documents.map(url);}
 return data;
}
