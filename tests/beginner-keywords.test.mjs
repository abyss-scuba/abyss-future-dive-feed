import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyKeywords,validatePlan} from '../scripts/apply-beginner-keywords.mjs';
const plan=JSON.parse(fs.readFileSync(new URL('../data/beginner-keyword-plan.json',import.meta.url),'utf8'));
function fixture(change={}){
 const store=new Map(plan.articles.map(t=>[t.id,{id:t.id,collectionId:plan.collectionId,name:t.title,slug:t.id,status:'published',hasDraft:false,text:('A useful diving explanation. ').repeat(30),keywords:['old phrase'],...change}]));
 const puts=[];let reads=0;
 const request=async(m,p,b)=>{
  if(p.startsWith('/collections/'))return {collection:{id:plan.collectionId,siteId:plan.siteId,name:'New Diver Support',visibility:'private'}};
  const id=p.split('/')[2];
  if(m==='GET'){reads++;return {article:structuredClone(store.get(id))};}
  assert.equal(m,'PUT');assert.deepEqual(Object.keys(b),['keywords']);puts.push({id,b});store.get(id).keywords=structuredClone(b.keywords);return null;
 };
 return {store,puts,request,get reads(){return reads;}};
}
test('plan has 72 distinct phrases for four fixed articles',()=>{validatePlan(plan);assert.equal(plan.articles.flatMap(a=>a.keywords).length,72);});
test('reject wrong collection before read',()=>{assert.throws(()=>validatePlan({...plan,collectionId:'a'.repeat(24)}));});
test('reject exact duplicates across target articles',()=>{const p=structuredClone(plan);p.articles[1].keywords[0]=p.articles[0].keywords[0];assert.throws(()=>validatePlan(p));});
test('reject semicolon list disguised as one phrase',()=>{const p=structuredClone(plan);p.articles[0].keywords[0]='one; two';assert.throws(()=>validatePlan(p));});
test('dry run performs no write',async()=>{const f=fixture();const r=await applyKeywords({request:f.request,plan});assert.equal(f.puts.length,0);assert.equal(r.length,4);});
test('keyword writes preserve body and publish status and verify arrays',async()=>{const f=fixture();let backups=0;const r=await applyKeywords({request:f.request,plan,publish:true,backup:async()=>{backups++;}});assert.equal(f.puts.length,4);assert.equal(backups,4);assert.ok(r.every(x=>x.verified&&x.bodyUnchanged));});
test('second application is idempotent',async()=>{const f=fixture();await applyKeywords({request:f.request,plan,publish:true});const before=f.puts.length;const r=await applyKeywords({request:f.request,plan,publish:true});assert.equal(f.puts.length,before);assert.ok(r.every(x=>x.action==='already-matched'));});
test('draft or unpublished articles are not changed',async()=>{for(const state of [{hasDraft:true},{status:'notpublished'},{text:''}]){const f=fixture(state);const r=await applyKeywords({request:f.request,plan,publish:true});assert.equal(f.puts.length,0);assert.ok(r.every(x=>!x.verified));}});
test('identity conflict stops all writes',async()=>{const f=fixture();f.store.get(plan.articles.at(-1).id).name='Another article';await assert.rejects(applyKeywords({request:f.request,plan,publish:true}));assert.equal(f.puts.length,0);});
test('wrong collection privacy stops writes',async()=>{const f=fixture();const request=async(m,p,b)=>p.startsWith('/collections/')?{collection:{id:plan.collectionId,siteId:plan.siteId,name:'New Diver Support',visibility:'public'}}:f.request(m,p,b);await assert.rejects(applyKeywords({request,plan,publish:true}));assert.equal(f.puts.length,0);});
test('concurrent body edit stops metadata update',async()=>{const f=fixture();const request=async(m,p,b)=>{if(m==='GET'&&p===`/articles/${plan.articles[0].id}`&&f.reads>=4)f.store.get(plan.articles[0].id).text+='Changed';return f.request(m,p,b);};await assert.rejects(applyKeywords({request,plan,publish:true}));assert.equal(f.puts.length,0);});
test('unset keyword array is treated as empty without losing body',async()=>{const f=fixture({keywords:null});const r=await applyKeywords({request:f.request,plan,publish:true});assert.equal(f.puts.length,4);assert.ok(r.every(x=>x.beforeCount===0&&x.verified));});
