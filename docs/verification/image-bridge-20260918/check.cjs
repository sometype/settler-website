// Independent transaction-bound regression probe. No network or production writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || '.');
const route = process.argv[3] || path.join(root, 'app/img/[id]/[pos]/route.ts');
const source = fs.readFileSync(route, 'utf8');
const ts = require(require.resolve('typescript', {paths:[root]}));
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const NOW = Date.parse('2026-09-18T06:39:00Z');
const stored = 'myhome/26084143/5.webp';
const origin = 'https://approved-storage.example';
const sourceUrl = 'https://static.my.ge/fixture.webp';
const young = {source_url:sourceUrl,stored_path:stored,created_at:new Date(NOW-16*60000).toISOString()};
const primary = {IMAGE_CDN_BASE_URL:origin};
const emergency = {IMAGE_CDN_FALLBACK_BASE_URL:origin,IMAGE_CDN_FALLBACK_EXPIRES_AT:new Date(NOW+3600000).toISOString()};
async function run(row, env, outcome) {
  const calls=[];
  const query={select(){return this},eq(){return this},async maybeSingle(){return {data:row,error:null}}};
  class Clock extends Date { static now(){return NOW} }
  const module={exports:{}};
  const context={module,exports:module.exports,URL,Response,AbortSignal,Date:Clock,process:{env:{IMAGE_SYNC_INTERVAL_MIN:'10',...env}},
    require(name){if(name==='@/lib/supabase')return {getSupabase:()=>({from(table){assert.equal(table,'listing_images');return query}})};throw Error('Unexpected import '+name)},
    async fetch(url){calls.push(String(url));assert.equal(String(url),sourceUrl,'No arbitrary or storage fetch');if(outcome==='throw')throw Error('simulated transport failure');return outcome==='healthy'?new Response('fixture-image-bytes',{status:200,headers:{'Content-Type':'image/webp'}}):new Response(null,{status:404})}}
  vm.runInNewContext(js,context,{timeout:3000});
  const response=await module.exports.GET({}, {params:Promise.resolve({id:'29592',pos:'5'})});
  return {response,calls};
}
const cases=[];
function test(name,fn){cases.push({name,fn})}
function redirect(r,status){assert.equal(r.status,status);assert.equal(r.headers.get('location'),origin+'/'+stored)}
function unavailable(r){assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('retry-after'),'60');assert.equal(r.headers.get('location'),null)}
test('healthy young bridge remains 200, bytes/type/cache unchanged',async()=>{const {response:r,calls}=await run(young,primary,'healthy');assert.equal(r.status,200);assert.equal(await r.text(),'fixture-image-bytes');assert.equal(r.headers.get('content-type'),'image/webp');assert.equal(r.headers.get('cache-control'),'public, max-age=60, s-maxage=60');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('location'),null);assert.equal(calls.length,1)});
for(const [label,env,outcome] of [['primary',primary,'404'],['emergency',emergency,'404'],['transport failure',emergency,'throw']])test('failed young bridge uses 307 no-store: '+label,async()=>{const {response:r,calls}=await run(young,env,outcome);redirect(r,307);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(calls.length,1)});
for(const [label,env] of [['missing',{}],['invalid',{IMAGE_CDN_BASE_URL:'http://untrusted.example'}],['expired',{...emergency,IMAGE_CDN_FALLBACK_EXPIRES_AT:new Date(NOW-1).toISOString()}]])test('failed young bridge without valid authority returns 503: '+label,async()=>{const {response:r}=await run(young,env,'404');unavailable(r)});
test('old stored image remains 308, no upstream fetch',async()=>{const {response:r,calls}=await run({...young,created_at:new Date(NOW-60*60000).toISOString()},primary,'404');redirect(r,308);assert.equal(calls.length,0)});
test('legacy no-stored image still proxies upstream with existing cache',async()=>{const {response:r,calls}=await run({...young,stored_path:null},{},'healthy');assert.equal(r.status,200);assert.equal(await r.text(),'fixture-image-bytes');assert.equal(r.headers.get('cache-control'),'public, max-age=3600, s-maxage=3600, stale-while-revalidate=300');assert.equal(r.headers.get('location'),null);assert.equal(calls.length,1)});
test('legacy upstream failure remains 404 even with storage authority',async()=>{const {response:r}=await run({...young,stored_path:null},primary,'404');assert.equal(r.status,404);assert.equal(r.headers.get('location'),null)});
(async()=>{const results=[];for(const {name,fn} of cases){try{await fn();results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',error:e.message})}}console.log(JSON.stringify({route,sha256:crypto.createHash('sha256').update(source).digest('hex'),results},null,2));process.exitCode=results.some(x=>x.status==='FAIL')?1:0})().catch(e=>{console.error(e);process.exitCode=2});
