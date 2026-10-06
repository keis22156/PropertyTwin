window.PropertyTwinRoomplan=({root,load,onRoom,onLoad=()=>{}})=>{
 const button=document.createElement('button');button.type='button';button.className='agent-primary';button.textContent='Explorer le RoomPlan';
 const stage=document.createElement('div'),status=document.createElement('p');status.setAttribute('role','status');root.replaceChildren(button,status,stage);
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;button.textContent='Chargement du RoomPlan…';status.textContent='La structure du logement se prépare…';
  let viewer;
  try{
   const data=await load();if(!root.isConnected)return;if(!data.roomplan)throw Error('Aucune structure RoomPlan compatible disponible.');
   const module=await import('/roomplan-viewer.js');if(!root.isConnected)return;
   viewer=module.mountRoomplan(stage,data.roomplan,{onRoom});stage.roomplanViewer=viewer;status.textContent='';button.hidden=true;onLoad();
  }catch(error){viewer?.dispose();stage.replaceChildren();status.textContent=error.message||'Le RoomPlan est indisponible. Réessayez.';button.textContent='Réessayer le RoomPlan';}
  finally{button.disabled=false;}
 };
};
