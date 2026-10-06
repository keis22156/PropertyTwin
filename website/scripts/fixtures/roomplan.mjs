// Explicit technical fixture, not a real capture or a production property.
export function technicalRoomplan(){
 const transform=(x,y,z,angle=0)=>({values:[Math.cos(angle),0,-Math.sin(angle),0,0,1,0,0,Math.sin(angle),0,Math.cos(angle),0,x,y,z,1]});
 const surface=(id,kind,width,height,matrix,extra={})=>({id,kind,width,height,depth:0,transform:matrix,confidence:'high',polygonCorners:[],...extra});
 const geometry={roomIdentifier:'fixture-room',walls:[surface('wall-back','wall',5,2.6,transform(0,1.3,-2)),surface('wall-left','wall',4,2.6,transform(-2.5,1.3,0,Math.PI/2)),surface('wall-right','wall',4,2.6,transform(2.5,1.3,0,Math.PI/2))],doors:[surface('door','door',.9,2.1,transform(-1,1.05,-2),{parentIdentifier:'wall-back',isOpen:false})],windows:[surface('window','window',1.4,1.1,transform(1.1,1.5,-2),{parentIdentifier:'wall-back'})],openings:[],floors:[surface('floor','floor',5,4,{values:[1,0,0,0,0,0,-1,0,0,1,0,0,0,0,0,1]},{polygonCorners:[[-2.5,-2],[2.5,-2],[2.5,2],[-2.5,2]]})],objects:[{id:'object-sofa',category:'sofa',dimensions:[2,.8,.8],transform:transform(0,.4,-.7),confidence:'medium'}],sections:[{label:'livingRoom',center:[0,0,0]}]};
 return JSON.parse(JSON.stringify({version:1,rooms:[{room:'salon',geometry},{room:'chambre',geometry:{...structuredClone(geometry),roomIdentifier:'fixture-second',objects:[]},reliableDimensions:{width:5,length:4,height:2.6}}]}));
}
