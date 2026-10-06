// History concerns photo references only: room geometry, names and other fields stay intact.
window.PropertyTwinPhotoHistory=function(property){
 const undo=[],redo=[];let structure='';
 const snapshot=()=>({rooms:property.rooms.map(room=>({id:room.id,photos:[...room.photos]})),hero:property.hero||''});
 function synchronize(){const next=JSON.stringify(property.rooms.map(room=>room.id));if(next!==structure){undo.length=redo.length=0;structure=next;}}
 function apply(state){for(const room of property.rooms)room.photos=[...state.rooms.find(item=>item.id===room.id).photos];property.hero=state.hero;}
 return {
  get canUndo(){synchronize();return undo.length>0;},
  get canRedo(){synchronize();return redo.length>0;},
  change(operation){
   synchronize();const before=snapshot(),next=structuredClone(before);operation(next);
   if(next.rooms.some(room=>room.photos.length>100))throw Error('Une pièce peut contenir au maximum 100 photos.');
   if(JSON.stringify(next)===JSON.stringify(before))return false;
   apply(next);undo.push(before);if(undo.length>50)undo.shift();redo.length=0;return true;
  },
  undo(){synchronize();if(!undo.length)return false;redo.push(snapshot());apply(undo.pop());return true;},
  redo(){synchronize();if(!redo.length)return false;undo.push(snapshot());apply(redo.pop());return true;},
  clear(){undo.length=redo.length=0;structure=JSON.stringify(property.rooms.map(room=>room.id));}
 };
};
