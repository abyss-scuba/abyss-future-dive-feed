/** A small, derived first-dive excerpt; the existing daily snapshot remains canonical. */
import {createHash} from 'node:crypto';
export const FIRST_DIVE_TARGET={id:'6abf733d3be702ed269e3fa6',collectionId:'6abf61e6c3e570044c2891ed',name:'Your first guided dive after certification: what happens and who helps'};
export const FIRST_DIVE_MARKER='ABYSS_FIRST_DIVE_RECOMMENDATIONS_V1';
const SOURCE='https://www.abyss.com.au/beginner-diver-widget';
const TITLE='<h2>Which dive should I book first?</h2>';
const ensure=(ok,m)=>{if(!ok)throw new Error(m);};
const hash=x=>createHash('sha256').update(String(x)).digest('hex');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate=instant=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));
const dateLabel=date=>new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
const sites=[
 {key:'oak',name:'Oak Park',match:/\boak park\b/i,kind:'shore',path:'/charters/guided-shore-dives',why:'A shallow reef, typically 8–12 m, gives you a chance to settle into your diving and enjoy the fish life without needing to go deep.'},
 {key:'bare',name:'Bare Island',match:/\bbare island\b/i,kind:'shore',path:'/charters/guided-shore-dives',why:'Colourful sponge gardens and rocky reef make an enjoyable first outing on a suitable 12–18 m route. The Divemaster leads the group, so you do not need to know the site yourself.'},
 {key:'henry',name:'Henry Head',match:/\bhenry head\b/i,kind:'boat',path:'/charters/boat-dives',why:'A good first-boat option on the shallower sponge-garden route, typically 8–12 m; the deeper areas are not necessary. The boat platform and ladders avoid a rocky shore entry.'}
];
export function firstDiveChoices(s,{now=s?.checkedAt}={}){
 const n=Date.parse(now),checked=Date.parse(s?.checkedAt),expiry=Date.parse(s?.expiresAt);
 ensure(s?.source===SOURCE&&Array.isArray(s.events),'Unrecognised beginner snapshot');
 ensure(Number.isFinite(n)&&Number.isFinite(checked)&&Number.isFinite(expiry)&&checked<=n&&expiry>checked&&expiry-checked<=36*3600000,'Invalid snapshot times');
 if(n>=expiry)return {primary:[],boat:null,expired:true};
 const today=localDate(now),horizon=new Date(Date.parse(today+'T12:00:00Z')+42*86400000).toISOString().slice(0,10);
 const choices=[];
 for(const site of sites){
  const candidates=s.events.filter(e=>{
   if(e.kind!==site.kind||!site.match.test(e.title)||e.availability!=='check_availability')return false;
   if(/\b(night|twilight|dusk|sunset|drift|advanced|confident|technical|unguided|members|club)\b/i.test(e.title+' '+(e.notes||[]).join(' ')))return false;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate||'')||e.startDate<today||e.startDate>horizon)return false;
   if(e.startInstant ? !Number.isFinite(Date.parse(e.startInstant))||Date.parse(e.startInstant)<=n : e.startDate===today)return false;
   try{const u=new URL(e.bookingUrl);return u.protocol==='https:'&&u.hostname==='www.abyss.com.au'&&!u.username&&!u.password&&!u.port&&u.pathname.replace(/\/$/,'')===site.path&&!!u.searchParams.get('q');}catch{return false;}
  }).sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.time||'99').localeCompare(b.time||'99')||String(a.id).localeCompare(String(b.id)));
  // Default first-booking suggestions favour a date the newcomer can plan for.
  // Same-day events remain in the full canonical schedule for explicit requests.
  const e=candidates.find(x=>x.startDate>today)||candidates[0];
  if(e)choices.push({site,event:e});
 }
 return {primary:choices.slice(0,2),boat:choices.find(x=>x.site.key==='henry')||null,expired:false};
}
const card=({site,event:e},prefix='')=>`<h3>${esc(prefix+site.name+' — '+dateLabel(e.startDate)+(e.time?' at '+e.time:''))}</h3>\n<p>${esc(site.why)} <a href="${esc(e.bookingUrl)}">Check availability and book ${esc(site.name+' — '+dateLabel(e.startDate))}</a>.</p>`;
export function renderFirstDiveExcerpt(s,{now=s.checkedAt}={}){
 const selected=firstDiveChoices(s,{now}),out=[TITLE,`<!-- ${FIRST_DIVE_MARKER} -->`,
 `<p><strong>Dated recommendations checked: ${esc(s.checkedAt)}. Expires: ${esc(s.expiresAt)}.</strong> These dates are generated from the same maintained beginner schedule, not manually entered examples. Ignore an outing once it has started in Australia/Sydney, and do not use dated recommendations after expiry.</p>`];
 if(!selected.primary.length){out.push('<p>A first guided local outing at Oak Park, Bare Island or a suitable Henry Head shallow route can be a good starting point. No current dated recommendation for these sites is verified in this excerpt; check the <a href="https://www.abyss.com.au/beginner-dive-calendar">Beginner Dive Calendar</a> or ask the team rather than inventing a date.</p>');return out.join('\n');}
 out.push(`<p>For your first dive after qualifying, I would suggest ${selected.primary.length===2?'these two options':'this option'}:</p>`);
 selected.primary.forEach((choice,i)=>out.push(card(choice,i===0?'First choice: ':'Another good option: ')));
 if(selected.primary.some(x=>x.site.kind==='shore'))out.push('<p>On these guided shore outings, the Divemaster explains the entry and dive plan, helps arrange buddy teams and guides the group underwater. You can come without a buddy and arrange equipment hire. Tell the team you are newly certified: the aim is to settle in, enjoy the reef and meet people to dive with again, not to rush into a harder dive.</p>');
 out.push('<p>The team confirms the route and support for your experience and the conditions. There is no pressure to dive when you feel unready. Which of these dates would suit you better?</p>');
 if(selected.boat&&!selected.primary.some(x=>x.site.key==='henry'))out.push(card(selected.boat,'Prefer a boat instead? '));
 if(selected.boat)out.push('<p>For Henry Head, confirm the shallow route and in-water guidance for that departure. The crew briefs the boat, entry and buddy arrangements. Do not transfer a guided-shore supervision promise to a boat event or require an Advanced course merely because deeper water exists at Henry Head.</p>');
 out.push('<p>Answer the first-booking question with two of these dated choices, a brief reason for each and reassuring support information; do not ask permission to check dates first. Substitute Henry Head when a boat suits the diver better. These are scheduled options, not live place counts or an unconditional suitability approval. Use the exact supplied booking links, and adapt to any preferences already given.</p>',
 `<p>Canonical source: <a href="${SOURCE}">beginner dive event data</a>. The complete maintained shore, boat and travel schedule remains in the existing schedule article.</p>`);
 return out.join('\n');
}
export function replaceFirstDiveSection(text,section){
 ensure(typeof text==='string'&&text.split(TITLE).length===2,'First-dive heading missing or duplicated; no overwrite');
 const start=text.indexOf(TITLE),end=text.indexOf('<h2>',start+TITLE.length);
 ensure(end>start,'Next existing FAQ heading missing; no overwrite');
 return text.slice(0,start)+section+'\n'+text.slice(end);
}
function validate(a){const t=FIRST_DIVE_TARGET;ensure(a?.id===t.id&&a.collectionId===t.collectionId&&a.name===t.name&&a.status==='published'&&!a.hasDraft&&typeof a.text==='string','First-dive article identity, publication or draft conflict');return a;}
async function read(request){const t=FIRST_DIVE_TARGET,c=(await request('GET','/collections/'+t.collectionId)).collection;ensure(c?.id===t.collectionId&&c.siteId==='5d0ed4d02c7d3a6ebd2268ed'&&c.visibility==='private','First-dive collection privacy mismatch');return validate((await request('GET','/articles/'+t.id)).article);}
export async function firstDiveExcerptIsCurrent(request,canonicalArticle){
 const checked=canonicalArticle?.text?.match(/Checked \(ISO\):\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1];
 const a=await read(request);return !!checked&&a.text.includes(FIRST_DIVE_MARKER)&&a.text.includes('Dated recommendations checked: '+checked+'.');
}
const metadata=a=>JSON.stringify({id:a.id,collectionId:a.collectionId,name:a.name,slug:a.slug,status:a.status,keywords:a.keywords,categories:a.categories,related:a.related});
export async function publishFirstDiveExcerpt({request,snapshot,now=snapshot.checkedAt,backup=async()=>{}}){
 ensure(Date.parse(now)<Date.parse(snapshot.expiresAt),'First-dive candidate expired');
 const original=await read(request),text=replaceFirstDiveSection(original.text,renderFirstDiveExcerpt(snapshot,{now}));
 if(original.text===text)return {status:'already-current',articleId:FIRST_DIVE_TARGET.id};
 await backup({id:original.id,text:original.text});
 const again=await read(request);ensure(hash(again.text)===hash(original.text)&&metadata(again)===metadata(original),'Concurrent first-dive article edit; no overwrite');
 await request('PUT','/articles/'+original.id,{text});
 const after=await read(request);ensure(after.text===text&&metadata(after)===metadata(original),'First-dive excerpt readback mismatch');
 return {status:'updated-and-verified',articleId:after.id,checkedAt:snapshot.checkedAt,expiresAt:snapshot.expiresAt,selectedEventIds:firstDiveChoices(snapshot,{now}).primary.map(x=>x.event.id),bodyHash:hash(after.text),metadataUnchanged:true};
}
