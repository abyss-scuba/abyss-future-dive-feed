import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {DateTime} from 'luxon';
import {parseCalendar,buildCourseSnapshot,renderCourseSnapshot,publishCourseSnapshot,COLLECTION,TITLE,SLUG,comparable,schedulePlans,withFreediverDates,FREEDIVER_ARTICLE} from '../src/helpscout-courses.mjs';
import {publishKnowledge} from '../src/helpscout-course-knowledge.mjs';
import {hash} from '../src/helpscout-courses.mjs';
const raw=JSON.parse(await fs.readFile(new URL('./fixtures/course/rows.json',import.meta.url))),mapping=JSON.parse(await fs.readFile(new URL('../data/helpscout-course-mapping.json',import.meta.url))),now=DateTime.fromISO('2026-09-30T23:00:00+10:00'),make=(r=raw,p=null)=>buildCourseSnapshot(structuredClone(r),mapping,{now,previous:p});
test('complete current calendar spans both pages, retains languages and exact booking links',()=>{const s=make();assert.equal(s.sessions.length,95);assert.deepEqual(s.extraction.pageSizes,[50,45]);const chinese=s.sessions.find(x=>x.language==='Chinese');assert.ok(chinese.variant.includes('Chinese'));assert.equal(chinese.bookingUrl,raw.rows.find(r=>r.description===chinese.variant).bookingUrl);assert.ok(s.sessions.at(-1).endDate>'2027-04-02');});
test('server metadata, not defective JS offset default, establishes full range',async()=>{const x=parseCalendar(await fs.readFile(new URL('./fixtures/course/first-page.html',import.meta.url),'utf8'));assert.equal(x.total,95);assert.equal(x.totalPages,2);assert.equal(x.rows.length,50)});
test('reject duplicate, impossible date, changed course, price and capacity before publication',()=>{for(const patch of [{startDate:'31 Feb 2027'},{price:'$0.00'},{available:'99'},{name:'Unknown course'},{bookingUrl:'https://example.org/book'}]){const r=structuredClone(raw);Object.assign(r.rows[0],patch);assert.throws(()=>make(r));}const r=structuredClone(raw);r.rows.push(r.rows[0]);assert.throws(()=>make(r),/Duplicate/)});
test('source timetable discrepancies remain flagged rather than silently corrected',()=>{const s=make(),bad=s.sessions.filter(x=>x.bookingStatus==='date confirmation required');assert.ok(bad.length>0);assert.ok(bad.every(x=>x.warnings.length));assert.ok(s.sessions.some(x=>x.firstSessionDate<x.startDate));});
test('stale policy is 48 elapsed hours across Sydney DST',()=>{const r=buildCourseSnapshot(structuredClone(raw),mapping,{now:DateTime.fromISO('2026-10-03T02:30:00',{zone:'Australia/Sydney'})});assert.equal(DateTime.fromISO(r.staleAfter).diff(DateTime.fromISO(r.checkedAt),'hours').hours,48);assert.ok(r.staleAfter.endsWith('+11:00'));assert.ok(renderCourseSnapshot(r).includes('not real-time availability'));assert.ok(!renderCourseSnapshot(r).includes('Places left:'));});
test('suspicious disappearance preserves last snapshot by rejecting candidate',()=>{const p=make(),r=structuredClone(raw);r.rows=r.rows.slice(0,50);assert.throws(()=>make(r,p),/fell by more/)});
function docsMock(current=null){let articles=Array.isArray(current)?structuredClone(current):current?[current]:[],mutations=[];return {mutations,request:async(method,path,body)=>{if(method==='GET'&&path.startsWith('/collections/')&&path.includes('/articles'))return {articles:{items:articles,page:1,pages:1}};if(method==='GET'&&path.startsWith('/collections/'))return {collection:{id:COLLECTION,name:'Sydney Dive Courses',siteId:'6ab8b2dd4b37f75b5ff65b9c',visibility:'private'}};if(method==='GET'&&path==='/sites/6ab8b2dd4b37f75b5ff65b9c')return {site:{id:'6ab8b2dd4b37f75b5ff65b9c',title:'Dive course Doc'}};if(method==='GET'&&path.startsWith('/articles/'))return {article:articles.find(a=>a.id===path.split('/').at(-1))};mutations.push({method,path,body});if(method==='POST'){const article={...body,id:String(articles.length+1).padStart(24,'0'),hasDraft:false};articles.push(article);return article.id}if(method==='PUT'){const i=articles.findIndex(a=>a.id===path.split('/').at(-1));articles[i]={...articles[i],...body};return null}throw Error('Unexpected request')},get:()=>articles.find(a=>a.name===TITLE)}}
const freediverFixture=(extra={})=>({...FREEDIVER_ARTICLE,collectionId:COLLECTION,status:'published',hasDraft:false,text:'<h2>Owner-approved course facts</h2><p>Keep these facts and links.</p>',keywords:['curated freediving keyword'],...extra});
const courseMock=(current=[])=>docsMock([freediverFixture(),...(Array.isArray(current)?current:[current])]);
test('creates once, reads back, and skips duplicate Sydney local-day publication',async()=>{const s=make(),m=courseMock();const p=await publishCourseSnapshot(s,{request:m.request});assert.equal(p.status,'published-and-verified');assert.equal(comparable(m.get().text),comparable(schedulePlans(s).at(-1).text));await publishCourseSnapshot(s,{request:m.request});assert.equal(m.mutations.length,8);});
test('draft conflict prevents schedule overwrite',async()=>{const s=make(),m=courseMock({id:'123',name:TITLE,slug:SLUG,collectionId:COLLECTION,status:'published',hasDraft:true,text:renderCourseSnapshot(s)});await assert.rejects(publishCourseSnapshot(s,{request:m.request}),/draft conflict/);assert.equal(m.mutations.length,0)});
test('all twenty original knowledge identities retained and distinct subjects separated',async()=>{const p=JSON.parse(await fs.readFile(new URL('../data/helpscout-course-knowledge.json',import.meta.url)));assert.equal(p.articles.length,50);assert.equal(new Set(p.articles.filter(a=>a.id).map(a=>a.id)).size,20);for(const s of ['padi-nitrox-sydney','padi-peak-performance-buoyancy-sydney','padi-dry-suit-diver-sydney','padi-mermaid-sydney','emergency-first-response-sydney'])assert.ok(p.articles.some(a=>a.slug===s));assert.ok(!p.articles.some(a=>/CPR(?: and First Aid)? within (?:the (?:past|previous) )?12 months/i.test(a.text)));});

