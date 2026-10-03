/** Maintained event facts only; conversation policy belongs to the AI Agent Identity. */
import {createHash} from 'node:crypto';
export const FIRST_DIVE_TARGET={id:'6abf733d3be702ed269e3fa6',collectionId:'6abf61e6c3e570044c2891ed',name:'Your first guided dive after certification: what happens and who helps'};
export const FIRST_DIVE_MARKER='ABYSS_FIRST_DIVE_RECOMMENDATIONS_V1';
export const FIRST_DIVE_REVISION='ABYSS_BEGINNER_FACTS_V6_STRICT_DEFAULT_DAYS';
export const SOURCE='https://www.abyss.com.au/beginner-diver-widget';
const TITLE='<h2>Which dive should I book first?</h2>';
const ensure=(ok,m)=>{if(!ok)throw new Error(m);};
const hash=x=>createHash('sha256').update(String(x)).digest('hex');
export const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHtml;
const localDate=instant=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));
const dateLabel=date=>new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
const weekday=e=>new Date(e.startDate+'T12:00:00Z').getUTCDay();
const dayRank=e=>({0:0,6:1,5:2}[weekday(e)]??3);
/** Apply only after suitability, date-window and explicit-availability filtering.
 * Canonical schedule ordering is unchanged; this ranks recommendation candidates. */
