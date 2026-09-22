const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(process.argv[2]);
const deps='/private/tmp/settler-gallery-release-20260921/node_modules';
const ts=require(deps+'/typescript'),React=require(deps+'/react');
let calls=[],failFeed=false;
const mocks={
 'react':React,
 'next/navigation':{useSearchParams:()=>new URLSearchParams()},
 'next/form':{default:({children,...p})=>React.createElement('form',p,children)},
 'next/link':{default:({children,...p})=>React.createElement('a',p,children)},
 '@/components/EnglishListingCard':{EnglishListingCard:({listing})=>React.createElement('article',{'data-test-id':listing.id},'Fixture rental')},
 '@/components/ResultFocusRestorer':{ResultFocusRestorer:()=>null},
 '@/lib/listings':{fetchFeed:async f=>{calls.push(f);if(failFeed)throw Error('fixture dependency failure');return {total:49,page:f.page,pageCount:3,listings:[{id:123}],cardImages:new Map()};},fetchDistrictCounts:async()=>({saburtalo:20,vake:10})},
 '@/lib/returnContext':{encodeReturnContext:(lang,p)=>JSON.stringify({lang,...p})},
};
function load(file){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,require:n=>mocks[n]||(n==='react/jsx-runtime'?require(deps+'/react/jsx-runtime'):n.startsWith('@/')?load(path.join(root,n.slice(2)+(fs.existsSync(path.join(root,n.slice(2)+'.ts'))?'.ts':'.tsx'))):require(n))},{filename:file});return module.exports;}
mocks['@/lib/districts']=load(root+'/lib/districts.ts');
const Page=load(root+'/app/(en)/en/rent/page.tsx').default;
function flatten(v,out=[]){if(Array.isArray(v))v.forEach(x=>flatten(x,out));else if(v&&typeof v==='object'){out.push(v);flatten(v.props?.children,out);}return out;}
function text(v){if(Array.isArray(v))return v.map(text).join(' ');if(v&&typeof v==='object')return text(v.props?.children);return typeof v==='string'||typeof v==='number'?String(v):'';}
const checks=[];function check(name,ok,extra){checks.push({name,pass:!!ok,...(extra?{detail:extra}:{})});}
async function render(p){calls=[];const tree=await Page({searchParams:Promise.resolve(p)});return {tree,nodes:flatten(tree),body:text(tree),calls:[...calls]};}
(async()=>{
for(const params of [{max:'1'},{max:'49'},{max:'50001'},{max:'-1'},{max:'abc'},{max:'1.5'},{max:'1e3'},{min:'700',max:'400'}]){
const r=await render(params),label=JSON.stringify(params);
check('invalid suppresses feed '+label,r.calls.length===0);
check('invalid suppresses successful results '+label,!r.body.includes('current rental listings')&&!r.body.includes('No matching rentals')&&!r.nodes.some(n=>n.type===mocks['@/components/EnglishListingCard'].EnglishListingCard));
check('invalid visible validation '+label,r.nodes.some(n=>n.props?.role==='alert')&&/price|minimum|maximum|number|valid/i.test(r.body));
for(const [k,v]of Object.entries(params)){const input=r.nodes.find(n=>n.type==='input'&&n.props.name===k);check('invalid raw retained '+label+' '+k,String(input?.props.defaultValue??input?.props.value??'')===v);}
}
for(const params of [{},{min:''},{min:'50'},{max:'50000'},{min:'50',max:'50'},{district:'saburtalo',rooms:'2',min:'400',max:'700',page:'2'}]){
const r=await render(params),f=r.calls[0];check('valid feed '+JSON.stringify(params),r.calls.length===1&&r.body.includes('current rental listings'));
if(params.min)check('valid min honored',f?.minPrice===Number(params.min));if(params.max)check('valid max honored',f?.maxPrice===Number(params.max));
if(params.page){check('valid page honored',f?.page===2&&f.rooms==='2'&&f.districts?.[0]==='saburtalo'); const hrefs=r.nodes.filter(n=>n.props?.href).map(n=>n.props.href);check('pagination preserves filters',hrefs.some(h=>h.includes('district=saburtalo')&&h.includes('rooms=2')&&h.includes('min=400')&&h.includes('max=700')&&h.includes('page=3')));}
}
failFeed=true;const failed=await render({max:'700'});check('backend error remains distinct',failed.body.includes('Listings could not be loaded')&&!failed.body.includes('current rental listings'));failFeed=false;
console.log(JSON.stringify({root,checks,passed:checks.filter(c=>c.pass).length,total:checks.length,limitations:['Page React tree and stubbed data dependencies; not browser hydration/navigation or live data.']},null,2));process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=2;});
