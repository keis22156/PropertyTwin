const clone=value=>structuredClone(value);
export function createMaskHistory(){
 let strokes=[],undo=[],redo=[];
 function change(next){if(JSON.stringify(next)===JSON.stringify(strokes))return false;undo.push(clone(strokes));if(undo.length>50)undo.shift();redo=[];strokes=clone(next);return true;}
 return {
  get strokes(){return clone(strokes);},get canUndo(){return undo.length>0;},get canRedo(){return redo.length>0;},
  add(stroke){
   if(!stroke||!['paint','erase'].includes(stroke.mode)||!Number.isFinite(stroke.size)||stroke.size<.002||stroke.size>.3||!Array.isArray(stroke.points)||!stroke.points.length||stroke.points.length>3000||strokes.length>=200)throw Error('Sélection trop complexe. Réinitialisez le masque ou simplifiez vos traits.');
   if(stroke.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('Trait de sélection invalide.');
   return change([...strokes,{mode:stroke.mode,size:stroke.size,points:stroke.points.map(p=>({x:p.x,y:p.y}))}]);
  },reset:()=>change([]),
  undo(){if(!undo.length)return false;redo.push(clone(strokes));strokes=undo.pop();return true;},
  redo(){if(!redo.length)return false;undo.push(clone(strokes));strokes=redo.pop();return true;}
 };
}
export function drawMask(context,width,height,strokes,{overlay=false}={}){
 context.clearRect(0,0,width,height);
 if(!overlay){context.fillStyle='#000';context.fillRect(0,0,width,height);}
 for(const stroke of strokes){
  context.globalCompositeOperation=overlay&&stroke.mode==='erase'?'destination-out':'source-over';
  context.strokeStyle=context.fillStyle=overlay?(stroke.mode==='erase'?'#000':'rgba(49,119,248,.55)'):stroke.mode==='paint'?'#fff':'#000';
  context.lineWidth=stroke.size*Math.min(width,height);context.lineCap=context.lineJoin='round';
  const first=stroke.points[0];context.beginPath();context.arc(first.x*width,first.y*height,context.lineWidth/2,0,Math.PI*2);context.fill();
  context.beginPath();context.moveTo(first.x*width,first.y*height);for(const point of stroke.points.slice(1))context.lineTo(point.x*width,point.y*height);context.stroke();
 }
 context.globalCompositeOperation='source-over';
}
