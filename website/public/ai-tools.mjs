// Shared by the server and the browser bundle. No vendor or credential belongs here.
export const styles=['Contemporain','Japandi','Scandinave','Minimaliste','Parisien','Industriel','Classique','Méditerranéen'];
export const roomTypes=['Salon','Cuisine','Chambre','Bureau','Salle à manger','Salle de bain','Entrée','Extérieur'];
export const floors=['Chêne clair','Chêne foncé','Point de Hongrie','Béton ciré','Pierre','Carrelage','Moquette'];
export const walls={'Blanc cassé':'#f3efe5','Beige':'#d7c5ab','Greige':'#b7afa1','Vert olive':'#72794f','Bleu':'#526f96','Gris chaud':'#aaa29a'};
export const usages=['Bureau','Chambre bébé','Chambre enfant','Dressing','Salle de sport','Salle à manger','Salon','Chambre'];
export const renovations=['Refresh','Standard','Premium'];
export const skies=['Bleu naturel','Légèrement nuageux','Coucher de soleil'];
export const tools=[
 {action:'Meubler',label:'Meubler',fields:['roomType','style'],hint:'Ajouter du mobilier adapté sans modifier la structure.'},
 {action:'Vider la pièce',label:'Vider complètement',fields:[],hint:'Retirer les meubles et objets mobiles, conserver les finitions et équipements fixes.'},
 {action:'Ranger',label:'Ranger',fields:[],hint:'Retirer le désordre et les petits objets. Conserver les meubles principaux.'},
 {action:'Changer le sol',label:'Changer le sol',fields:['floor'],hint:'Changer uniquement le revêtement du sol.'},
 {action:'Changer les murs',label:'Changer les murs',fields:['wall','wallColor'],hint:'Changer uniquement la couleur des murs.'},
 {action:'Rénover',label:'Rénover',fields:['roomType','renovation'],hint:'Une projection visuelle des finitions, sans modifier le plan du logement.'},
 {action:'Changer le style',label:'Changer le style',fields:['style'],hint:'Faire évoluer le mobilier et la décoration dans le style choisi.'},
 {action:'Changer l’usage de la pièce',label:'Changer l’usage',fields:['usage','style'],hint:'Imaginer un nouvel usage avec du mobilier adapté.'},
 {action:'Ciel',label:'Remplacer le ciel',fields:['sky'],hint:'Modifier uniquement le ciel visible sur une photo extérieure.'},
 {action:'Day to Dusk',label:'Du jour au crépuscule',fields:[],hint:'Imaginer la lumière du soir sans changer le bâtiment ni son environnement.'},
 {action:'Image inspiration',label:'Image d’inspiration',fields:['inspiration'],hint:'Reprendre une ambiance depuis une seconde image, en conservant l’architecture de votre photo.'},
 {action:'Prompt personnalisé',label:'Prompt personnalisé',fields:[],hint:'Décrire précisément les éléments à transformer sur la photo.'},
 {action:'Supprimer un objet',label:'Gomme IA',fields:[],hint:'Sélectionner manuellement l’objet à supprimer.'}
];
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const choices={style:styles,roomType:roomTypes,floor:floors,wall:[...Object.keys(walls),'Personnalisée'],usage:usages,renovation:renovations,sky:skies};
const defaults={style:'Contemporain',roomType:'Salon',floor:'Chêne clair',wall:'Blanc cassé',renovation:'Refresh',usage:'Bureau',sky:'Bleu naturel'};