test('goal guide publishes into the new category with backup and readback',async()=>{const p=JSON.parse(await fs.readFile(new URL('../data/helpscout-course-knowledge.json',import.meta.url)));const existing=p.articles.slice(0,42).map((a,i)=>({...a,id:a.id||String(i+100).padStart(24,'0'),collectionId:COLLECTION,status:'published',hasDraft:false}));const guide=existing.find(a=>a.manageCategories);guide.categories=['6ab8b3eb7b6962906797d354'];const m=docsMock(existing);let backedUp=false;const request=async(method,path,body)=>{if(method!=='GET')assert.equal(backedUp,true);return m.request(method,path,body)};const result=await publishKnowledge({pack:p,request,saveBackup:async originals=>{assert.equal(originals.length,42);backedUp=true}});assert.equal(result.length,50);assert.deepEqual((await m.request('GET',`/articles/${guide.id}`)).article.categories,['6abd693c7cdaed3f1efa5777']);assert.equal(m.mutations.filter(x=>x.method==='POST').length,8);});

test('booking-flow template migrates once without disabling local-day deduplication',async()=>{const snapshot=make();const old=schedulePlans(snapshot).map((p,i)=>({id:String(i+1).padStart(24,'0'),name:p.name,slug:p.slug,collectionId:COLLECTION,status:'published',hasDraft:false,text:p.text.replace('<!-- ABYSS_COURSE_BOOKING_FLOW_V2 -->','')}));const m=courseMock(old);await publishCourseSnapshot(snapshot,{request:m.request});assert.equal(m.mutations.length,8);assert.ok(m.get().text.includes('For a named-course date request'));await publishCourseSnapshot(snapshot,{request:m.request});assert.equal(m.mutations.length,8);});

