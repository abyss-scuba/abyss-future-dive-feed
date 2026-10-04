import {load} from 'cheerio';
import {DateTime} from 'luxon';
import {createHash} from 'node:crypto';
export const ZONE='Australia/Sydney';
const CAL='6ab98d4249f1bc2c6aefca54',BEGINNER='6abf61e6c3e570044c2891ed',COURSES='6ab8b33984f08c58bb03f7e6';
const article=(id,name,collectionId,extra={})=>({id,name,collectionId,...extra});
export const PIPELINES=[
 {key:'calendar',label:'Sydney Dive Calendar',workflow:'sync-helpscout-calendar.yml',statusFile:'helpscout-calendar-sync-status.json',due:'08:00',articles:[article('290','Upcoming Sydney dive dates — schedule snapshot',CAL,{primary:true})]},
 {key:'boat',label:'Boat Diving',workflow:'sync-helpscout-boat.yml',statusFile:'helpscout-boat-sync-status.json',due:'04:00',articles:[article('6abb767c171ef8b866f2c9ce','Upcoming Sydney boat dives — schedule snapshot','6abb75219dcaab7ce64c5880',{primary:true})]},
 {key:'courses',label:'Sydney Dive Courses',workflow:'sync-helpscout-courses.yml',statusFile:'helpscout-course-sync-status.json',due:'07:00',articles:[
  article('6abd113e528fa6f4b198ab23','Upcoming Sydney Course Dates — Updated Daily',COURSES,{primary:true}),
  article('6abd12997cdaed3f1efa5545','Upcoming Sydney Advanced Open Water and Refresher Dates — Updated Daily',COURSES),
  article('6abd12993be702ed269e354f','Upcoming Sydney Specialty Courses Dates — Updated Daily',COURSES),
  article('6abd129949f1bc2c6aefd886','Upcoming Sydney Rescue and First Aid Dates — Updated Daily',COURSES),
  article('6abd129a7cdaed3f1efa5546','Upcoming Sydney Freediving, Mermaid and Avelo Dates — Updated Daily',COURSES),
  article('6abd129a7cdaed3f1efa5547','Upcoming Sydney Professional and Technical Courses Dates — Updated Daily',COURSES),
  article('6abd73c1535b0034271deaba','Steadier buoyancy for underwater photos — Peak Performance Buoyancy dates',COURSES),
  article('6ab8bba6171ef8b866f2c208','PADI Freediver in Sydney',COURSES)]},
 {key:'travel',label:'Dive Travel',workflow:'sync-helpscout-travel.yml',statusFile:'helpscout-travel-sync-status.json',due:'11:00',articles:[article('6abc86c75c1e572f6ed8c02d','Upcoming Abyss dive trips — dates and availability snapshot','6abc82e23be702ed269e3347',{primary:true})]},
 {key:'shore',label:'Shore Diving',workflow:'sync-helpscout-shore.yml',statusFile:'helpscout-shore-sync-status.json',due:'07:00',articles:[article('6abb494803648d35ccabcf5d','Upcoming Shore dive dates — schedule snapshot','6abb22ad5c1e572f6ed8ba47',{primary:true})]},
 {key:'beginner',label:'Beginner Dive Calendar',workflow:'sync-helpscout-beginner.yml',statusFile:'helpscout-beginner-sync-status.json',due:'07:30',articles:[
  article('6abf6f632bd8064b0717cab1','Upcoming beginner dive dates — shore, boat and trips',BEGINNER,{primary:true,allowZero:true}),
  article('6abf733d3be702ed269e3fa6','Your first guided dive after certification: what happens and who helps',BEGINNER),
  article('6abf76557cdaed3f1efa5fa0','Scuba equipment hire and the total cost of your dive',CAL),
  article('6abf7841c3e570044c28921f','Nervous about your next dive? Support, pace and extra help',BEGINNER),
  article('276','Can I join a Sydney guided dive without bringing a buddy?',CAL)]},
 {key:'avelo',label:'Avelo Diving',workflow:'sync-helpscout-avelo.yml',statusFile:'helpscout-avelo-sync-status.json',due:'10:30',articles:[article('6abda0e0535b0034271debb5','Upcoming Avelo Course Dates — Updated Daily','6abd97aa535b0034271deb9a',{primary:true,allowZero:true})]}
];
export function normalise(markup){
 let $=load(String(markup||''));$('script,style').remove();
 // Help Scout sometimes stores a managed HTML fragment in an escaped code block.
 for(let i=0;i<2;i++){const nested=$('pre code,pre.ql-syntax').toArray().filter(el=>/<(?:p|h[1-6]|ul)\b/.test($(el).text()));if(!nested.length)break;for(const el of nested)$(el).replaceWith($(el).text());}
 const text=$.root().text().replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
 const links=$('a[href]').toArray().map(el=>$(el).attr('href'));
 const bodyHash=createHash('sha256').update(text+'\n'+links.join('\n')).digest('hex');
 return {text,links,bodyHash};
}
export function checkDates(text){
 const dates=[];
 const iso=/(?:Last successful check:|Checked \(ISO\):|Beginner schedule checked \(ISO\):|Schedule checked \(ISO\):|Dated recommendations checked:)\s*(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))/gi;
 for(const m of text.matchAll(iso)){const d=DateTime.fromISO(m[1],{setZone:true}).setZone(ZONE);if(d.isValid)dates.push(d.toISODate());}
 const human=/(?:Last successfully checked:|Schedule snapshot checked)\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi;
 for(const m of text.matchAll(human)){for(const fmt of ['d LLLL yyyy','d LLL yyyy']){const d=DateTime.fromFormat(m[1],fmt,{zone:ZONE,locale:'en'});if(d.isValid){dates.push(d.toISODate());break;}}}
 return [...new Set(dates)].sort();
}
export function expiryTimes(text){
 return [...text.matchAll(/(?:Expires(?: \(ISO\))?:|Valid until:|Stale after:)\s*(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))/gi)].map(m=>Date.parse(m[1])).filter(Number.isFinite);
}
export function inspectLinks(links){
 const unique=new Set(),errors=[];
 for(const href of links){let u;try{u=new URL(href);}catch{continue;}
  if(!u.searchParams.has('q'))continue;
  if(u.origin!=='https://www.abyss.com.au'||!/^\/(charters|courses|trips)\//.test(u.pathname)){errors.push('unexpected-event-link-destination');continue;}
  const q=new URLSearchParams(Buffer.from(u.searchParams.get('q'),'base64').toString('utf8'));
  if(!/^\d+$/.test(q.get('open_cart_id')||'')||!q.get('part_number'))errors.push('invalid-event-link-identity');
  else unique.add(href);
 }
 return {eventLinks:unique.size,errors:[...new Set(errors)]};
}
export function inspectArticle(raw,spec,{now=DateTime.now(),due='00:00',previous=null}={}){
 now=now.setZone(ZONE);const errors=[],warnings=[];const {text,links,bodyHash}=normalise(raw?.text);
 const identity=String(raw?.id)===spec.id||String(raw?.number)===spec.id;
 if(!identity||raw?.name!==spec.name||raw?.collectionId!==spec.collectionId)errors.push('article-identity-mismatch');
 if(raw?.status!=='published')errors.push('article-not-published');
 if(raw?.hasDraft)errors.push('unpublished-draft-blocks-refresh');
 if(text.length<80)errors.push('empty-or-truncated-article');
 const dates=checkDates(text),today=now.toISODate(),past=now.minus({days:1}).toISODate();
 if(!dates.length)errors.push('successful-check-date-missing');
 else if(dates.some(d=>d>today))errors.push('check-date-in-future');
 else if(dates.some(d=>d<today)&&(now.toFormat('HH:mm')>=due||dates.some(d=>d<past)))errors.push('published-check-date-not-current');
 else if(!dates.includes(today))warnings.push('awaiting-todays-refresh');
 if(expiryTimes(text).some(x=>x<=now.toMillis()))errors.push('published-date-section-expired');
 if(/Status:\s*STALE OR UNVERIFIED/i.test(text))errors.push('stale-fallback-published');
 const event=inspectLinks(links);errors.push(...event.errors);
 if(spec.primary&&!spec.allowZero&&event.eventLinks===0)errors.push('departure-booking-links-missing');
 if(previous&&previous.bodyHash!==bodyHash&&JSON.stringify(previous.checkDates)===JSON.stringify(dates))warnings.push('body-changed-with-same-check-date');
 return {id:raw?.id||spec.id,number:raw?.number||null,name:spec.name,collectionId:spec.collectionId,checkDates:dates,eventLinks:event.eventLinks,bodyHash,errors:[...new Set(errors)],warnings};
}
export function statusFacts(key,s){
 let checkedAt=s?.lastSuccessfulCheck||s?.checkedAt||s?.checkedOn||null;
 const count=key==='courses'?s?.publication?.count:key==='avelo'?s?.futureCount:key==='beginner'?Object.values(s?.counts||{}).reduce((a,b)=>a+b,0):s?.eventCount??s?.publication?.count;
 const status=s?.publication?.status||s?.status||s?.result;
 return {checkedAt,count:count??null,status:status||'missing',dryRun:s?.dryRun===true||s?.sourceOnly===true};
}
export function evaluatePipeline(config,{status,articles,workflow,runs=[],now=DateTime.now(),previous=null}){
 now=now.setZone(ZONE);const errors=[],warnings=[];const facts=statusFacts(config.key,status);
 if(!workflow||workflow.state!=='active')errors.push('workflow-not-active');
 const valid=runs.filter(r=>r.head_branch==='main'&&['schedule','push','workflow_dispatch'].includes(r.event));
 const latest=valid[0]||null;
 if(!latest)errors.push('no-production-workflow-run');
 else if(latest.status==='completed'&&latest.conclusion!=='success')warnings.push('latest-workflow-'+latest.conclusion);
 else if(latest.status!=='completed')warnings.push('workflow-'+latest.status);
 const checked=facts.checkedAt?DateTime.fromISO(facts.checkedAt,{zone:ZONE}).setZone(ZONE):null;
 if(!checked?.isValid)errors.push('successful-publication-receipt-missing');
 else if(checked.toISODate()>now.toISODate())errors.push('receipt-in-future');
 else if(checked.toISODate()!==now.toISODate()&&now.toFormat('HH:mm')>=config.due)errors.push('daily-publication-receipt-missing');
 if(facts.dryRun||!/^(updated|unchanged|verified|updated-and-verified|created-and-verified|published-and-verified|published-and-read-back|already-published-today)$/.test(facts.status))errors.push('receipt-not-successful');
 // A new verified publication can legitimately change content on the same day.
 const prior=previous?.checkedAt===facts.checkedAt?previous:null;
 const results=config.articles.map((spec,i)=>inspectArticle(articles[i],spec,{now,due:config.due,previous:prior?.articles?.find(a=>a.name===spec.name)}));
 for(const a of results)errors.push(...a.errors.map(e=>a.name+': '+e));
 warnings.push(...results.flatMap(a=>a.warnings.map(w=>a.name+': '+w)));
 const primary=results.find(a=>config.articles.find(s=>s.name===a.name)?.primary);
 // The course overview is deliberately a shortlist. Its five grouped date
 // articles collectively hold the full schedule; duplicates in summaries do
 // not count twice. Other publishers put their full schedule in one article.
 const publishedCount=config.key==='courses'?inspectLinks(articles.flatMap(a=>normalise(a?.text).links)).eventLinks:primary?.eventLinks;
 if(Number.isInteger(facts.count)&&publishedCount!==facts.count)errors.push('published-booking-link-count-differs-from-receipt');
 const scheduled=valid.find(r=>r.event==='schedule'&&r.status==='completed'&&r.conclusion==='success');
 return {key:config.key,label:config.label,state:errors.length?'FAIL':warnings.length?'WARN':'PASS',checkedAt:facts.checkedAt,count:facts.count,publishedUniqueEventLinks:publishedCount??null,due:config.due,workflow:config.workflow,latestRun:latest?{id:latest.id,event:latest.event,status:latest.status,conclusion:latest.conclusion,url:latest.html_url}:null,lastSuccessfulScheduledRun:scheduled?{id:scheduled.id,createdAt:scheduled.created_at,url:scheduled.html_url}:null,articles:results,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
export function summaryMarkdown(report){
 const lines=['# Help Scout daily publication health','',`Checked: ${report.checkedAt} (${ZONE}).`,'','| Date source | Result | Last successful check | Records |','|---|---|---|---:|'];
 for(const s of report.sources)lines.push(`| ${s.label} | ${s.state} | ${s.checkedAt||'Unverified'} | ${s.count??'Unknown'} |`);
 lines.push('','PASS verifies the published date sections and receipt, not AI-answer accuracy or live seat availability. WARN needs review; FAIL means a required check did not pass.');
 for(const s of report.sources){if(s.errors.length||s.warnings.length)lines.push('',`## ${s.label}`, ...[...s.errors,...s.warnings].map(x=>'- '+x),s.latestRun?.url?'Run: '+s.latestRun.url:'');}
 if(report.monitorErrors?.length)lines.push('','## Monitor errors',...report.monitorErrors.map(x=>'- '+x));
 return lines.join('\n');
}
