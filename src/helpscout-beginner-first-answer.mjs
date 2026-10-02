/** Small maintained opening-answer examples; the full beginner schedule remains canonical. */
import {createHash} from 'node:crypto';
const SITE='5d0ed4d02c7d3a6ebd2268ed',CAL='6ab98d4249f1bc2c6aefca54',SUPPORT='6abf61e6c3e570044c2891ed';
export const SOURCE='https://www.abyss.com.au/beginner-diver-widget';
export const OPTIONS_MARKER='ABYSS_BEGINNER_FIRST_ANSWER_OPTIONS_V1';
export const OPENING_REVISION='ABYSS_OPENING_REPLIES_V2_TOMORROW';
const START='<!-- '+OPTIONS_MARKER+' -->',END='<!-- /'+OPTIONS_MARKER+' -->\n';
const ensure=(ok,msg)=>{if(!ok)throw new Error(msg);};
const hash=x=>createHash('sha256').update(String(x)).digest('hex');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=d=>new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00:00Z'));
const fixed=[
 {id:'6abf76557cdaed3f1efa5fa0',collectionId:CAL,name:'Scuba equipment hire and the total cost of your dive',number:429},
 {id:'6abf7841c3e570044c28921f',collectionId:SUPPORT,name:'Nervous about your next dive? Support, pace and extra help',number:430}
];
const buddy={collectionId:CAL,name:'Can I join a Sydney guided dive without bringing a buddy?',number:276};
export function firstAnswerWindow(snapshot,now=snapshot?.checkedAt){
 ensure(snapshot?.source===SOURCE&&Array.isArray(snapshot.events),'Unrecognised date snapshot');
 const n=Date.parse(now),checked=Date.parse(snapshot.checkedAt),expires=Date.parse(snapshot.expiresAt);
 ensure(Number.isFinite(n)&&Number.isFinite(checked)&&Number.isFinite(expires)&&checked<=n&&expires>checked&&expires-checked<=36*3600000,'Invalid snapshot time or expiry');
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(n)).map(x=>[x.type,x.value]));
 const today=`${p.year}-${p.month}-${p.day}`,time=`${p.hour}:${p.minute}`;
 const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const lastDate=new Date(Date.parse(today+'T12:00:00Z')+14*86400000).toISOString().slice(0,10);
 const events=n>=expires?[]:snapshot.events.filter(e=>{
  // Owner rule: even an unstarted event today is not a new-diver recommendation.
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate||'')||e.startDate<=today||e.startDate>lastDate)return false;
  if(e.startDate===lastDate&&(!e.time||e.time>time))return false;
  if(e.startInstant)return Number.isFinite(Date.parse(e.startInstant))&&Date.parse(e.startInstant)>n;
  return true;
 });
 return {...snapshot,events,invitationWindow:{fromSydneyDate:tomorrow,throughSydneyDate:lastDate,throughSydneyTime:time}};
}
export function stripOptions(text){
 ensure(typeof text==='string','Missing article body');
 const starts=text.split(START).length-1,ends=text.split(END).length-1;
 ensure(starts===ends&&starts<=1,'Managed date block missing delimiter or duplicated; no overwrite');
 if(!starts)return text;
 const a=text.indexOf(START),b=text.indexOf(END,a);ensure(b>a,'Invalid managed date block');
 return text.slice(0,a)+text.slice(b+END.length);
}
export function insertOptions(text,block){
 // The complete question and dated answer must be retrieved together, ahead of older FAQs.
 return START+'\n'+block+'\n'+END+stripOptions(text);
}
export function existingCostAnswer(text){
 const original=stripOptions(text||'');
 const h=original.match(/<h2[^>]*>What will my dive cost with equipment hire\?<\/h2>\s*(<p>[\s\S]*?<\/p>)/i);
 if(!h||!h[1].includes('A$'))return '';
 // Keep the source's current amounts, equipment and assumptions, not a second price table in code.
 return h[1].replace(/Do you need everything, or already own some gear\?/gi,'');
}
function openingExample(topic,candidates,articleText){
 const shore=candidates.filter(x=>x.site.kind==='shore');
 // Ordinary nerves need ordinary guided-shore support, not an assumed boat-guide promise.
 let selected=shore.find(x=>x.site.name==='Oak Park')||shore[0];
 if(topic===276)selected=shore.find(x=>new Date(x.event.startDate+'T12:00:00Z').getUTCDay()===0)||selected;
 const rows=[];
 if(topic===276){
  rows.push("<h2>I don't have a dive buddy yet. Can I still come along?</h2>",
   "<p>Yes — you're very welcome to come on your own. On our regular guided shore dives, the Divemaster helps arrange buddy teams, explains the dive plan and leads the group underwater. It's a good way to meet local divers you could dive with again.</p>");
 }else if(topic===430){
  rows.push("<h2>I'm a bit nervous. Will someone be there to help me out?</h2>",
   "<p>Yes — on a suitable guided shore outing, the Divemaster explains the plan and entry, helps with buddy arrangements and leads the group underwater. Tell the team this is your first post-course dive so they can help match the outing and support to you. You don't need to know the site yourself.</p>");
 }else if(topic===429){
  rows.push('<h2>How much is the dive if I need to hire gear as well?</h2>');
  rows.push(existingCostAnswer(articleText)||'<p>The total combines the outing fee, equipment hire and tanks you need. Use the maintained hire example below for current components, and confirm the online checkout total.</p>');
 }else return [];
 if(selected){
  const {site,event:e}=selected;
  const why=topic===276?'The guided group gives you people to dive with and a chance to enjoy the reef together.':topic===430?'Its suitable shallower route and guided group let you focus on enjoying the reef rather than navigating it yourself.':'A regular guided shore outing is a practical next step, and you can arrange hire rather than buy a complete kit.';
  rows.push(`<p>Why don't you join our <a href="${esc(e.bookingUrl)}">${esc(site.name+' dive on '+label(e.startDate))}</a>${e.time?' at '+esc(e.time):''}? ${why} I think you'd really enjoy it.</p>`);
  rows.push('<p>This is a scheduled option: check current availability at the link. The team confirms the route and suitability for your experience and conditions.</p>');
 }else rows.push('<p>No suitable guided-shore date is verified in this excerpt between tomorrow and the next 14 Sydney days. Ask the team or check the complete maintained schedule for another appropriate option; do not invent a date.</p>');
 if(topic===430)rows.push('<p>Group guiding is not continuous one-to-one instruction. Forgotten essential skills, panic, a long break or difficulty managing equipment needs team or instructor advice before a normal group booking. Ordinary nerves alone do not automatically require another course or a private guide.</p>');
 rows.push('<p>These opening examples concern a newly certified diver choosing an ordinary guided shore outing. For Abyss New Diver Advice Agent 27449, use the once-only invitation policy: no fresh unsolicited invitation on later topics. Adapt to stated availability, certification and support needs. A boat departure has its own in-water guidance arrangements; do not apply a boat-only limitation to a regular guided shore answer.</p>');
 return rows;
}
export function renderFirstAnswerOptions(snapshot,choices,now=snapshot.checkedAt,{topic=0,articleText=''}={}){
 const window=firstAnswerWindow(snapshot,now),candidates=[...(choices?.primary||[])];
 if(choices?.boat&&!candidates.some(x=>x.event.id===choices.boat.event.id))candidates.push(choices.boat);
 ensure(candidates.length<=3,'Too many first-answer options');
 for(const {site,event:e} of candidates){
  const verified=window.events.find(x=>x.id===e.id);
  ensure(verified&&verified.bookingUrl===e.bookingUrl&&verified.startDate===e.startDate&&verified.time===e.time&&verified.availability==='check_availability','Choice is not a verified, non-full event from tomorrow within 14 Sydney days');
  ensure(['Oak Park','Bare Island','Henry Head'].includes(site.name),'Unapproved first-answer site');
 }
 const rows=[`<!-- ${OPENING_REVISION} -->`,...openingExample(topic,candidates,articleText)];
 if(!topic){
  rows.push('<p><strong>Upcoming local options for a certified new diver.</strong></p>');
  for(const {site,event:e} of candidates)rows.push(`<p><a href="${esc(e.bookingUrl)}">${esc(site.name+' — '+label(e.startDate)+(e.time?' at '+e.time:''))}</a>. ${esc(site.why)} Scheduled listing; check current availability at the supplied link.</p>`);
  if(!candidates.length)rows.push('<p>No dated option for the preferred first-dive sites is verified within this 14-day excerpt. This is not a claim that every possible beginner outing is unavailable. Use the complete maintained schedule or the team to check alternatives; do not invent an option.</p>');
 }
 rows.push(`<p>Schedule-check metadata, not a recommended dive date: Beginner schedule checked (ISO): ${esc(snapshot.checkedAt)}. Expires (ISO): ${esc(snapshot.expiresAt)}. This synchronised excerpt uses the maintained beginner schedule. Check dates describe data freshness, not an invitation to dive that day. Tomorrow in Australia/Sydney is the earliest recommendation date, even if today's calendar still lists an unstarted dive. Do not use this excerpt after expiry.</p>`);
 rows.push(`<p>These are not instructions to add a booking invitation to every answer. Existing dated recommendations satisfy the first-answer rule. On later turns supply dates only when requested. Preserve all safety exceptions; never guarantee conditions, final site or wildlife. Source: <a href="${SOURCE}">maintained beginner schedule</a>.</p>`);
 return rows.join('\n');
}
async function resolve(request){
 for(const cid of [CAL,SUPPORT]){const c=(await request('GET','/collections/'+cid)).collection;ensure(c?.id===cid&&c.siteId===SITE&&c.visibility==='private','Collection identity/privacy mismatch');}
 const refs=[];
 for(let page=1;page<=20;page++){
  const a=(await request('GET',`/collections/${CAL}/articles?status=published&pageSize=100&page=${page}`)).articles;
  ensure(a&&Array.isArray(a.items)&&Number.isInteger(a.pages),'Invalid article metadata list');refs.push(...a.items);
  if(page>=a.pages)break;if(page===20)throw new Error('Article metadata pagination incomplete');
 }
 const matches=refs.filter(x=>x.name===buddy.name);
 ensure(matches.length===1&&/^[0-9a-f]{24}$/.test(matches[0].id),'Expected buddy article not uniquely identified; no writes');
 return [...fixed,{...buddy,id:matches[0].id}];
}
function validate(a,t){
 ensure(a?.id===t.id&&a.collectionId===t.collectionId&&a.name===t.name&&a.status==='published'&&!a.hasDraft&&typeof a.text==='string','Article identity, publication or draft conflict');
 ensure(String(a.number)===String(t.number)||String(a.publicUrl).includes('/article/'+t.number+'-'),'Article number mismatch');return a;
}
const metadata=a=>JSON.stringify({id:a.id,collectionId:a.collectionId,name:a.name,slug:a.slug,status:a.status,keywords:a.keywords,categories:a.categories,related:a.related});
async function readAll(request){const targets=await resolve(request),records=[];for(const t of targets)records.push({t,a:validate((await request('GET','/articles/'+t.id)).article,t)});return records;}
export async function firstAnswerOptionsAreCurrent(request,canonicalArticle){
 const checked=canonicalArticle?.text?.match(/Checked \(ISO\):\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1];
 const records=await readAll(request);return !!checked&&records.every(({a})=>a.text.includes(START)&&a.text.includes(OPENING_REVISION)&&a.text.includes('Beginner schedule checked (ISO): '+checked+'.'));
}
export async function publishFirstAnswerOptions({request,snapshot,choices,now=snapshot.checkedAt,backup=async()=>{}}){
 ensure(Date.parse(now)<Date.parse(snapshot.expiresAt),'Date options expired before publication');
 const records=await readAll(request);
 // Preflight every target and delimiter before any write; retain current source prices.
 const plans=records.map(({a,t})=>({a,t,text:insertOptions(a.text,renderFirstAnswerOptions(snapshot,choices,now,{topic:t.number,articleText:a.text}))}));
 const results=[];
 for(const {a,t,text} of plans){
  if(a.text===text){results.push({id:a.id,status:'already-current'});continue;}
  await backup({id:a.id,text:a.text});
  const again=validate((await request('GET','/articles/'+a.id)).article,t);
  ensure(hash(again.text)===hash(a.text)&&metadata(again)===metadata(a),'Concurrent article edit; no overwrite');
  await request('PUT','/articles/'+a.id,{text});
  const after=validate((await request('GET','/articles/'+a.id)).article,t);
  ensure(after.text===text&&metadata(after)===metadata(a)&&stripOptions(after.text)===stripOptions(a.text),'Date excerpt readback or original-content mismatch');
  results.push({id:a.id,number:t.number,status:'updated-and-verified',bodyHash:hash(after.text),originalContentUnchanged:true,metadataUnchanged:true});
 }
 return {checkedAt:snapshot.checkedAt,expiresAt:snapshot.expiresAt,results};
}
