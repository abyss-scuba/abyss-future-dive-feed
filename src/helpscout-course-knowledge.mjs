import {COLLECTION,check,comparable,hash,listArticles,validateCollection} from './helpscout-courses.mjs';
// Fingerprint the source separately from live Docs. Unchanged source records must
// never overwrite a colleague's newer live edits, nor block unrelated updates.
const sourceHash=a=>hash(JSON.stringify({name:a.name,text:comparable(a.text),keywords:a.keywords,categories:a.manageCategories?a.categories:null}));
export async function publishKnowledge({pack,request,previous=null,saveBackup}){
 check(pack.collectionId===COLLECTION&&pack.articles.length===({1:42,2:50}[pack.version])&&pack.articles.filter(a=>a.id).length===20,'Invalid course knowledge pack');
 await validateCollection(request);const listed=await listArticles(request),plans=[],used=new Set();
 for(const a of pack.articles){
  check(!used.has(a.name),'Duplicate planned article');used.add(a.name);
  const matches=listed.filter(x=>a.id?x.id===a.id:x.slug===a.slug||x.name===a.name);check(matches.length<2,'Ambiguous course article');check(!a.id||matches.length===1,`Original article missing: ${a.expectedName}`);
  let current=matches[0]?(await request('GET',`/articles/${matches[0].id}`)).article:null;
  const old=previous?.articles?.find(x=>x.id===current?.id);
  const unchangedSource=old&&(old.sourceHash?old.sourceHash===sourceHash(a):old.name===a.name&&old.textHash===hash(comparable(a.text)));
  if(unchangedSource){check(current.collectionId===COLLECTION,`Wrong collection: ${a.name}`);plans.push({a,current,old,preserve:true});continue;}
  if(current){check(current.collectionId===COLLECTION&&current.status==='published'&&!current.hasDraft,`Status or draft conflict: ${a.name}`);check([a.expectedName,a.name].includes(current.name),`Unexpected article title: ${a.name}`);const old=previous?.articles?.find(x=>x.id===current.id);if(old&&old.textHash!==hash(comparable(current.text))){await saveBackup([...plans.filter(p=>p.current).map(p=>p.current),current]);throw new Error(`Article was edited since last managed publication: ${a.name}`);}}
  check(!listed.some(x=>x.name===a.name&&x.id!==current?.id),`Duplicate target title: ${a.name}`);
  plans.push({a,current});
 }
 // Must persist complete originals successfully before any article mutation.
 await saveBackup(plans.filter(p=>p.current).map(p=>p.current));
 const result=[];
 for(const {a,current,old,preserve} of plans){
  if(preserve){result.push({...old,sourceHash:sourceHash(a),action:'preserved',liveTextHash:hash(comparable(current.text)),liveHasDraft:!!current.hasDraft});continue;}
  let id=current?.id;
  if(current){const fresh=(await request('GET',`/articles/${id}`)).article;check(!fresh.hasDraft&&fresh.name===current.name&&hash(comparable(fresh.text))===hash(comparable(current.text)),`Concurrent edit: ${a.name}`);await request('PUT',`/articles/${id}`,{name:a.name,text:a.text,keywords:a.keywords,...(a.manageCategories?{categories:a.categories}:{})});}
  else id=await request('POST','/articles',{collectionId:COLLECTION,status:'published',slug:a.slug,name:a.name,text:a.text,categories:a.categories,keywords:a.keywords});
  const read=(await request('GET',`/articles/${id}`)).article;
  check(read.collectionId===COLLECTION&&read.status==='published'&&read.name===a.name&&comparable(read.text)===comparable(a.text),`Article readback mismatch: ${a.name}`);
  if(!current||a.manageCategories)check(JSON.stringify([...(read.categories||[])].sort())===JSON.stringify([...a.categories].sort()),`Category readback mismatch: ${a.name}`);
  result.push({id,name:a.name,slug:read.slug,plannedSlug:a.slug,textHash:hash(comparable(read.text)),sourceHash:sourceHash(a),action:'published-and-read-back'});
 }
 return result;
}
