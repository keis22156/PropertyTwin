import {readFile,writeFile} from 'node:fs/promises';
const publicRoot=new URL('../public/',import.meta.url);
const tools=await readFile(new URL('ai-tools.mjs',publicRoot),'utf8');
// The import-free shared module is also exposed to the existing classic browser bundle.
const browserTools='(()=>{\n'+tools.replace(/^export /gm,'')+'\nwindow.PropertyTwinAITools={styles,roomTypes,floors,walls,usages,renovations,skies,tools,normalizeTool};\n})();\n';
for(const [output,sources] of [['app.js',['auth.js','platform-admin.js','roomplan-ui.js','ai-jobs.js','photo-library.js','photo-editor.js','mask-editor.js','studio-form.js','variant-history.js','dashboard.js','experience.js']],['style.css',['experience.css','dashboard.css']]]){
 const contents=await Promise.all(sources.map(name=>readFile(new URL(name,publicRoot),'utf8')));
 await writeFile(new URL(output,publicRoot),(output==='app.js'?browserTools:'')+contents.join('\n'));
}
