import test from 'node:test';
import assert from 'node:assert/strict';
import {publishSnapshot,validateTarget,isDue} from '../src/helpscout-beginner-publish.mjs';
import {SITE_ID,COLLECTION_NAME,TITLE,SLUG,SOURCE_URL,renderArticle} from '../src/helpscout-beginner-snapshot.mjs';
const CID='aaaaaaaaaaaaaaaaaaaaaaaa',AID='bbbbbbbbbbbbbbbbbbbbbbbb';
const target={siteId:SITE_ID,collectionId:CID,articleId:AID,articleTitle:TITLE};
const snapshot={checkedAt:'2026-10-02T01:00:00.000Z',expiresAt:'2026-10-03T13:00:00.000Z',counts:{shore:0,boat:0,trip:0},events:[],coverage:{first:null,last:null}};
const now='2026-10-02T02:00:00.000Z';
function mock({hasCollection=true,hasArticle=false,draft=false,publicCollection=false,concurrent=false,badReadback=false}={}){
 let collection=hasCollection?{id:CID,siteId:SITE_ID,name:COLLECTION_NAME,visibility:publicCollection?'public':'private'}:null;
 let article=hasArticle?{id:AID,collectionId:CID,name:TITLE,slug:SLUG,status:'published',hasDraft:draft,text:'<p>Source: '+SOURCE_URL+'</p>'}:null;
 let gets=0;const calls=[];
 async function request(method,p,body){calls.push({method,path:p,body});
  if(method==='GET'&&p.startsWith('/sites/'))return {site:{id:SITE_ID}};
  if(method==='GET'&&p.startsWith('/collections?'))return {collections:{page:1,pages:collection?1:0,count:collection?1:0,items:collection?[collection]:[]}};
  if(method==='POST'&&p==='/collections'){collection={id:CID,...body};return CID;}
  if(method==='GET'&&p==='/collections/'+CID)return {collection};
  if(method==='GET'&&p.startsWith('/collections/'+CID+'/articles'))return {articles:{page:1,pages:article?1:0,count:article?1:0,items:article?[{id:AID,name:TITLE}]:[]}};
  if(method==='POST'&&p==='/articles'){article={id:AID,hasDraft:false,...body};return AID;}
  if(method==='GET'&&p==='/articles/'+AID){gets++;if(concurrent&&gets===2)article.text+=' staff edit';return {article:structuredClone(article)};}
  if(method==='PUT'&&p==='/articles/'+AID){article.text=body.text+(badReadback?' changed':'');return null;}
  throw new Error('Unexpected mocked request '+method+' '+p);
 }
 return {request,calls};
}
test('requires a fixed or explicit bootstrap target',async()=>{const m=mock();await assert.rejects(()=>publishSnapshot({request:m.request,snapshot,now}),/bootstrap/);});
test('dry run never creates collection',async()=>{const m=mock({hasCollection:false});const r=await publishSnapshot({request:m.request,snapshot,bootstrap:true,now});assert.equal(r.status,'dry-run-create-collection-and-schedule');assert.ok(m.calls.every(c=>c.method==='GET'));});
test('bootstrap creates private collection and one verified schedule',async()=>{const m=mock({hasCollection:false});const r=await publishSnapshot({request:m.request,snapshot,bootstrap:true,dryRun:false,now});assert.equal(r.status,'created-and-verified');assert.equal(m.calls.find(c=>c.path==='/collections'&&c.method==='POST').body.visibility,'private');assert.equal(m.calls.filter(c=>c.path==='/articles'&&c.method==='POST').length,1);});
test('existing schedule preserved by same-day idempotency',async()=>{const m=mock({hasArticle:true});await publishSnapshot({request:m.request,snapshot,target,dryRun:false,now});const r=await publishSnapshot({request:m.request,snapshot,target,dryRun:false,now});assert.equal(r.status,'already-checked-today');assert.equal(m.calls.filter(c=>c.method==='PUT').length,1);});
test('published draft conflict blocks writes',async()=>{const m=mock({hasArticle:true,draft:true});await assert.rejects(()=>publishSnapshot({request:m.request,snapshot,target,dryRun:false,now}),/draft conflict/);assert.ok(m.calls.every(c=>c.method==='GET'));});
test('public collection is never silently changed or accepted',async()=>{const m=mock({hasArticle:true,publicCollection:true});await assert.rejects(()=>publishSnapshot({request:m.request,snapshot,target,dryRun:false,now}),/collection identity/);assert.ok(m.calls.every(c=>c.method==='GET'));});
test('backup is performed before update',async()=>{const m=mock({hasArticle:true});let backed=false;const request=async(...args)=>{if(args[0]==='PUT')assert.equal(backed,true);return m.request(...args);};await publishSnapshot({request,snapshot,target,dryRun:false,now,backup:async()=>{backed=true;}});assert.equal(backed,true);});
test('only text is updated',async()=>{const m=mock({hasArticle:true});await publishSnapshot({request:m.request,snapshot,target,dryRun:false,now});assert.deepEqual(Object.keys(m.calls.find(c=>c.method==='PUT').body),['text']);});
test('concurrent edit prevents PUT',async()=>{const m=mock({hasArticle:true,concurrent:true});await assert.rejects(()=>publishSnapshot({request:m.request,snapshot,target,dryRun:false,now}),/Concurrent/);assert.equal(m.calls.filter(c=>c.method==='PUT').length,0);});
test('readback mismatch reported, never called successful',async()=>{const m=mock({hasArticle:true,badReadback:true});await assert.rejects(()=>publishSnapshot({request:m.request,snapshot,target,dryRun:false,now}),/readback mismatch/);});
test('expired candidate rejected before API use',async()=>{const m=mock();await assert.rejects(()=>publishSnapshot({request:m.request,snapshot,bootstrap:true,now:'2026-10-04T01:00:00Z'}),/expired/);assert.equal(m.calls.length,0);});
test('target on another site rejected',()=>assert.throws(()=>validateTarget({...target,siteId:'cccccccccccccccccccccccc'})));
test('same Sydney date skips while following day is due',()=>{const a={text:renderArticle(snapshot)};assert.equal(isDue(a,now),false);assert.equal(isDue(a,'2026-10-02T15:00:00Z'),true);assert.equal(isDue(a,now,{force:true}),true);});
