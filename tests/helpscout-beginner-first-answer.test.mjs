import test from 'node:test';import assert from 'node:assert/strict';
import {firstAnswerWindow,stripOptions,insertOptions,renderFirstAnswerOptions,firstAnswerOptionsAreCurrent,publishFirstAnswerOptions,SOURCE} from '../src/helpscout-beginner-first-answer.mjs';
const checkedAt='2026-10-02T22:00:00.000Z',expiresAt='2026-10-04T10:00:00.000Z';
const ev=(id,date,time,instant)=>({id,startDate:date,time,startInstant:instant,availability:'check_availability',bookingUrl:'https://www.abyss.com.au/charters/guided-shore-dives?q='+id});
const snap=()=>({source:SOURCE,checkedAt,expiresAt,events:[ev('oak','2026-10-09','10:00','2026-10-08T23:00:00Z'),ev('bare','2026-10-04','09:00','2026-10-03T22:00:00Z'),ev('far','2026-10-31','08:00','2026-10-30T21:00:00Z')]});
const choices=s=>({primary:[{site:{name:'Oak Park',kind:'shore',why:'A shallow reef outing.'},event:s.events[0]}],boat:null});
const support='6abf61e6c3e570044c2891ed',cal='6ab98d4249f1bc2c6aefca54',buddy='aaaaaaaaaaaaaaaaaaaaaaaa';
const ids=['6abf76557cdaed3f1efa5fa0','6abf7841c3e570044c28921f',buddy];
const names=['Scuba equipment hire and the total cost of your dive','Nervous about your next dive? Support, pace and extra help','Can I join a Sydney guided dive without bringing a buddy?'];
function mock({draftIndex=-1,ambiguous=false,concurrent=false}={}){
 const data=new Map(ids.map((id,i)=>[id,{id,collectionId:i===1?support:cal,name:names[i],number:[429,430,276][i],status:'published',hasDraft:i===draftIndex,slug:'unchanged',keywords:['unchanged'],text:'<h2>Existing first FAQ?</h2><p>Original facts and safeguards remain.</p><h2>Other FAQ?</h2><p>Also preserved.</p>'}]));let writes=0,gets=0;
 return {data,writes:()=>writes,request:async(method,url,body)=>{
  if(url.includes('/articles?'))return {articles:{page:1,pages:1,items:[{id:buddy,name:names[2]},...(ambiguous?[{id:'bbbbbbbbbbbbbbbbbbbbbbbb',name:names[2]}]:[])]}};
  if(url.startsWith('/collections/'))return {collection:{id:url.split('/')[2],siteId:'5d0ed4d02c7d3a6ebd2268ed',visibility:'private'}};
  const id=url.split('/')[2],a=data.get(id);assert.ok(a);
  if(method==='GET'){gets++;if(concurrent&&gets===4)a.text+='concurrent edit';return {article:structuredClone(a)};}
  assert.equal(method,'PUT');assert.deepEqual(Object.keys(body),['text']);a.text=body.text;writes++;
 }};
}
test('14-day window excludes later options but leaves canonical snapshot intact',()=>{const s=snap(),w=firstAnswerWindow(s);assert.deepEqual(w.events.map(x=>x.id),['oak','bare']);assert.equal(s.events.length,3);});
test('boundary uses Sydney wall-clock time across DST',()=>{const s=snap();s.events=[ev('inside','2026-10-17','08:00','2026-10-16T21:00:00Z'),ev('outside','2026-10-17','08:01','2026-10-16T21:01:00Z')];assert.deepEqual(firstAnswerWindow(s).events.map(x=>x.id),['inside']);});
test('window is measured from now, not check timestamp',()=>{const s=snap();s.events=[ev('inside','2026-10-18','08:00','2026-10-17T21:00:00Z')];assert.equal(firstAnswerWindow(s).events.length,0);assert.equal(firstAnswerWindow(s,'2026-10-03T21:00:00Z').events.length,1);});
test('already-departed and unknown-time today excluded',()=>{const s=snap();s.events=[ev('past','2026-10-03','07:00','2026-10-02T21:00:00Z'),ev('unknown','2026-10-03',null,null)];assert.equal(firstAnswerWindow(s).events.length,0);});
test('expired and future check handled safely',()=>{assert.equal(firstAnswerWindow(snap(),expiresAt).events.length,0);assert.throws(()=>firstAnswerWindow(snap(),'2026-10-01T00:00:00Z'));});
test('first FAQ insertion is reversible and idempotent',()=>{const text='<h2>First?</h2><p>Facts.</p><h2>Next?</h2><p>Other.</p>';const x=insertOptions(text,'<p>Dates.</p>');assert.equal(stripOptions(x),text);assert.equal(insertOptions(x,'<p>Dates.</p>'),x);assert.ok(x.indexOf('Dates.')<x.indexOf('<h2>Next?'));});
test('article without headings is preserved exactly',()=>{const x='<p>Original answer.</p>';assert.equal(stripOptions(insertOptions(x,'dates')),x);});
test('corrupt or duplicate managed blocks stop edits',()=>{const x=insertOptions('original','dates');assert.throws(()=>stripOptions(x+x));assert.throws(()=>stripOptions(x.replace('<!-- /ABYSS_BEGINNER_FIRST_ANSWER_OPTIONS_V1 -->','broken')));});
test('renderer retains actual date, supplied link and neutral shared-Doc scope',()=>{const s=snap(),r=renderFirstAnswerOptions(s,choices(s));assert.match(r,/Friday,? 9 October 2026/);assert.ok(r.includes(s.events[0].bookingUrl));assert.ok(r.includes('not instructions to add a booking invitation to every answer'));});
test('unverified later, fully booked or changed URL cannot be promoted',()=>{for(const change of [s=>s.events[0].availability='fully_booked',s=>s.events[0].startDate='2026-11-01']){const s=snap();change(s);assert.throws(()=>renderFirstAnswerOptions(s,choices(s)));}const s=snap(),c=choices(s);c.primary[0].event={...s.events[0],bookingUrl:'https://example.test/'};assert.throws(()=>renderFirstAnswerOptions(s,c));});
test('no choices does not invent a date or claim all diving unavailable',()=>assert.match(renderFirstAnswerOptions(snap(),{primary:[]}),/not a claim that every possible beginner outing is unavailable/));
test('all three known sources updated with factual bodies and metadata preserved',async()=>{const m=mock(),s=snap(),before=[...m.data.values()].map(x=>x.text),r=await publishFirstAnswerOptions({request:m.request,snapshot:s,choices:choices(s)});assert.equal(r.results.length,3);assert.equal(m.writes(),3);assert.deepEqual([...m.data.values()].map(x=>stripOptions(x.text)),before);assert.ok([...m.data.values()].every(x=>x.keywords[0]==='unchanged'));});
test('draft and ambiguous target are rejected before all writes',async()=>{for(const opts of [{draftIndex:2},{ambiguous:true}]){const m=mock(opts),s=snap();await assert.rejects(()=>publishFirstAnswerOptions({request:m.request,snapshot:s,choices:choices(s)}));assert.equal(m.writes(),0);}});
test('concurrent edit causes no overwrite',async()=>{const m=mock({concurrent:true}),s=snap();await assert.rejects(()=>publishFirstAnswerOptions({request:m.request,snapshot:s,choices:choices(s)}));assert.equal(m.writes(),0);});
test('freshness check verifies every source against the canonical check time',async()=>{const m=mock(),s=snap(),canonical={text:'Checked (ISO): '+s.checkedAt};assert.equal(await firstAnswerOptionsAreCurrent(m.request,canonical),false);await publishFirstAnswerOptions({request:m.request,snapshot:s,choices:choices(s)});assert.equal(await firstAnswerOptionsAreCurrent(m.request,canonical),true);});
