/** Shared Docs contain maintained facts; the agent Identity owns conversation policy. */
import {createHash} from 'node:crypto';
import {unwrapManagedHtmlBlock} from './helpscout-managed-html-block.mjs';
import {newDiverWindow,allFirstDiveChoices,eventFactCard,escapeHtml,compareRecommendationEvents} from './helpscout-beginner-first-dive.mjs';
const SITE='5d0ed4d02c7d3a6ebd2268ed',CAL='6ab98d4249f1bc2c6aefca54',SUPPORT='6abf61e6c3e570044c2891ed';
export const SOURCE='https://www.abyss.com.au/beginner-diver-widget';
export const OPTIONS_MARKER='ABYSS_BEGINNER_FIRST_ANSWER_OPTIONS_V1';
export const OPENING_REVISION='ABYSS_BEGINNER_FACTS_V4_WEEKEND_PRIORITY';
const START='<!-- '+OPTIONS_MARKER+' -->',END='<!-- /'+OPTIONS_MARKER+' -->\n';
const ensure=(ok,msg)=>{if(!ok)throw new Error(msg);};
const hash=x=>createHash('sha256').update(String(x)).digest('hex'),esc=escapeHtml;
const fixed=[
 {id:'6abf76557cdaed3f1efa5fa0',collectionId:CAL,name:'Scuba equipment hire and the total cost of your dive',number:429},
 {id:'6abf7841c3e570044c28921f',collectionId:SUPPORT,name:'Nervous about your next dive? Support, pace and extra help',number:430}
];
const buddy={collectionId:CAL,name:'Can I join a Sydney guided dive without bringing a buddy?',number:276};
export const firstAnswerWindow=(snapshot,now=snapshot?.checkedAt)=>newDiverWindow(snapshot,now);
export function stripOptions(text){
 ensure(typeof text==='string','Missing article body');text=unwrapManagedHtmlBlock(text,OPTIONS_MARKER);const starts=text.split(START).length-1,ends=text.split(END).length-1;
 ensure(starts===ends&&starts<=1,'Managed date block missing delimiter or duplicated; no overwrite');
 if(!starts)return text;const a=text.indexOf(START),b=text.indexOf(END,a);ensure(b>a,'Invalid managed date block');return text.slice(0,a)+text.slice(b+END.length);
}
export function insertOptions(text,block){
 // Put date facts with the first factual answer, without copying that answer
 // or adding another question/script. Removing this block restores that body.
 const original=stripOptions(text),first=original.indexOf('</p>'),at=first<0?original.length:first+4;
 return original.slice(0,at)+START+'\n'+block+'\n'+END+original.slice(at);
}
export function existingCostAnswer(text){
 const original=stripOptions(text||''),h=original.match(/<h2[^>]*>What will my dive cost with equipment hire\?<\/h2>\s*(<p>[\s\S]*?<\/p>)/i);
 return h&&h[1].includes('A$')?h[1].replace(/Do you need everything, or already own some gear\?/gi,''):'';
}
export function reconcileStaticFacts(text,topic){
 let out=stripOptions(text);
 // Exact, reviewed conversational endings only. Preserve all operational facts.
 if(topic===429)out=out.replace(/\s*Do you need everything, or already own some gear\?/g,'');
 if(topic===430){
  out=out.replace(/\s*What part of the dive worries you most\?/g,'');
  const old='Tell the dive team what worries you before choosing a booking. Being newly certified does not mean you need another course automatically. An appropriate guided dive can help you gain experience, but the route, conditions and support should match your present skills and confidence. The most useful starting question is: what feels uncertain—equipment, buoyancy, air use, entry or descending?';
  const replacement='Ordinary nerves after recent certification can be supported on an appropriate guided outing; another course is not automatically needed. The team can help match the route, conditions and support to present skills and confidence. A diver who reports forgotten essential routines, significant difficulty or a specific assistance need should discuss that with the team or an instructor before choosing a normal group booking. This distinction does not require every newly certified diver to complete a preliminary interview.';
  out=out.replace(old,replacement);
 }
 return out;
}
export function renderFirstAnswerOptions(snapshot,choices,now=snapshot.checkedAt,{topic=0}={}){
 const window=firstAnswerWindow(snapshot,now),candidates=allFirstDiveChoices(choices||{});ensure(candidates.length<=4,'Too many first-answer options');
 for(const {site,event:e} of candidates){
  const verified=window.events.find(x=>x.id===e.id);
  ensure(verified&&verified.bookingUrl===e.bookingUrl&&verified.startDate===e.startDate&&verified.time===e.time&&verified.availability==='check_availability','Choice is not a verified, non-full event from tomorrow within 14 Sydney days');
  ensure(['Oak Park','Bare Island','Henry Head','Marine Marvels'].includes(site.name),'Unapproved first-answer site');
  if(site.name==='Marine Marvels')ensure(verified.product==='Marine Marvels Dives'&&Number.isFinite(verified.listedPrice?.amount)&&verified.listedPrice.currency==='AUD','Unverified Marine Marvels product or fee');
 }
 let displayed=candidates;
 if(topic){
  // The owner's day preference applies to all openings, not just no-buddy.
  // Default group-support examples stay on ordinary guided shore outings;
  // boat/Marine Marvels remain available for an explicitly suitable interest.
  const shore=candidates.filter(x=>x.site.kind==='shore'&&x.site.name!=='Marine Marvels').sort((a,b)=>compareRecommendationEvents(a.event,b.event));
  displayed=shore.length?[shore[0]]:[];
 }
 const rows=[`<!-- ${OPENING_REVISION} -->`,'<p><strong>Current local outing facts relevant to this answer.</strong> These are scheduled options, subject to suitability and an availability check.</p>'];
 displayed.forEach(x=>rows.push(eventFactCard(x)));
 if(!displayed.length)rows.push('<p>No suitable dated option is verified in this small excerpt from tomorrow through the next 14 Sydney calendar days. This is not a claim that every possible beginner outing is unavailable. The complete maintained schedule or the team may identify another suitable option.</p>');
 if(displayed.some(x=>x.site.kind==='shore'&&x.site.name!=='Marine Marvels'))rows.push('<p>Regular guided shore support includes a plan/entry briefing, help arranging buddy teams and a Divemaster leading the group underwater. Joining without a buddy and arranging equipment hire are normal options. Group guidance is not continuous individual tuition; the team confirms the route for the diver and conditions.</p>');
 rows.push(`<p>Schedule-check metadata, not a dive date: Beginner schedule checked (ISO): ${esc(snapshot.checkedAt)}. Expires (ISO): ${esc(snapshot.expiresAt)}. Do not use these date facts after expiry or recommend an outing that has become today in Australia/Sydney. The full 14th Sydney calendar day is included; today is excluded. Source: <a href="${SOURCE}">maintained beginner schedule</a>.</p>`);
 rows.push('<p>These event facts are not instructions to add a booking invitation to every answer. Conversation flow belongs to the agent Identity. The evergreen factual answer remains valid when this dated excerpt expires. Keep the site, date, time and booking URL together from the same event. Default Sunday, Saturday, Friday preference does not override stated availability; use the full maintained schedule for requested weekdays.</p>');
 return rows.join('\n');
}
async function resolve(request){
 for(const cid of [CAL,SUPPORT]){const c=(await request('GET','/collections/'+cid)).collection;ensure(c?.id===cid&&c.siteId===SITE&&c.visibility==='private','Collection identity/privacy mismatch');}
 const refs=[];for(let page=1;page<=20;page++){const a=(await request('GET',`/collections/${CAL}/articles?status=published&pageSize=100&page=${page}`)).articles;ensure(a&&Array.isArray(a.items)&&Number.isInteger(a.pages),'Invalid article metadata list');refs.push(...a.items);if(page>=a.pages)break;if(page===20)throw new Error('Article metadata pagination incomplete');}
 const matches=refs.filter(x=>x.name===buddy.name);ensure(matches.length===1&&/^[0-9a-f]{24}$/.test(matches[0].id),'Expected buddy article not uniquely identified; no writes');return [...fixed,{...buddy,id:matches[0].id}];
}
function validate(a,t){ensure(a?.id===t.id&&a.collectionId===t.collectionId&&a.name===t.name&&a.status==='published'&&!a.hasDraft&&typeof a.text==='string','Article identity, publication or draft conflict');ensure(String(a.number)===String(t.number)||String(a.publicUrl).includes('/article/'+t.number+'-'),'Article number mismatch');return a;}
const metadata=a=>JSON.stringify({id:a.id,collectionId:a.collectionId,name:a.name,slug:a.slug,status:a.status,keywords:a.keywords,categories:a.categories,related:a.related});
async function readAll(request){const targets=await resolve(request),records=[];for(const t of targets)records.push({t,a:validate((await request('GET','/articles/'+t.id)).article,t)});return records;}
export async function firstAnswerOptionsAreCurrent(request,canonicalArticle){const checked=canonicalArticle?.text?.match(/Checked \(ISO\):\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1];const records=await readAll(request);return !!checked&&records.every(({a})=>{const text=unwrapManagedHtmlBlock(a.text,OPTIONS_MARKER);return text.includes(START)&&text.includes(OPENING_REVISION)&&text.includes('Beginner schedule checked (ISO): '+checked+'.');});}
export async function publishFirstAnswerOptions({request,snapshot,choices,now=snapshot.checkedAt,backup=async()=>{}}){
 ensure(Date.parse(now)<Date.parse(snapshot.expiresAt),'Date options expired before publication');const records=await readAll(request);
 const plans=records.map(({a,t})=>{const base=reconcileStaticFacts(a.text,t.number);return {a,t,base,text:insertOptions(base,renderFirstAnswerOptions(snapshot,choices,now,{topic:t.number}))};});
 const results=[];
 for(const {a,t,base,text} of plans){
  if(a.text===text){results.push({id:a.id,status:'already-current'});continue;}
  await backup({id:a.id,text:a.text});const again=validate((await request('GET','/articles/'+a.id)).article,t);ensure(hash(again.text)===hash(a.text)&&metadata(again)===metadata(a),'Concurrent article edit; no overwrite');
  await request('PUT','/articles/'+a.id,{text});const after=validate((await request('GET','/articles/'+a.id)).article,t);ensure(after.text===text&&metadata(after)===metadata(a)&&stripOptions(after.text)===base,'Date excerpt readback or factual-body mismatch');
  results.push({id:a.id,number:t.number,status:'updated-and-verified',bodyHash:hash(after.text),originalContentUnchanged:base===stripOptions(a.text),reviewedConversationalCleanup:base!==stripOptions(a.text),metadataUnchanged:true});
 }
 return {checkedAt:snapshot.checkedAt,expiresAt:snapshot.expiresAt,results};
}
