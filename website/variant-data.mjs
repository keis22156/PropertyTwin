const fail=(status,message)=>{throw Object.assign(Error(message),{status});};

export function publicVariant({sessionId,shareToken,image,...variant}){
 return {...variant,revision:variant.revision||1,favorite:Boolean(variant.favorite),...(!variant.deletedAt?{image}:{label:'Version supprimée'})};
}

// A parent is selected by ID, never by a client-supplied generated image URL.
export function variantParent(db,p,s,input){
 if(!input.parentVariantId)return null;
 const parent=db.variants.find(v=>v.id===input.parentVariantId&&v.slug===p.slug&&v.room===input.room&&v.original===input.photo&&(s.agent?Boolean(v.agent):!v.agent&&v.sessionId===s.id));
 if(!parent)fail(404,'Version source introuvable.');
 if(parent.deletedAt)fail(410,'Cette version source a été supprimée. Choisissez une autre version.');
 return parent;
}

export function updateVariant(variant,request){
 if(!Number.isSafeInteger(request.revision)||request.revision<1)fail(400,'Indiquez la révision de la version.');
 const patch=request.patch;
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)fail(400,'Modification de version invalide.');
 for(const [field,value] of Object.entries(patch)){
  if(field==='label'){if(typeof value!=='string'||!value.trim()||value.trim().length>200)fail(400,'Le nom doit contenir entre 1 et 200 caractères.');}
  else if(['favorite','deleted'].includes(field)){if(typeof value!=='boolean')fail(400,'Modification de version invalide.');}
  else fail(400,'Champ de version inconnu.');
 }
 if(request.revision!==(variant.revision||1))fail(409,'Cette version a été modifiée ailleurs. Actualisez l’historique.');
 if(variant.deletedAt&&(patch.label!==undefined||patch.favorite!==undefined))fail(410,'Restaurez cette version avant de la modifier.');
 if(patch.label!==undefined)variant.label=patch.label.trim();
 if(patch.favorite!==undefined)variant.favorite=patch.favorite;
 if(patch.deleted===true){variant.deletedAt=new Date().toISOString();delete variant.shareToken;}
 if(patch.deleted===false)delete variant.deletedAt;
 variant.revision=(variant.revision||1)+1;variant.updatedAt=new Date().toISOString();
 return publicVariant(variant);
}
