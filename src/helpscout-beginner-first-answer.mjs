/** Neutral, synchronised date facts in the existing key new-diver FAQs.
 * The invitation/once-only policy belongs to Agent 27449, not these shared Docs. */
import {createHash} from 'node:crypto';
const SITE='5d0ed4d02c7d3a6ebd2268ed',CAL='6ab98d4249f1bc2c6aefca54',SUPPORT='6abf61e6c3e570044c2891ed';
export const SOURCE='https://www.abyss.com.au/beginner-diver-widget';
export const OPTIONS_MARKER='ABYSS_BEGINNER_FIRST_ANSWER_OPTIONS_V1';
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
 const lastDate=new Date(Date.parse(today+'T12:00:00Z')+14*86400000).toISOString().slice(0,10);
 const events=n>=expires?[]:snapshot.events.filter(e=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate||'')||e.startDate<today||e.startDate>lastDate)return false;
  if(e.startDate===lastDate&&(!e.time||e.time>time))return false;
  if(e.startInstant)return Number.isFinite(Date.parse(e.startInstant))&&Date.parse(e.startInstant)>n;
  return e.startDate>today;
 });
 return {...snapshot,events,invitationWindow:{fromSydneyDate:today,throughSydneyDate:lastDate,throughSydneyTime:time}};
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
 const original=stripOptions(text),first=original.search(/<h2(?:\s[^>]*)?>/i);
 let at=original.length;
 if(first>=0){const close=original.toLowerCase().indexOf('</h2>',first);ensure(close>=0,'Invalid FAQ heading');const next=original.slice(close+5).search(/<h2(?:\s[^>]*)?>/i);if(next>=0)at=close+5+next;}
 return original.slice(0,at)+START+'\n'+block+'\n'+END+original.slice(at);
}
export function renderFirstAnswerOptions(snapshot,choices,now=snapshot.checkedAt){
 const window=firstAnswerWindow(snapshot,now),candidates=[...(choices?.primary||[])];
 if(choices?.boat&&!candidates.some(x=>x.event.id===choices.boat.event.id))candidates.push(choices.boat);
 ensure(candidates.length<=3,'Too many first-answer options');
 const rows=[`<p><strong>Upcoming local options for a certified new diver.</strong> Beginner schedule checked (ISO): ${esc(snapshot.checkedAt)}. Expires (ISO): ${esc(snapshot.expiresAt)}. This is a synchronised excerpt of the maintained beginner schedule; the check's expiry is not a deadline for the dive itself.</p>`];
 for(const {site,event:e} of candidates){
  const verified=window.events.find(x=>x.id===e.id);
  ensure(verified&&verified.bookingUrl===e.bookingUrl&&verified.startDate===e.startDate&&verified.time===e.time&&verified.availability==='check_availability','Choice is not a verified, non-full event within 14 Sydney days');
  ensure(['Oak Park','Bare Island','Henry Head'].includes(site.name),'Unapproved first-answer site');
  rows.push(`<p><a href="${esc(e.bookingUrl)}">${esc(site.name+' — '+label(e.startDate)+(e.time?' at '+e.time:''))}</a>. ${esc(site.why)} Scheduled listing; check current availability at the supplied link.</p>`);
 }
 if(!candidates.length)rows.push('<p>No dated option for the preferred first-dive sites is verified within this 14-day excerpt. This is not a claim that every possible beginner outing is unavailable. Use the complete maintained schedule or the team to check alternatives; do not invent an option.</p>');
 if(candidates.some(x=>x.site.kind==='shore'))rows.push('<p>For these regular guided shore outings, the Divemaster briefs the plan and entry, helps arrange buddy teams and leads the group underwater. Joining without a buddy and arranging equipment hire are normal options. Final route and support must suit the diver and conditions; group guiding is not continuous one-to-one supervision.</p>');
 if(candidates.some(x=>x.site.kind==='boat'))rows.push('<p>For a boat option, confirm the shallow route and in-water guidance for the selected departure. A boat briefing or crew member does not by itself promise an underwater guide.</p>');
 rows.push(`<p>These are date facts, not instructions to add a booking invitation to every answer. Use each agent's conversation policy and the diver's actual availability and needs. Disregard an outing once it has started in Australia/Sydney, or this date information after expiry. Source: <a href="${SOURCE}">maintained beginner schedule</a>.</p>`);
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
 const records=await readAll(request);return !!checked&&records.every(({a})=>a.text.includes(START)&&a.text.includes('Beginner schedule checked (ISO): '+checked+'.'));
}
export async function publishFirstAnswerOptions({request,snapshot,choices,now=snapshot.checkedAt,backup=async()=>{}}){
 ensure(Date.parse(now)<Date.parse(snapshot.expiresAt),'Date options expired before publication');
 const block=renderFirstAnswerOptions(snapshot,choices,now),records=await readAll(request);
 // Preflight every target and delimiter before any write.
 const plans=records.map(({a,t})=>({a,t,text:insertOptions(a.text,block)}));
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