test('Freediver dates remain with course facts and preserve exact links, body and keywords',async()=>{
 const snapshot=make(),original=freediverFixture(),m=courseMock();
 await publishCourseSnapshot(snapshot,{request:m.request});
 const saved=(await m.request('GET',`/articles/${original.id}`)).article;
 assert.ok(saved.text.endsWith(original.text));assert.deepEqual(saved.keywords,original.keywords);
 assert.ok(saved.text.includes('Last successful check: '+snapshot.checkedAt));assert.ok(saved.text.includes('Stale after: '+snapshot.staleAfter));
 for(const r of snapshot.sessions.filter(r=>r.courseKey==='padi-freediver-sydney'&&r.bookingStatus==='listed with places at check').slice(0,3))assert.ok(saved.text.includes(r.bookingUrl.replaceAll('&','&amp;')));
 const unavailable=snapshot.sessions.find(r=>r.courseKey==='padi-freediver-sydney'&&r.bookingStatus==='sold out at check');
 assert.ok(unavailable);assert.ok(!saved.text.includes(unavailable.bookingUrl));assert.ok(saved.text.includes('sold out at check'));
 assert.ok(!saved.text.includes('/courses/avelo-dive-course?'));
 assert.deepEqual(Object.keys(m.mutations.find(x=>x.path===`/articles/${original.id}`).body),['text']);
});
test('replacing the managed section removes obsolete dates and retains new owner edits',()=>{
 const snapshot=make(),body='<p>Canonical facts.</p>',first=withFreediverDates(body,snapshot);
 const next={...snapshot,checkedAt:'2026-10-02T02:30:00+10:00',staleAfter:'2026-10-04T03:30:00+11:00',sessions:snapshot.sessions.filter(r=>r.courseKey!=='padi-freediver-sydney')};
 const result=withFreediverDates(first+'<p>Later owner edit.</p>',next);
 assert.ok(result.endsWith(body+'<p>Later owner edit.</p>'));assert.equal(result.split('ABYSS_FREEDIVER_DATES_START_V1').length,2);
 assert.ok(!result.includes('2026-09-30T23:00:00'));assert.ok(!result.includes('/courses/padi-freediver-course?'));
 assert.ok(result.includes('No beginner PADI Freediver intake was listed'));assert.ok(result.includes('This does not mean the course is unavailable'));
 assert.equal(withFreediverDates(result,next),result);
});
test('Freediver price summary follows suitable intakes and never treats hire as included',()=>{
 const snapshot=make(),rows=snapshot.sessions.filter(r=>r.courseKey==='padi-freediver-sydney'&&r.bookingStatus==='listed with places at check');
 const single=withFreediverDates('<p>Course facts.</p>',{...snapshot,sessions:[{...rows[0],price:650}]});
 assert.ok(single.includes('listed at AUD $650.00 per person'));
 assert.ok(single.includes('personal-equipment hire availability and charges need confirmation'));
 assert.ok(single.includes('not a verified all-in total'));
 const mixed=withFreediverDates('<p>Course facts.</p>',{...snapshot,sessions:[{...rows[0],price:650},{...rows[1],price:700},{...rows[0],id:'sold',price:100,bookingStatus:'sold out at check'}]});
 assert.ok(mixed.includes('listed at AUD $650.00–$700.00 per person'));
 assert.ok(mixed.includes('contains 2 suitable future intakes; 2 are shown below'));
 assert.ok(mixed.includes('provide these 2 verified options'));
 assert.ok(!mixed.includes('AUD $100.00'));
 const empty=withFreediverDates(single,{...snapshot,sessions:[]});
 assert.ok(!empty.includes('listed at AUD $650.00'));assert.ok(!empty.includes('How much does a beginner freediving course cost'));
});
test('Freediver draft, identity and marker conflicts block all schedule writes',async()=>{
 for(const change of [{hasDraft:true},{slug:'wrong-course'},{text:'<!-- ABYSS_FREEDIVER_DATES_START_V1 --><p>Broken marker</p>'}]){
  const m=docsMock([freediverFixture(change)]);await assert.rejects(publishCourseSnapshot(make(),{request:m.request}),/conflict/);assert.equal(m.mutations.length,0);
 }
 const missing=docsMock();await assert.rejects(publishCourseSnapshot(make(),{request:missing.request}),/identity conflict/);assert.equal(missing.mutations.length,0);
});
test('free-fins offer uses the Sydney enrolment deadline and survives a daily refresh',()=>{
 const s=make(),body='<p>Owner course facts stay intact.</p>';
 const initial=withFreediverDates(body,{...s,checkedAt:'2027-03-31T12:59:59Z'});
 assert.ok(initial.includes('Yes. For beginner PADI Freediver enrolments made by 31 March 2027'));
 assert.ok(initial.includes('AUD $129, yours to keep'));
 assert.ok(initial.includes('not a published course-completion deadline'));
 assert.ok(!initial.includes('Bring or arrange a suitable mask, snorkel, fins and wetsuit'));
 const expired=withFreediverDates(initial,{...s,checkedAt:'2027-03-31T13:00:00Z'});
 assert.ok(expired.includes('previously advertised free-fins offer'));
 assert.ok(!expired.includes('Yes. For beginner'));
 assert.ok(expired.endsWith(body));
 const noDates=withFreediverDates(body,{...s,sessions:[]});
 assert.ok(noDates.includes('FREE pair of premium long-blade freediving fins'));
});
test('a concurrent Freediver edit is never overwritten',async()=>{
 const m=courseMock();let reads=0;
 const request=async(method,path,body)=>{const result=await m.request(method,path,body);if(method==='GET'&&path===`/articles/${FREEDIVER_ARTICLE.id}`&&++reads===2)return {article:{...result.article,text:result.article.text+'<p>Concurrent edit.</p>'}};return result;};
 await assert.rejects(publishCourseSnapshot(make(),{request}),/changed during publication/);
 assert.ok(!m.mutations.some(x=>x.path===`/articles/${FREEDIVER_ARTICLE.id}`));
});

