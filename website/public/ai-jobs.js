window.PropertyTwinAIJobs={
 key:()=>crypto.randomUUID().replaceAll('-',''),
 async wait(initial,load,{onState=()=>{},alive=()=>true}={}){
  // Immediate results preserve compatibility with older endpoints.
  if(!initial.job)return initial;
  let job=initial.job,failures=0;
  while(alive()){
   onState(job);
   if(job.status==='completed'){
    if(!job.result)throw Error('Le résultat de cette transformation est indisponible.');
    return {...job.result,credits:job.credits};
   }
   if(job.status==='failed')throw Object.assign(Error(job.message||'La transformation a échoué.'),{jobTerminal:true});
   if(!['queued','processing'].includes(job.status))throw Error('État de transformation invalide.');
   await new Promise(resolve=>setTimeout(resolve,1000));
   if(!alive())throw Error('Suivi interrompu. Retrouvez votre transformation à la prochaine connexion.');
   try{
    const result=await load(job.id);
    const fresh=result.jobs?.find(item=>item.id===job.id);
    if(!fresh)throw Error('Transformation introuvable.');
    job=fresh;failures=0;
   }catch(error){
    if(error.status===401||error.status===403||++failures>=5)throw Error('Le suivi est momentanément indisponible. Votre tâche reste enregistrée ; actualisez pour la retrouver.',{cause:error});
   }
  }
  throw Error('Suivi interrompu.');
 }
};
