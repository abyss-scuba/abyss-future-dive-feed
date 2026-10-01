import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DateTime} from 'luxon';
import {expiry,buildSnapshot,parseCalendar,scrapeAvelo,staleHtml,renderSnapshot,validateLinks,resolvePack,publishKnowledge,hash,comparable,SITE,COLLECTION} from '../src/helpscout-avelo.mjs';

function docsFixture(article,{beforeReadback,beforeSecondRead}={}){
 let stored=structuredClone(article),reads=0;const writes=[],backups=[];
 const request=async(method,path,payload)=>{
  if(method==='PUT'){writes.push(structuredClone(payload));stored={...stored,...structuredClone(payload)};beforeReadback?.(stored);return;}
  assert.equal(method,'GET');
  if(path.startsWith('/collections/'+COLLECTION+'/articles'))return {articles:{page:1,pages:1,items:[{id:stored.id}]}};
  if(path==='/collections/'+COLLECTION)return {collection:{id:COLLECTION,siteId:SITE,name:'Avelo Diving',visibility:'private'}};
  if(path==='/sites/'+SITE)return {site:{id:SITE}};
  assert.equal(path,'/articles/'+stored.id);
  if(++reads===2)beforeSecondRead?.(stored);
  return {article:structuredClone(stored)};
 };
 return {request,writes,backups,saveBackup:async value=>backups.push(structuredClone(value))};
}
const keywordArticle=()=>({id:'keyword-test',collectionId:COLLECTION,status:'published',hasDraft:false,name:'Keyword test',slug:'keyword-test',text:'<h2>Existing facts</h2>',keywords:['old search phrase']});

