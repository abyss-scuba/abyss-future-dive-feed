import { SITE_ID,COLLECTION_NAME,TITLE,SLUG,SOURCE_URL,renderArticle,fingerprint,sydneyParts } from './helpscout-beginner-snapshot.mjs';
const ID=/^[a-f0-9]{24}$/;
const assert=(ok,m)=>{if(!ok)throw new Error(m);};
export function makeClient(key,fetchImpl=fetch){
 assert(key,'HELP_SCOUT_DOCS_API_KEY is not configured');
 return async(method,path,body)=>{
  const r=await fetchImpl('https://docsapi.helpscout.net/v1'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Basic '+Buffer.from(key+':X').toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert(r.ok,`Help Scout ${method} returned HTTP ${r.status}`);
  if(method==='GET')return r.json();
  if(method==='POST'){const id=r.headers.get('location')?.match(/\/([a-f0-9]{24})\/?$/)?.[1];assert(id,'Create response has no valid target ID');return id;}
  return null;
 };
}
async function list(request,path,key){
 const all=[];
 for(let page=1;page<=50;page++){
  const x=(await request('GET',path+(path.includes('?')?'&':'?')+'page='+page))[key];
  assert(x&&Array.isArray(x.items)&&x.page===page&&Number.isInteger(x.pages),'Invalid Docs pagination');
  if(page===1&&x.pages===0&&x.count===0&&x.items.length===0)return [];
  assert(x.pages>=page,'Invalid Docs page total');all.push(...x.items);
  if(x.pages===page){assert(x.count===all.length,'Incomplete Docs collection/article list');return all;}
 }
 throw new Error('Docs pagination cap exceeded');
}
export function validateTarget(t){assert(t&&ID.test(t.articleId)&&ID.test(t.collectionId)&&t.siteId===SITE_ID&&t.articleTitle===TITLE,'Invalid fixed beginner target');return t;}
export function validateArticle(a,t){
 validateTarget(t);assert(a?.id===t.articleId&&a.collectionId===t.collectionId&&a.name===TITLE&&a.slug===SLUG&&a.status==='published'&&!a.hasDraft,'Schedule identity, publication or draft conflict');
 assert(a.text?.includes(SOURCE_URL),'Unrecognised schedule body; no overwrite');return a;
}
export async function readTarget(request,t){
 validateTarget(t);const c=(await request('GET','/collections/'+t.collectionId)).collection;
 assert(c?.id===t.collectionId&&c.siteId===SITE_ID&&c.name===COLLECTION_NAME&&c.visibility==='private','Private collection identity mismatch');
 return validateArticle((await request('GET','/articles/'+t.articleId)).article,t);
}
export function isDue(a,now,{force=false}={}){
 if(force)return true;
 const checked=a.text?.match(/Checked \(ISO\):\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1];
 if(!checked)return true;
 assert(Date.parse(checked)<=Date.parse(now),'Published check time is in the future');
 return sydneyParts(checked).date!==sydneyParts(now).date;
}
export async function publishSnapshot({request,snapshot,target=null,bootstrap=false,dryRun=true,force=false,backup=async()=>{},now=new Date().toISOString()}){
 assert(Date.parse(snapshot.expiresAt)>Date.parse(now),'Candidate expired before publication');
 const text=renderArticle(snapshot);
 let current=null,t=target;
 if(t){current=await readTarget(request,t);}
 else {
  assert(bootstrap,'Fixed target missing; explicit bootstrap required');
  const site=(await request('GET','/sites/'+SITE_ID)).site;assert(site?.id===SITE_ID,'Sydney site identity mismatch');
  const cols=await list(request,'/collections?siteId='+SITE_ID+'&visibility=all','collections');
  const match=cols.filter(c=>c.name===COLLECTION_NAME);assert(match.length<=1,'Duplicate New Diver Support collections');
  let cid=match[0]?.id;
  if(!cid){if(dryRun)return {status:'dry-run-create-collection-and-schedule',target:null};cid=await request('POST','/collections',{siteId:SITE_ID,name:COLLECTION_NAME,visibility:'private',description:'Choosing and preparing for your next dive after certification'});}
  const c=(await request('GET','/collections/'+cid)).collection;
  assert(c?.id===cid&&c.siteId===SITE_ID&&c.visibility==='private'&&c.name===COLLECTION_NAME,'Collection readback mismatch');
  const refs=await list(request,'/collections/'+cid+'/articles?status=all&pageSize=100','articles');
  // Inspect only the requested small collection for title/slug collisions.
  // Other article bodies are never printed or exported.
  const articles=[];
  for(const ref of refs){assert(ID.test(ref.id),'Invalid article ID');const a=(await request('GET','/articles/'+ref.id)).article;assert(a?.id===ref.id&&a.collectionId===cid,'Article ownership mismatch');articles.push(a);}
  const matches=articles.filter(a=>a.name===TITLE||a.slug===SLUG);assert(matches.length<=1,'Duplicate schedule article');
  if(matches.length){t={siteId:SITE_ID,collectionId:cid,articleId:matches[0].id,articleTitle:TITLE};current=validateArticle(matches[0],t);}
  else {
   if(dryRun)return {status:'dry-run-create-schedule',collectionId:cid,target:null};
   const id=await request('POST','/articles',{collectionId:cid,name:TITLE,slug:SLUG,status:'published',text,keywords:['beginner dive dates','new diver dives this weekend','upcoming beginner shore dives','first boat dive dates','beginner dive trips','new diver weekday dives','beginner calendar fully booked','beginner dive availability']});
   t={siteId:SITE_ID,collectionId:cid,articleId:id,articleTitle:TITLE};
   const actual=await readTarget(request,t);assert(fingerprint(actual.text)===fingerprint(text),'Created article body readback mismatch');
   return {status:'created-and-verified',target:t,textHash:fingerprint(text)};
  }
 }
 if(!isDue(current,now,{force}))return {status:'already-checked-today',target:t,textHash:fingerprint(current.text)};
 if(dryRun)return {status:'dry-run-update',target:t};
 await backup({id:t.articleId,text:current.text,hash:fingerprint(current.text)});
 // Detect concurrent edits immediately before PUT. This API has no atomic
 // compare-and-swap; never describe this check as an absolute edit lock.
 const again=await readTarget(request,t);assert(fingerprint(again.text)===fingerprint(current.text),'Concurrent article edit detected');
 await request('PUT','/articles/'+t.articleId,{text});
 const actual=await readTarget(request,t);assert(fingerprint(actual.text)===fingerprint(text),'Published body readback mismatch; inspect before retry');
 return {status:'updated-and-verified',target:t,textHash:fingerprint(text)};
}
