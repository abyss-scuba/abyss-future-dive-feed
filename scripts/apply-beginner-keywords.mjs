/** Owner-authorised, fixed-target Keywords-only update. No article text is written or exported. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const ID=/^[0-9a-f]{24}$/;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ensure=(ok,msg)=>{if(!ok)throw new Error(msg);};
const keys=a=>a.keywords??[];
const bodyState=a=>({id:a.id,collectionId:a.collectionId,name:a.name,slug:a.slug,status:a.status,hasDraft:a.hasDraft,text:a.text});
export function validatePlan(p){
 ensure(p?.siteId==='5d0ed4d02c7d3a6ebd2268ed'&&p.collectionId==='6abf61e6c3e570044c2891ed','Wrong fixed site or collection');
 ensure(Array.isArray(p.articles)&&p.articles.length===4,'Expected four requested articles');
 const ids=new Set(),terms=new Set();
 for(const a of p.articles){
  ensure(ID.test(a.id)&&!ids.has(a.id)&&a.title,'Invalid or duplicate target');ids.add(a.id);
  ensure(Array.isArray(a.keywords)&&a.keywords.length>=10&&a.keywords.length<=25,'Invalid keyword set');
  for(const k of a.keywords){ensure(typeof k==='string'&&k.trim()===k&&k.length>2&&!/[\n,;]/.test(k),'Invalid individual phrase');const n=k.toLowerCase();ensure(!terms.has(n),'Duplicate exact phrase across requested articles');terms.add(n);}
 }
 return p;
}
export async function applyKeywords({request,plan,publish=false,backup=async()=>{}}){
 validatePlan(plan);
 const c=(await request('GET',`/collections/${plan.collectionId}`)).collection;
 ensure(c?.id===plan.collectionId&&c.siteId===plan.siteId&&c.name==='New Diver Support'&&c.visibility==='private','Collection identity or privacy mismatch');
 const records=[];
 // Preflight every fixed target before making any write.
 for(const t of plan.articles){
  const a=(await request('GET',`/articles/${t.id}`)).article;
  ensure(a?.id===t.id&&a.collectionId===plan.collectionId&&a.name===t.title,'Article identity mismatch');
  ensure(['published','notpublished'].includes(a.status),'Unknown article status');
  ensure(typeof a.text==='string'&&Array.isArray(keys(a)),'Invalid article response');
  records.push({t,a});
 }
 const result=[];
 for(const {t,a} of records){
  const words=a.text.replace(/<[^>]*>/g,' ').trim().split(/\s+/).filter(Boolean).length;
  const summary={id:t.id,title:t.title,status:a.status,hasDraft:!!a.hasDraft,beforeCount:keys(a).length,requestedCount:t.keywords.length};
  // Never publish a draft or attach a large keyword set to a missing article body.
  if(a.hasDraft||a.status!=='published'||words<80){result.push({...summary,action:'blocked-unpublished-draft-or-incomplete-body',verified:false});continue;}
  if(hash(keys(a))===hash(t.keywords)){result.push({...summary,action:'already-matched',afterCount:keys(a).length,verified:true,bodyUnchanged:true});continue;}
  if(!publish){result.push({...summary,action:'dry-run-change',verified:false});continue;}
  await backup({id:t.id,keywords:keys(a)});
  const again=(await request('GET',`/articles/${t.id}`)).article;
  ensure(hash(bodyState(again))===hash(bodyState(a))&&hash(keys(again))===hash(keys(a)),'Concurrent article change; no overwrite');
  await request('PUT',`/articles/${t.id}`,{keywords:t.keywords});
  const after=(await request('GET',`/articles/${t.id}`)).article;
  ensure(hash(bodyState(after))===hash(bodyState(a)),'Body/status changed during metadata update; inspect live article');
  ensure(hash(after.keywords)===hash(t.keywords),'Keyword readback mismatch');
  result.push({...summary,action:'updated-and-verified',afterCount:after.keywords.length,verified:true,bodyUnchanged:true});
 }
 return result;
}
async function main(){
 const key=process.env.HELP_SCOUT_DOCS_API_KEY;ensure(key,'Docs credential missing');
 const request=async(method,resource,body)=>{
  const r=await fetch('https://docsapi.helpscout.net/v1'+resource,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Basic '+Buffer.from(key+':X').toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  ensure(r.ok,`Docs request failed (${r.status})`);return method==='GET'?r.json():null;
 };
 const plan=JSON.parse(await fs.readFile('data/beginner-keyword-plan.json','utf8'));
 const dir=process.env.RUNNER_TEMP||process.cwd();const backupFile=path.join(dir,'beginner-keyword-backup.json');const backups=[];
 const report={checkedAt:new Date().toISOString(),mode:process.env.PUBLISH_KEYWORDS==='true'?'publish':'dry-run',results:[]};
 try{
  report.results=await applyKeywords({request,plan,publish:process.env.PUBLISH_KEYWORDS==='true',backup:async item=>{backups.push(item);await fs.writeFile(backupFile,JSON.stringify(backups),{mode:0o600});}});
  report.completedAt=new Date().toISOString();
  // Only expected IDs, counts, flags and actions are exported. No private text/old keywords.
  await fs.mkdir('diagnostics/beginner-keywords',{recursive:true});
  await fs.writeFile('diagnostics/beginner-keywords/status.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(report.results.some(r=>r.action.startsWith('blocked')))process.exitCode=2;
 }finally{await fs.rm(backupFile,{force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Keywords update stopped; inspect the fixed targets before retrying. No private body or credentials logged.');process.exitCode=1;});