export function compareRecommendationEvents(a,b){
 return dayRank(a)-dayRank(b)||a.startDate.localeCompare(b.startDate)||(a.time||'99').localeCompare(b.time||'99')||String(a.id).localeCompare(String(b.id));
}
export function newDiverWindow(s,now=s?.checkedAt){
 const n=Date.parse(now),checked=Date.parse(s?.checkedAt),expiry=Date.parse(s?.expiresAt);
 ensure(s?.source===SOURCE&&Array.isArray(s.events),'Unrecognised beginner snapshot');
 ensure(Number.isFinite(n)&&Number.isFinite(checked)&&Number.isFinite(expiry)&&checked<=n&&expiry>checked&&expiry-checked<=36*3600000,'Invalid snapshot times');
 const today=localDate(now),add=days=>new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
 const last=add(14),expired=n>=expiry;
 return {...s,events:expired?[]:s.events.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.startDate||'')&&e.startDate>today&&e.startDate<=last&&(!e.startInstant||(Number.isFinite(Date.parse(e.startInstant))&&Date.parse(e.startInstant)>n))),expired,invitationWindow:{fromSydneyDate:add(1),throughSydneyDate:last}};
}
const sites=[
 {key:'oak',name:'Oak Park',match:/\boak park\b/i,kind:'shore',path:'/charters/guided-shore-dives',why:'A shallow reef, typically 8–12 m, gives you a chance to settle into your diving and enjoy the fish life without needing to go deep.'},
 {key:'bare',name:'Bare Island',match:/\bbare island\b/i,kind:'shore',path:'/charters/guided-shore-dives',why:'Colourful sponge gardens and rocky reef make an enjoyable outing on a suitable 12–18 m route. Group guidance means you do not need to know the site yourself; the team confirms the currently permitted entry and route.'},
 {key:'steps',name:'The Steps',match:/\b(?:the\s+)?steps\b/i,kind:'shore',path:'/charters/guided-shore-dives',why:'A guided reef outing for divers comfortable with stairs and a rocky entry. The team must match the current, entry, depth and route to the diver; this is not an automatically easy or shallow first dive.'},
 {key:'henry',name:'Henry Head',match:/\bhenry head\b/i,kind:'boat',path:'/charters/boat-dives',why:'A possible first-boat option on the shallower sponge-garden route; deeper areas are not necessary. Confirm the route and in-water guidance for this departure.'},
 {key:'marvels',name:'Marine Marvels',match:/marine marvels/i,kind:'shore',path:'/charters/marine-marvels-dives',why:'A themed, marine-biologist-led outing for a diver who enjoys observing and learning about marine life. The actual event, recent experience, buoyancy, site and conditions determine suitability.'}
];
export function firstDiveChoices(s,{now=s?.checkedAt,requestedWeekdays=null}={}){
 if(requestedWeekdays!==null)ensure(Array.isArray(requestedWeekdays)&&requestedWeekdays.length>0&&requestedWeekdays.every(x=>Number.isInteger(x)&&x>=0&&x<=6),'Invalid requested weekdays');
 const eligibleWeekdays=requestedWeekdays===null?[0,6,5]:requestedWeekdays;
 const window=newDiverWindow(s,now),choices=[];
 for(const site of sites){
  const candidates=window.events.filter(e=>{
   if(e.kind!==site.kind||!site.match.test(site.key==='marvels'?(e.product||''):e.title)||e.availability!=='check_availability')return false;
   if(!eligibleWeekdays.includes(weekday(e)))return false;
   if(/\b(night|twilight|dusk|sunset|drift|advanced|confident|technical|unguided|members|club)\b/i.test(e.title+' '+(e.notes||[]).join(' ')))return false;
   // A Leap-to-Steps route is not the ordinary Steps outing requested here.
   if(site.key==='steps'&&/\bleap\b/i.test(e.title+' '+(e.notes||[]).join(' ')))return false;
   if(site.key==='marvels'&&(!e.title||!Number.isFinite(e.listedPrice?.amount)||e.listedPrice.amount<0||e.listedPrice.currency!=='AUD'))return false;
   try{const u=new URL(e.bookingUrl);return u.protocol==='https:'&&u.hostname==='www.abyss.com.au'&&!u.username&&!u.password&&!u.port&&u.pathname.replace(/\/$/,'')===site.path&&!!u.searchParams.get('q');}catch{return false;}
  }).sort(compareRecommendationEvents);
  // Rank ALL eligible dates before taking one per site: a later Sunday must
  // not be lost simply because an earlier Friday was encountered first.
  if(candidates[0])choices.push({site,event:candidates[0]});
 }
 // Preserve the regular guided-shore default support category. A boat option
 // remains separately available; day preference does not silently change support.
 choices.sort((a,b)=>Number(a.site.kind==='boat')-Number(b.site.kind==='boat')||compareRecommendationEvents(a.event,b.event));
 // Marine Marvels stays interest-specific, not an automatic substitute
 // for a basic shore outing when its actual route is unconfirmed.
 return {primary:choices.filter(x=>x.site.key!=='marvels').slice(0,2),boat:choices.find(x=>x.site.key==='henry')||null,marine:choices.find(x=>x.site.key==='marvels')||null,shoreOptions:choices.filter(x=>x.site.kind==='shore'&&x.site.key!=='marvels'),expired:window.expired};
}
export function allFirstDiveChoices(selected){
 const out=[];for(const x of [...(selected.primary||[]),...(selected.shoreOptions||[]),selected.boat,selected.marine])if(x&&!out.some(y=>y.event.id===x.event.id))out.push(x);return out;
}
export function eventFactCard({site,event:e},prefix=''){
 const title=site.key==='marvels'?site.name+' — '+e.title:site.name;
 const fee=e.listedPrice?.currency==='AUD'&&Number.isFinite(e.listedPrice.amount)?` Listed activity fee A$${esc(e.listedPrice.amount.toFixed(2))}; confirm inclusions and hire extras.`:'';
 const extra=site.key==='marvels'?' This is a separately priced Marine Marvels event, not free regular shore guiding. Tanks and rental gear are additional. The location and route are confirmed for the selected event; no unlisted location or sighting is promised.':'';
 return `<p><strong>${esc(prefix+title+' — '+dateLabel(e.startDate)+(e.time?' at '+e.time:''))}</strong>. ${esc(site.why)}${fee}${extra} <a href="${esc(e.bookingUrl)}">Check availability and book ${esc(title+' — '+dateLabel(e.startDate))}</a>.</p>`;
}
export function renderFirstDiveExcerpt(s,{now=s.checkedAt}={}){
 const selected=firstDiveChoices(s,{now}),out=[TITLE,`<!-- ${FIRST_DIVE_MARKER} -->`,`<!-- ${FIRST_DIVE_REVISION} -->`];
 out.push('<p>Appropriate starting options are guided local outings matched to certification, experience, interests, entry, route and conditions. Oak Park and Bare Island are practical shore options; The Steps, Henry Head and a suitable Marine Marvels event can fit particular interests when their entry, route and support suit the diver. These are candidate outings, not unconditional suitability approvals.</p>');
 out.push('<p>Default proactive invitation candidates are suitable Sunday outings, then Saturday only if no suitable Sunday qualifies, then Friday only if neither qualifies. Stated availability and suitability come first. Other weekdays remain in the full maintained calendar for explicit requests; they are not automatic substitutes in this default shortlist.</p>');
 selected.primary.forEach((choice,i)=>out.push(eventFactCard(choice,i===0?'First choice: ':'Another option: ')));
 // Keep every preferred shore option available even when outside the first two.
 for(const choice of selected.shoreOptions||[])if(!selected.primary.some(x=>x.event.id===choice.event.id))out.push(eventFactCard(choice,'Additional shore option: '));
 if(selected.boat&&!selected.primary.some(x=>x.event.id===selected.boat.event.id))out.push(eventFactCard(selected.boat,'Boat option: '));
 if(selected.marine)out.push(eventFactCard(selected.marine,'Marine-life option: '));
 if(!allFirstDiveChoices(selected).length)out.push('<p>No current dated recommendation for these preferred experiences is verified in this excerpt. This is not the full calendar and does not establish that all other dates are unavailable.</p>');
 out.push('<p>For regular guided shore outings, the Divemaster explains the entry and dive plan, helps arrange buddy teams and leads the group underwater. Coming without a buddy and arranging hire are normal options. The team confirms the route and support for the diver and conditions. Group guidance is not continuous one-to-one tuition; there is no pressure to dive while unready.</p>');
 out.push(`<p><strong>Dated recommendations checked: ${esc(s.checkedAt)}. Expires: ${esc(s.expiresAt)}.</strong> These event facts are generated from the maintained schedule. Tomorrow through 14 Sydney calendar days is the recommendation window, re-evaluated at reply time. An outing that has become today is no longer a new recommendation. Expiry applies to the data check, not the future event date. Listings require an availability check and never guarantee conditions or sightings.</p>`);
 out.push(`<p>Canonical source: <a href="${SOURCE}">beginner dive event data</a>. The complete maintained schedule contains other dates; this is only a shortlist. Conversation policy is set in the agent Identity.</p>`);
 return out.join('\n');
}
export function replaceFirstDiveSection(text,section){
 ensure(typeof text==='string'&&text.split(TITLE).length===2,'First-dive heading missing or duplicated; no overwrite');
 const start=text.indexOf(TITLE),end=text.indexOf('<h2>',start+TITLE.length);ensure(end>start,'Next existing FAQ heading missing; no overwrite');
 return text.slice(0,start)+section+'\n'+text.slice(end);
}
function validate(a){const t=FIRST_DIVE_TARGET;ensure(a?.id===t.id&&a.collectionId===t.collectionId&&a.name===t.name&&a.status==='published'&&!a.hasDraft&&typeof a.text==='string','First-dive article identity, publication or draft conflict');return a;}
async function read(request){const t=FIRST_DIVE_TARGET,c=(await request('GET','/collections/'+t.collectionId)).collection;ensure(c?.id===t.collectionId&&c.siteId==='5d0ed4d02c7d3a6ebd2268ed'&&c.visibility==='private','First-dive collection privacy mismatch');return validate((await request('GET','/articles/'+t.id)).article);}
export async function firstDiveExcerptIsCurrent(request,canonicalArticle){const checked=canonicalArticle?.text?.match(/Checked \(ISO\):\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1];const a=await read(request);return !!checked&&a.text.includes(FIRST_DIVE_MARKER)&&a.text.includes(FIRST_DIVE_REVISION)&&a.text.includes('Dated recommendations checked: '+checked+'.');}
const metadata=a=>JSON.stringify({id:a.id,collectionId:a.collectionId,name:a.name,slug:a.slug,status:a.status,keywords:a.keywords,categories:a.categories,related:a.related});
export async function publishFirstDiveExcerpt({request,snapshot,now=snapshot.checkedAt,backup=async()=>{}}){
 ensure(Date.parse(now)<Date.parse(snapshot.expiresAt),'First-dive candidate expired');
 const original=await read(request),text=replaceFirstDiveSection(original.text,renderFirstDiveExcerpt(snapshot,{now}));
 if(original.text===text)return {status:'already-current',articleId:FIRST_DIVE_TARGET.id};
 await backup({id:original.id,text:original.text});
 const again=await read(request);ensure(hash(again.text)===hash(original.text)&&metadata(again)===metadata(original),'Concurrent first-dive article edit; no overwrite');
 await request('PUT','/articles/'+original.id,{text});const after=await read(request);ensure(after.text===text&&metadata(after)===metadata(original),'First-dive excerpt readback mismatch');
 return {status:'updated-and-verified',articleId:after.id,checkedAt:snapshot.checkedAt,expiresAt:snapshot.expiresAt,selectedEventIds:allFirstDiveChoices(firstDiveChoices(snapshot,{now})).map(x=>x.event.id),bodyHash:hash(after.text),metadataUnchanged:true};
}