test('focused buoyancy date source isolates exact course bookings for goal retrieval',()=>{const s=make(),p=schedulePlans(s).find(p=>p.slug==='steadier-buoyancy-photography-course-dates');assert.ok(p.text.includes('steady hovering'));assert.ok(p.text.includes('Stale after:'));assert.ok(p.sessions.every(r=>r.courseKey==='padi-peak-performance-buoyancy-sydney'));for(const r of p.sessions)assert.ok(p.text.includes(r.bookingUrl.replaceAll('&','&amp;')));assert.ok(!p.text.includes('/courses/enriched-air-diver'));assert.ok(p.text.includes('definitive PADI Peak Performance Buoyancy in Sydney article'));});

async function managedFixture(){const pack=JSON.parse(await fs.readFile(new URL('../data/helpscout-course-knowledge.json',import.meta.url)));const existing=pack.articles.map((a,i)=>({...a,id:a.id||String(i+100).padStart(24,'0'),collectionId:COLLECTION,status:'published',hasDraft:false}));const previous={articles:existing.map(a=>({id:a.id,name:a.name,slug:a.slug,plannedSlug:a.slug,textHash:hash(comparable(a.text))}))};return {pack,existing,previous};}
test('unrelated live edits and drafts survive while only the changed Avelo record is published',async()=>{const {pack,existing,previous}=await managedFixture();existing[2].text='<p>New owner-approved AOW advice</p>';existing[2].hasDraft=true;const a=pack.articles.find(a=>a.slug==='avelo-essentials-sydney');a.text+='<p>Updated Avelo facts.</p>';const m=docsMock(existing);const result=await publishKnowledge({pack,previous,request:m.request,saveBackup:async()=>{}});assert.equal(m.mutations.length,1);assert.equal(m.mutations[0].path,`/articles/${a.id}`);assert.equal((await m.request('GET',`/articles/${existing[2].id}`)).article.text,existing[2].text);assert.equal(result[2].textHash,previous.articles[2].textHash);assert.equal(result[2].action,'preserved');assert.equal(result[2].liveHasDraft,true);});
test('a live conflict on the changed source still blocks every mutation',async()=>{const {pack,existing,previous}=await managedFixture();pack.articles[0].text+='<p>Managed change</p>';existing[0].text+='<p>Concurrent live change</p>';const m=docsMock(existing);await assert.rejects(publishKnowledge({pack,previous,request:m.request,saveBackup:async()=>{}}),/edited since/);assert.equal(m.mutations.length,0);});
test('preserved live edits are not adopted as permission to overwrite later',async()=>{const {pack,existing,previous}=await managedFixture();existing[2].text+='<p>Colleague change</p>';const m=docsMock(existing);const articles=await publishKnowledge({pack,previous,request:m.request,saveBackup:async()=>{}});assert.equal(m.mutations.length,0);pack.articles[2].text+='<p>Later managed change</p>';await assert.rejects(publishKnowledge({pack,previous:{articles},request:m.request,saveBackup:async()=>{}}),/edited since/);assert.equal(m.mutations.length,0);});
test('explicit managed keyword changes are not skipped after baseline migration',async()=>{const {pack,existing,previous}=await managedFixture();const m=docsMock(existing);const articles=await publishKnowledge({pack,previous,request:m.request,saveBackup:async()=>{}});pack.articles[0].manageKeywords=true;pack.articles[0].keywords.push('new approved search phrase');await publishKnowledge({pack,previous:{articles},request:m.request,saveBackup:async()=>{}});assert.equal(m.mutations.length,1);assert.ok(m.mutations[0].body.keywords.includes('new approved search phrase'));});