export function normalizeTool(body,{agent=true}={}){
 if(body.prompt!==undefined&&(typeof body.prompt!=='string'||body.prompt.length>1000))fail('Instruction trop longue (1 000 caractères maximum).');
 let action=body.action,legacyStyle,legacyUsage;
 if(action==='Vider')action='Vider la pièce';
 if(styles.includes(action)){legacyStyle=action;action='Changer le style';}
 if(usages.includes(action)){legacyUsage=action;action='Changer l’usage de la pièce';}
 if(action===undefined||!agent&&typeof action==='string'&&!tools.some(t=>t.action===action))action=body.prompt?.trim()?'Prompt personnalisé':'Changer le style';
 const tool=tools.find(t=>t.action===action);if(!tool)fail('Transformation inconnue.');
 if(!agent&&['Image inspiration','Supprimer un objet'].includes(action))fail('Cet outil est réservé au studio agent.');
 const prompt=(body.prompt||'').trim();if(action==='Prompt personnalisé'&&!prompt)fail('Décrivez votre idée avant de générer.');
 const values=body.options===undefined?{}:body.options;if(!values||typeof values!=='object'||Array.isArray(values))fail('Options de transformation invalides.');
 for(const key of Object.keys(values))if(!tool.fields.includes(key)||key==='inspiration')fail('Cette option ne correspond pas à la transformation choisie.');
 const options={};
 for(const key of tool.fields){
  if(!choices[key])continue;
  const value=values[key]??(key==='style'?legacyStyle: key==='usage'?legacyUsage:undefined)??defaults[key];
  if(!choices[key].includes(value))fail('Preset de transformation invalide.');options[key]=value;
 }
 if(action==='Changer les murs'){
  if(options.wall==='Personnalisée'){if(typeof values.wallColor!=='string'||!/^#[a-fA-F0-9]{6}$/.test(values.wallColor))fail('Couleur de mur invalide.');options.wallColor=values.wallColor.toLowerCase();}
  else{if(values.wallColor!==undefined&&(typeof values.wallColor!=='string'||values.wallColor.toLowerCase()!==walls[options.wall]))fail('La couleur ne correspond pas au preset de mur.');options.wallColor=walls[options.wall];}
 }
 let inspiration;
 if(action==='Image inspiration'){
  if(typeof body.inspiration!=='string'||!/^\/media\/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$/.test(body.inspiration))fail('Importez une image d’inspiration dans votre espace.');
  if(body.inspiration===body.photo)fail('Choisissez une image d’inspiration différente de la photo originale.');inspiration=body.inspiration;
 }else if(body.inspiration!==undefined)fail('L’image d’inspiration ne correspond pas à cet outil.');
 return {action,style:options.style||'',options,prompt,...(inspiration?{inspiration}:{})};
}

export function toolInstruction(input){
 if(input.quality==='hd')return 'Reproduire fidèlement cette version de la photo en haute définition. Conserver exactement sa composition, son cadrage, la géométrie, les ouvertures, le mobilier, les couleurs, les matériaux et la décoration. Améliorer uniquement les détails et la netteté naturelle. Ne refaire aucune transformation ni ajouter ou retirer aucun élément. Projection photo 2D uniquement.';
 const o=input.options||{};
 const structure='Conserver la géométrie, la perspective, les dimensions apparentes, les portes, fenêtres, ouvertures et équipements fixes de l’image originale. Ne déplacer ni ajouter aucun mur ou ouverture. Ne produire qu’une projection photo 2D.';
 const instructions={
  'Meubler':`Aménager ${o.roomType||'la pièce'} avec du mobilier proportionné. Conserver les murs et le sol existants.`,
  'Ranger':'Retirer le désordre, déchets et petits objets mobiles. Ranger les surfaces. Garder les meubles principaux, les murs et le sol tels quels.',
  'Vider la pièce':'Retirer tous les meubles et objets mobiles. Conserver exactement le sol, les murs, portes, fenêtres et équipements fixes (cuisine intégrée, sanitaires, radiateurs).',
  'Changer le sol':`Remplacer uniquement le revêtement de sol visible par ${o.floor||'le matériau demandé'}, avec une échelle et une perspective cohérentes. Conserver murs et mobilier.`,
  'Changer les murs':`Repeindre uniquement les murs visibles en ${o.wall||'la couleur demandée'}${o.wallColor?' ('+o.wallColor+')':''}. Conserver sol, mobilier, menuiseries et textures réalistes.`,
  'Changer le style':'Modifier uniquement le mobilier et la décoration. Conserver les finitions du sol et des murs, sauf demande explicite.',
  'Changer l’usage de la pièce':`Adapter le mobilier et la décoration à l’usage ${o.usage||'demandé'}. Garder le sol, les murs et la structure.`,
  'Rénover':`Projection de rénovation ${o.renovation||'Refresh'} pour ${o.roomType||'la pièce'}. ${o.renovation==='Premium'?'Imaginer des finitions et équipements haut de gamme.':o.renovation==='Standard'?'Moderniser finitions et équipements visibles.':'Rafraîchir peintures, finitions et décoration, avec des changements légers.'} Garder les emplacements des équipements fixes et des réseaux. Visualisation non contractuelle, aucun engagement de faisabilité ni devis.`,
  'Ciel':`Remplacer uniquement le ciel visible par un ciel ${o.sky||'bleu naturel'}, avec lumière cohérente. Conserver bâtiment, végétation, terrain et tous les autres éléments. S’il n’y a aucun ciel visible, conserver la photo.`,
  'Day to Dusk':'Transformer uniquement la lumière et le ciel visibles en ambiance crépusculaire naturelle. Conserver bâtiment, terrain, végétation et mobilier. Ne créer aucune fenêtre ou source lumineuse inexistante.',
  'Image inspiration':'Image 1 : photo originale du bien, seule base architecturale à conserver. Image 2 : référence d’ambiance uniquement. Transposer sa palette, son style et son mobilier dans l’image 1, sans copier la pièce, la géométrie ni les ouvertures de l’image 2.',
  'Prompt personnalisé':'Modifier uniquement les éléments de la photo décrits dans la demande, dans les limites de conservation de la structure.',
  'Supprimer un objet':'Supprimer uniquement l’objet sélectionné dans la zone blanche du masque et reconstruire naturellement son arrière-plan. Conserver les murs, le sol et tout élément hors sélection.'
 };
 return `${structure}\n${instructions[input.action]||'Modifier uniquement les éléments demandés.'}${o.style?'\nStyle : '+o.style+'.':''}`;
}

export function toolLabel(input){
 const detail=input.options?.floor||input.options?.wall||input.options?.usage||input.options?.renovation||input.options?.style||input.options?.sky;
 return input.prompt||input.action+(detail?' · '+detail:'');
}