test('keyword-only publication replaces old terms and records the exact readback',async()=>{
 const current=keywordArticle(),fixture=docsFixture(current),keywords=['new search phrase','another intent'];
 const result=await publishKnowledge({...fixture,articles:[{...current,keywords}]});
 assert.deepEqual(fixture.writes,[{keywords}]);assert.deepEqual(fixture.backups[0],[current]);
 assert.deepEqual(result[0].keywords,keywords);assert.equal(result[0].keywordsHash,hash(JSON.stringify([...keywords].sort())));
});
test('schedule keyword publication preserves the live snapshot instead of its seed text',async()=>{
 const current={...keywordArticle(),text:'<h2>Verified current schedule</h2>'},fixture=docsFixture(current);
 const result=await publishKnowledge({...fixture,articles:[{...current,schedule:true,text:'<h2>Not yet verified seed</h2>',keywords:['course dates']}]});
 assert.deepEqual(fixture.writes,[{keywords:['course dates']}]);assert.equal(result[0].textHash,hash(comparable(current.text)));
});
test('unchanged keyword sets are idempotent regardless of returned order',async()=>{
 const current={...keywordArticle(),keywords:['second','first']},fixture=docsFixture(current);
 await publishKnowledge({...fixture,articles:[{...current,keywords:['first','second']}]});assert.equal(fixture.writes.length,0);
});
test('readback rejects an obsolete keyword left behind by the API',async()=>{
 const current=keywordArticle(),fixture=docsFixture(current,{beforeReadback:a=>a.keywords.push('obsolete')});
 await assert.rejects(publishKnowledge({...fixture,articles:[{...current,keywords:['replacement']}]}),/keyword readback mismatch/);
});
test('concurrent keyword editing prevents a write',async()=>{
 const current=keywordArticle(),fixture=docsFixture(current,{beforeSecondRead:a=>a.keywords=['human edit']});
 await assert.rejects(publishKnowledge({...fixture,articles:[{...current,keywords:['replacement']}]}),/Concurrent/);assert.equal(fixture.writes.length,0);
});
test('managed keyword drift fails preflight before any write',async()=>{
 const current=keywordArticle(),fixture=docsFixture(current),previous={articles:[{id:current.id,textHash:hash(comparable(current.text)),keywordsHash:hash(JSON.stringify(['different managed set']))}]};
 await assert.rejects(publishKnowledge({...fixture,previous,articles:[current]}),/keywords edited since managed/);assert.equal(fixture.writes.length,0);
});
test('shared articles allow local keywords while preserving canonical facts and fallback',()=>{
 const pack=JSON.parse(fs.readFileSync('data/helpscout-avelo-knowledge.json')),shared=JSON.parse(fs.readFileSync('data/helpscout-course-knowledge.json'));
 const entry=pack.articles.find(a=>a.sharedCourseArticleId),source=shared.articles.find(a=>a.id===entry.sharedCourseArticleId),before=JSON.stringify(shared);
 entry.keywords=['local one','local two','local three','local four','local five'];
 let resolved=resolvePack(pack,shared).find(a=>a.slug===entry.slug);assert.deepEqual(resolved.keywords,entry.keywords);assert.equal(resolved.text,source.text);assert.equal(resolved.name,source.name);
 delete entry.keywords;resolved=resolvePack(pack,shared).find(a=>a.slug===entry.slug);assert.deepEqual(resolved.keywords,source.keywords);assert.equal(JSON.stringify(shared),before);
});
const now=DateTime.fromISO('2026-10-01T07:00:00',{zone:'Australia/Sydney'});
const row={startDate:'30 Oct 2026',endDate:'30 Oct 2026',name:'Avelo Dive Course',maxPlaces:'4',available:'3',price:'$699.00',bookingUrl:'https://www.abyss.com.au/courses/avelo-dive-course?q='+Buffer.from('part_number=AVELO 30-10&date=&open_cart_id=66991806').toString('base64'),description:'AVELO 30-10: Avelo Dive Course',sessionDetails:['Start date: 30 Oct 2026 09:15 AM']};
const raw=(rows=[row])=>({rows,extraction:{sourceTotal:rows.length,pages:1,pageSizes:[rows.length]}});
test('Sydney expiry follows the next calendar day across both DST transitions',()=>{
 assert.equal(expiry(DateTime.fromISO('2026-10-03T07:00:00',{zone:'Australia/Sydney'})),'2026-10-04T07:30:00.000+11:00');
 assert.equal(expiry(DateTime.fromISO('2027-04-03T07:00:00',{zone:'Australia/Sydney'})),'2027-04-04T07:30:00.000+10:00');
});
test('preserves exact booking URL, raw availability, course type and timetable',()=>{const s=buildSnapshot(raw(),{now});assert.equal(s.rows[0].bookingUrl,row.bookingUrl);assert.equal(s.rows[0].rawAvailability,'3');assert.equal(s.rows[0].courseType,'recreational');assert.equal(s.validUntil,'2026-10-02T07:30:00.000+10:00');});
test('rejects malformed dates, duplicates, prices, capacity and unknown variants',()=>{
 for(const patch of [{startDate:'31 Feb 2027'},{price:'$0.00'},{available:'7'},{description:'Private Avelo Odyssey package'},{name:'Unexpected Avelo package'},{bookingUrl:'https://other.example/course'}])assert.throws(()=>buildSnapshot(raw([{...row,...patch}]),{now}));assert.throws(()=>buildSnapshot(raw([row,row]),{now}),/Duplicate/);
 assert.throws(()=>buildSnapshot(raw(),{now,previous:{prices:{66991806:400}}}),/25%/);
});
test('unknown availability stays unknown; sold out is not available',()=>{assert.equal(buildSnapshot(raw([{...row,available:''}]),{now}).rows[0].status,'availability unknown');assert.equal(buildSnapshot(raw([{...row,available:'0'}]),{now}).rows[0].status,'sold out at check');});
test('past dates are excluded and verified empty future schedules are supported',()=>{assert.equal(buildSnapshot(raw(),{now:DateTime.fromISO('2026-10-31')}).rows.length,0);assert.match(renderSnapshot(buildSnapshot(raw([]),{now})),/NO FUTURE COURSES LISTED/);});
test('blank and partial calendars fail closed',()=>{assert.throws(()=>parseCalendar(''),/metadata/);const html='<table><thead><tr>'+['','Start date','End date','Course','Max. Places','Places Available','Price',''].map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody></tbody></table><script>var count = "51";var totalPages = parseInt("2");var col_ids = "40518,,40519,";x={\'group_id\': "40519"}</script>';const meta=parseCalendar(html);assert.equal(meta.total,51);assert.equal(meta.rows.length,0);});
test('full scraper rejects an incomplete first page',async()=>{const shell='<div id="widget4869"><widget data-id="4869"></widget></div>',widget='<div id="cal"><course_group_calendar data-id="40518,40519" data-title="Avelo"></course_group_calendar></div>',cal='<table><thead><tr>'+['Start date','End date','Course','Max. Places','Places Available','Price'].map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody></tbody></table><script>var count = "1";var totalPages = parseInt("1");var col_ids = "40518,40519";x={\'group_id\': "40519"}</script>';let n=0;await assert.rejects(scrapeAvelo(async()=>({ok:true,text:async()=>[shell,widget,cal][n++]})),/Incomplete/);});
test('links must retain event and selected price, not only HTTP 200',async()=>{const s=buildSnapshot(raw(),{now});await assert.rejects(validateLinks(s,async()=>({ok:true,url:'https://www.abyss.com.au/courses/avelo-dive-course',text:async()=>'<p>66991806 Add to Cart</p>'})),/lost selected event/);await assert.rejects(validateLinks(s,async()=>({ok:true,url:row.bookingUrl,text:async()=>'<p>66991806 AVELO 30-10 Starts : Fri, Oct 30, 2026 : Avelo Dive Course (Price: $999.00) Add to Cart</p>'})),/price differs/);});
test('stale customer body contains no old rows, prices or inventory claims',()=>{const html=staleHtml();assert.match(html,/STALE OR UNVERIFIED/);assert.ok(!html.includes('699')&&!html.includes('30 October'));assert.match(html,/live Avelo course page/);});
test('knowledge uses fourteen articles and the same canonical course text',()=>{const p=JSON.parse(fs.readFileSync('data/helpscout-avelo-knowledge.json')),shared=JSON.parse(fs.readFileSync('data/helpscout-course-knowledge.json')),a=resolvePack(p,shared);assert.equal(a.length,14);assert.equal(a.filter(x=>x.sharedCourseArticleId).length,2);assert.equal(a.find(x=>x.sharedCourseArticleId==='6ab8bb8b7b6962906797d35a').text,shared.articles.find(x=>x.id==='6ab8bb8b7b6962906797d35a').text);});
test('draft conflict prevents all knowledge writes',async()=>{let writes=0;const a={name:'Test',slug:'test',text:'<h2>Test</h2>',keywords:['one','two','three','four','five']};const request=async(m,p)=>{if(m!=='GET'){writes++;return;}if(p.startsWith('/collections/'+COLLECTION+'/articles'))return {articles:{page:1,pages:1,items:[{id:'abc'}]}};if(p==='/collections/'+COLLECTION)return {collection:{id:COLLECTION,siteId:SITE,name:'Avelo Diving',visibility:'private'}};if(p==='/sites/'+SITE)return {site:{id:SITE}};return {article:{id:'abc',collectionId:COLLECTION,status:'published',name:'Test',slug:'test',hasDraft:true,text:a.text}}};await assert.rejects(publishKnowledge({request,articles:[a],saveBackup:async()=>{}}),/conflict/);assert.equal(writes,0);});
