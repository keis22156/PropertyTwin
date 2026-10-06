window.PropertyTwinStudioForm=function({form,draft,onGenerate,onErase,onUpload}){
 const c=window.PropertyTwinAITools;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const select=(name,label,values)=>`<label data-tool-field="${name}">${label}<select name="${name}">${values.map(value=>`<option ${value===draft[name]?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`;
 draft.action||='Meubler';draft.prompt??='';
 form.innerHTML=`<label>Transformation<select name="action">${c.tools.filter(t=>t.action!=='Supprimer un objet').map(t=>`<option value="${esc(t.action)}" ${t.action===draft.action?'selected':''}>${esc(t.label)}</option>`).join('')}</select></label><p id="studio-tool-hint" class="studio-tool-hint"></p>
 <div class="studio-tool-fields">${select('roomType','Type de pièce',c.roomTypes)}${select('style','Style',c.styles)}${select('floor','Revêtement du sol',c.floors)}${select('wall','Couleur des murs',[...Object.keys(c.walls),'Personnalisée'])}<label data-tool-field="wallColor">Couleur personnalisée<input name="wallColor" type="color" value="${esc(draft.wallColor||c.walls[draft.wall]||c.walls['Blanc cassé'])}"></label>${select('usage','Nouvel usage',c.usages)}${select('renovation','Niveau de rénovation',c.renovations)}${select('sky','Ambiance du ciel',c.skies)}</div>
 <div data-tool-field="inspiration" class="studio-inspiration"><label>Image d’inspiration<input id="studio-inspiration-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><div id="studio-inspiration-preview"></div><p class="studio-tool-hint">L’image guide l’ambiance, la palette et le mobilier. L’architecture de votre photo reste la référence.</p></div>
 <label><span id="studio-prompt-label">Votre instruction (facultatif)</span><textarea name="prompt" maxlength="1000" placeholder="Décrivez votre idée">${esc(draft.prompt)}</textarea></label><p id="studio-renovation-notice" class="studio-tool-notice" hidden>Visualisation non contractuelle. Cette projection ne constitue ni un devis ni une validation de faisabilité.</p><button class="agent-primary" data-generate>Générer la transformation ✧</button><button type="button" id="clear-studio-inspiration" hidden>Retirer l’inspiration</button><button id="magic-eraser" type="button">Gomme IA · sélectionner un objet</button><p class="muted">Crédits restants : <span data-studio-credits></span>. La photo originale est conservée.</p><p id="agent-ai-message" role="status"></p>`;
 const field=name=>form.elements.namedItem(name);
 const preview=()=>{
  form.querySelector('#studio-inspiration-preview').innerHTML=draft.inspiration?`<img src="${esc(draft.inspiration)}" alt="Image d’inspiration importée">`:'<p>Aucune image sélectionnée.</p>';
  form.querySelector('#clear-studio-inspiration').hidden=draft.action!=='Image inspiration'||!draft.inspiration;
 };
 const update=()=>{
  const tool=c.tools.find(t=>t.action===draft.action);
  form.querySelectorAll('[data-tool-field]').forEach(label=>{const active=tool.fields.includes(label.dataset.toolField);label.hidden=!active;label.querySelectorAll('input,select').forEach(input=>input.disabled=!active);});
  form.querySelector('#studio-tool-hint').textContent=tool.hint;
  field('prompt').required=draft.action==='Prompt personnalisé';
  form.querySelector('#studio-prompt-label').textContent=field('prompt').required?'Décrivez votre idée':'Votre instruction (facultatif)';
  form.querySelector('#studio-renovation-notice').hidden=draft.action!=='Rénover';preview();
 };
 const collect=()=>{for(const name of ['action','prompt','roomType','style','floor','wall','wallColor','usage','renovation','sky'])draft[name]=field(name).value;};
 form.addEventListener('input',event=>{
  if(event.target.name==='wallColor'){field('wall').value='Personnalisée';}
  collect();if(event.target.name==='wallColor')update();
 });
 form.addEventListener('change',event=>{
  if(event.target.name==='wall'&&c.walls[event.target.value])field('wallColor').value=c.walls[event.target.value];
  collect();update();
 });
 let uploading=false;
 field('action').onchange=()=>{collect();update();};
 form.querySelector('#studio-inspiration-upload').onchange=async event=>{
  const file=event.target.files[0];if(!file||uploading)return;uploading=true;event.target.disabled=true;
  const message=form.querySelector('#agent-ai-message');message.textContent='Import de l’inspiration…';
  try{const result=await onUpload(file);draft.inspiration=result.url;preview();message.textContent='Inspiration importée.';}
  catch(error){message.textContent=error.message||'L’import a échoué. Réessayez.';}
  finally{uploading=false;event.target.disabled=draft.action!=='Image inspiration';event.target.value='';}
 };
 form.querySelector('#clear-studio-inspiration').onclick=()=>{delete draft.inspiration;preview();};
 form.querySelector('#magic-eraser').onclick=onErase;
 form.onsubmit=async event=>{
  event.preventDefault();collect();if(uploading)return;
  const tool=c.tools.find(t=>t.action===draft.action),options={};
  for(const key of tool.fields)if(key!=='inspiration')options[key]=draft[key];
  const payload={action:draft.action,prompt:draft.prompt,options,...(draft.action==='Image inspiration'?{inspiration:draft.inspiration}: {})};
  try{c.normalizeTool(payload);await onGenerate(payload);}
  catch(error){form.querySelector('#agent-ai-message').textContent=error.message||'La transformation n’a pas abouti.';}
 };
 collect();update();
};
