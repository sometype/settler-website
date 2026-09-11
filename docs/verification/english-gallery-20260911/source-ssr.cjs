// Independent structural supplement. Does not certify browser interaction.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2]);
const mode = process.argv[3];
if (!['baseline', 'candidate'].includes(mode)) throw Error('Expected baseline|candidate');
const baseline = '3b0d4ae91791d01bf2d6f269418ce8d656426997';
const read = p => mode === 'baseline'
  ? cp.execFileSync('git', ['show', `${baseline}:${p}`], {cwd:root, encoding:'utf8'})
  : fs.readFileSync(path.join(root,p),'utf8');
const dep = name => require(require.resolve(name,{paths:[root]}));
const ts=dep('typescript'), React=dep('react'), {renderToStaticMarkup}=dep('react-dom/server');
const hashes={};
function compile(source,p) {
  hashes[p]=crypto.createHash('sha256').update(source).digest('hex');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  function localRequire(s) {
    if (s.startsWith('@/') || s.startsWith('.')) {
      const base=s.startsWith('@/')?s.slice(2):path.posix.join(path.posix.dirname(p),s);
      for (const ext of ['','.tsx','.ts']) { try { const src=read(base+ext); return compile(src,base+ext); } catch(e) { if(e.code!=='ENOENT' && !String(e.message).includes('git show')) throw e; } }
      throw Error(`Unresolved ${s}`);
    }
    return dep(s);
  }
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`,{}, {timeout:3000})(localRequire,module,module.exports);
  return module.exports;
}
const pagePath='app/(en)/en/listing/[id]/page.tsx';
const page=read(pagePath);
let Gallery;
if(mode==='baseline') {
  const start=page.indexOf('          <div className="relative aspect-[4/3]');
  const end=page.indexOf('          <header',start);
  if(start<0 || end<0) throw Error('Baseline extraction boundary drift');
  Gallery=compile('import {EnglishListingImage} from "@/components/EnglishListingImage"; import {resolveImageUrl} from "@/lib/images"; export function Baseline({images,alt}) {const facts={title:alt}; return <>'+page.slice(start,end)+'</>;}','baseline-exact-gallery.tsx').Baseline;
} else Gallery=compile(read('components/EnglishGallery.tsx'),'components/EnglishGallery.tsx').EnglishGallery;
const results=[];
function check(name,fn){try{if(!fn())throw Error('assertion false');results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
const fixtures=[0,1,13].map(n=>Array.from({length:n},(_,position)=>({listing_id:999999,position,is_main:position===0})));
const rendered=fixtures.map(images=>renderToStaticMarkup(React.createElement(Gallery,{images,alt:'Apartment in Tbilisi'})));
const buttons=[...rendered[2].matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(x=>x[0]);
check('13 selectable photos including first and beyond index 10',()=>buttons.length===13 && buttons.every((b,i)=>b.includes(`/img/999999/${i}"`)));
check('exactly one initial selection; English accessible button names',()=>buttons.length===13 && buttons.filter(b=>b.includes('aria-pressed="true"')).length===1 && buttons.every(b=>/aria-label="[^"\u10A0-\u10FF]+"/.test(b)&&/aria-pressed="(?:true|false)"/.test(b)));
check('zero-photo English placeholder, no images or selectors',()=>rendered[0].includes('No photo available')&&!/<img\b|<button\b/.test(rendered[0]));
check('single image has healthy initial source, no unusable selector',()=>rendered[1].includes('/img/999999/0')&&!/<button\b[^>]*disabled/.test(rendered[1]));
check('no Georgian in synthetic gallery output; every image has English alt',()=>rendered.every(s=>!/[\u10A0-\u10FF]/.test(s)&&[...s.matchAll(/<img\b[^>]*>/g)].every(m=>/alt="[^"\u10A0-\u10FF]+"/.test(m[0]))));
check('English page wires gallery with listing reset key',()=>/<EnglishGallery\b/.test(page)&&/key=\{listing\.id\}/.test(page));
const protectedPaths=['components/Gallery.tsx','app/(ka)/listing/[id]/page.tsx','components/EnglishContact.tsx','lib/english-agent-contact.ts','lib/images.ts','lib/listings.ts'];
check('protected Georgian/contact/image/data source parity',()=>protectedPaths.every(p=>read(p)===cp.execFileSync('git',['show',`${baseline}:${p}`],{cwd:root,encoding:'utf8'})));
console.log(JSON.stringify({mode,baseline,head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),hashes,results,limitations:'SSR only: selection, keyboard, failed-image recovery and layout require CUA; no overall verdict.'},null,2));
process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