test('next-day schedule refresh preserves manually curated keywords on every article',async()=>{
 const snapshot=make();
 const old=schedulePlans(snapshot).map((p,i)=>({id:String(i+1).padStart(24,'0'),name:p.name,slug:p.slug,collectionId:COLLECTION,status:'published',hasDraft:false,text:p.text,keywords:[`curated phrase ${i}`]}));
 const m=docsMock(old),next=structuredClone(snapshot);
 next.localDate='2026-10-01';next.checkedAt='2026-10-01T23:00:00+10:00';next.staleAfter='2026-10-03T23:00:00+10:00';
 await publishCourseSnapshot(next,{request:m.request});
 assert.equal(m.mutations.length,old.length);
 for(const article of old){const actual=(await m.request('GET',`/articles/${article.id}`)).article;assert.deepEqual(actual.keywords,article.keywords);assert.ok(actual.text.includes(next.checkedAt));}
 assert.ok(m.mutations.every(change=>!Object.hasOwn(change.body,'keywords')));
});

test('new schedule articles use date phrases without bare course or goal keywords',async()=>{
 const m=docsMock();await publishCourseSnapshot(make(),{request:m.request});
 for(const mutation of m.mutations){assert.equal(mutation.method,'POST');assert.ok(mutation.body.keywords.length);assert.ok(mutation.body.keywords.every(k=>/dates|upcoming|calendar/i.test(k)));}
});

test('knowledge body updates preserve live keywords unless explicitly managed',async()=>{
 const {pack,existing,previous}=await managedFixture();
 existing[0].keywords=['owner curated medical enquiry'];pack.articles[0].text+='<p>Updated course guidance.</p>';pack.articles[0].keywords=['old pack keyword'];
 const m=docsMock(existing);await publishKnowledge({pack,previous,request:m.request,saveBackup:async()=>{}});
 assert.equal(m.mutations.length,1);assert.ok(!Object.hasOwn(m.mutations[0].body,'keywords'));
 assert.deepEqual((await m.request('GET',`/articles/${existing[0].id}`)).article.keywords,['owner curated medical enquiry']);
});


test('keyword opt-in preserves existing source fingerprints for unmodified records',async()=>{
 const {pack,existing,previous}=await managedFixture();
 previous.articles.forEach((r,i)=>{const a=pack.articles[i];r.sourceHash=hash(JSON.stringify({name:a.name,text:comparable(a.text),keywords:a.keywords,categories:a.manageCategories?a.categories:null}));});
 existing[0].text='<p>New live guidance</p>';existing[0].keywords=['new live phrase'];existing[0].hasDraft=true;
 const m=docsMock(existing);const result=await publishKnowledge({pack,previous,request:m.request,saveBackup:async()=>{}});
 assert.equal(m.mutations.length,0);assert.ok(result.every(r=>r.action==='preserved'));
});
