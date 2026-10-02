import { createHash } from 'node:crypto';
import { beginnerAvailability, BEGINNER_SNAPSHOT_TTL_MS } from './helpscout-beginner-availability.mjs';
export const ZONE='Australia/Sydney';
export const SOURCE_URL='https://www.abyss.com.au/beginner-diver-widget';
export const TITLE='Upcoming beginner dive dates — shore, boat and trips';
export const SLUG='upcoming-beginner-dive-dates-shore-boat-trips';
export const SITE_ID='5d0ed4d02c7d3a6ebd2268ed';
export const COLLECTION_NAME='New Diver Support';
export const MARKER='ABYSS_BEGINNER_SNAPSHOT_V1';
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const paths=new Map([
 ['/charters/guided-shore-dives','shore'], ['/charters/marine-marvels-dives','shore'],
 ['/charters/real-shark-diving-in-ocean','shore'], ['/charters/boat-dives','boat'],
 ['/charters/tech-boat-dives','boat'], ['/charters/scuba-dive-with-seals','boat'],
 ['/charters/single-seal-dive','boat'], ['/charters/freedive-training','exclude:freediving'],
 ['/charters/social-events','exclude:social'], ['/charters/try-it-dry','exclude:equipment-trial']
]);
export function sydneyParts(instant){
 const d=new Date(instant);assert(Number.isFinite(+d),'Invalid instant');
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function parseDate(text){
 const m=String(text).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
 assert(m,'Unrecognised source date');const month=months.findIndex(x=>x.toLowerCase()===m[2].toLowerCase());
 assert(month>=0 && +m[3]>=2020 && +m[3]<=2099,'Source year/month outside supported range');
 const d=new Date(Date.UTC(+m[3],month,+m[1]));
 assert(d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===month&&d.getUTCDate()===+m[1],'Invalid source calendar date');
 return d.toISOString().slice(0,10);
}
export function parseTime(text){
 if(text===null||text===undefined||String(text).trim()==='')return null;
 const m=String(text).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);assert(m,'Unrecognised source time');
 let h=+m[1],min=+m[2];assert(h<=23&&min<=59,'Invalid source clock time');
 const ampm=(m[3]||'').toUpperCase();
 if(ampm==='AM'){assert(h<=12,'Conflicting 24-hour time and AM');if(h===12)h=0;}
 if(ampm==='PM'){assert(h!==0,'Conflicting midnight and PM');if(h<12)h+=12;}
 return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}
export function sydneyInstant(date,time){
 // Verify Sydney's contemporary +10/+11 candidates using IANA data. Reject
 // skipped and ambiguous event times rather than silently shifting them.
 const candidates=[10,11].map(h=>new Date(Date.parse(`${date}T${time}:00Z`)-h*3600000).toISOString())
  .filter(t=>{const p=sydneyParts(t);return p.date===date&&p.time===time;});
 assert(candidates.length===1,'Ambiguous or nonexistent Sydney event time');return candidates[0];
}
export function bookingIdentity(url){
 const u=new URL(url);assert(u.protocol==='https:'&&u.hostname==='www.abyss.com.au'&&!u.username&&!u.password&&!u.port,'Unexpected booking origin');
 const q=u.searchParams.get('q');assert(q&&/^[A-Za-z0-9+/]+={0,2}$/.test(q),'Invalid booking payload');
 const params=new URLSearchParams(Buffer.from(q,'base64').toString('utf8'));
 const id=params.get('open_cart_id'),title=params.get('part_number');
 assert(/^\d+$/.test(id||'')&&title?.trim(),'Missing selected booking identity');
 return {id,title:title.trim(),path:u.pathname.replace(/\/$/,''),url:u.href};
}
export function parsePrice(raw){
 if(typeof raw!=='string')return null;
 const m=raw.trim().match(/^(?:A\$|AUD\s*\$?|\$)(\d+(?:,\d{3})*(?:\.\d{2})?)$/);
 return m?{amount:Number(m[1].replaceAll(',','')),currency:'AUD',basis:'listed booking price; confirm package basis and extras'}:null;
}
function parseRow(row,widget,checkedAt){
 assert(Array.isArray(row.cells)&&row.cells.length===8,'Unexpected source columns');
 const links=(row.links||[]).filter(l=>l.url.includes('?q='));
 const urls=[...new Set(links.map(x=>x.url))];assert(urls.length===1,'Missing or conflicting row booking link');
 const b=bookingIdentity(urls[0]);let kind;
 if(widget==='widget3857'){assert(b.path.startsWith('/trips/'),'Travel record is not a trip');kind='trip';}
 else {kind=paths.get(b.path);assert(kind,'Unknown charter product; review classification before publication');}
 const startDate=parseDate(row.cells[1]),endDate=row.cells[2]?.trim()?parseDate(row.cells[2]):null;
 assert(!endDate||endDate>=startDate,'Trip/event ends before it starts');
 const detailStarts=(row.detail||[]).filter(x=>/^Start date:/i.test(x));assert(detailStarts.length<=1,'Conflicting detail starts');
 let time=null;
 if(detailStarts.length){
  const match=detailStarts[0].match(/^Start date:\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})(?:\s+(.+))?$/i);
  assert(match&&parseDate(match[1])===startDate,'Main/detail start date conflict');time=parseTime(match[2]);
 }
 const instant=kind==='trip'||kind.startsWith('exclude:')||!time?null:sydneyInstant(startDate,time);
 const availability=beginnerAvailability(row.cells[5],{checkedAt,now:checkedAt});
 // Explicit output whitelist: positive places and maximum capacity never
 // enter AI knowledge, including through a spread of a source record.
 const notes=[];const publicText=`${b.title} ${row.cells[3]} ${(row.detail||[]).join(' ')}`;
 if(/tech-boat|technical/i.test(b.path+' '+publicText))notes.push('Technical departure, not an ordinary new-diver option; appropriate technical qualification and team approval required.');
 if(/\bunguided\b/i.test(publicText))notes.push('The listing explicitly says unguided; no underwater escort is promised.');
 if(/\bclub\s*dives?\b/i.test(publicText))notes.push('Members-only listing: check club membership and individual suitability.');
 if(/no experience needed/i.test(row.cells[3]))notes.push('The source category is not permission for uncertified participation. Check the actual product prerequisites.');
 const description=(row.detail||[]).filter(x=>!/^Start date:|^Our Price:/i.test(x)).join(' ');
 const depth=description.match(/\b\d{1,2}(?:\s*[–-]\s*\d{1,2})?\s*m\b/i)?.[0]||null;
 return {id:b.id,kind,title:b.title,product:row.cells[3],startDate,endDate,time,
  timeBasis:kind==='trip'?'as listed; confirm itinerary time zone':ZONE,startInstant:instant,
  bookingUrl:b.url,listedPrice:parsePrice(row.cells[6]),availability:availability.status,
  availabilityLabel:availability.label,listedDepth:depth,notes,sourceWidget:widget};
}
export function buildSnapshot(report,{now=report?.finishedAt}={}){
 assert(report?.source===SOURCE_URL&&Array.isArray(report.errors)&&report.errors.length===0,'Source extraction failed');
 const checked=Date.parse(report.finishedAt),current=Date.parse(now);
 assert(Number.isFinite(checked)&&Number.isFinite(current)&&checked<=current,'Invalid successful-check time');
 assert(current-checked<BEGINNER_SNAPSHOT_TTL_MS,'Source fixture has expired');
 const checkedAt=new Date(checked).toISOString(),today=sydneyParts(checkedAt).date,events=[],excluded=[],seen=new Set(),sourceCounts={};
 for(const [id,header] of [['widget3856','Charter'],['widget3857','Travel']]){
  const matches=report.widgets.filter(w=>w.id===id);assert(matches.length===1,`Missing or duplicate ${id}`);
  const w=matches[0];assert(w.complete===true&&w.headers?.[3]===header&&Array.isArray(w.pages),'Source widget not completely verified');
  const rows=w.pages.flatMap(p=>p.rows);assert(rows.length===w.rowCount,'Declared/extracted row count mismatch');
  assert(rows.length>0||w.explicitEmpty===true,'Empty extraction is not confirmed zero events');
  sourceCounts[id]=rows.length;
  for(const row of rows){
   const e=parseRow(row,id,checkedAt);assert(!seen.has(e.id),'Duplicate booking identity');seen.add(e.id);
   if(e.kind.startsWith('exclude:')){excluded.push({id:e.id,reason:e.kind.slice(8)});continue;}
   if(e.startDate<today||(e.startInstant&&Date.parse(e.startInstant)<=checked)){excluded.push({id:e.id,reason:'already started'});continue;}
   events.push(e);
  }
 }
 events.sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.time||'99').localeCompare(b.time||'99')||a.id.localeCompare(b.id));
 const counts={shore:0,boat:0,trip:0};for(const e of events)counts[e.kind]++;
 return {version:1,source:SOURCE_URL,checkedAt,expiresAt:new Date(checked+BEGINNER_SNAPSHOT_TTL_MS).toISOString(),timezone:ZONE,
  counts,sourceCounts,excluded,events,coverage:{first:events[0]?.startDate||null,last:events.at(-1)?.startDate||null}};
}
export function validateCountChange(next,previous){
 if(!previous)return;
 for(const id of ['widget3856','widget3857']){
  const before=previous.sourceCounts?.[id],after=next.sourceCounts[id];
  assert(Number.isInteger(before)&&before>=0,'Previous count metadata invalid');
  assert(after>=before*0.6,`Unexplained source count drop for ${id}`);
 }
}
const html=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=iso=>new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(iso+'T12:00:00Z'));
export function renderArticle(s){
 const check=sydneyParts(s.checkedAt);
 const lines=[`<!-- ${MARKER} -->`,
 `<p><strong>Last successfully checked: ${html(pretty(check.date))} at ${check.time}, Australia/Sydney.</strong></p>`,
 `<p>Checked (ISO): ${s.checkedAt}. Expires (ISO): ${s.expiresAt}. This daily snapshot expires 36 elapsed hours after its successful check. Do not treat an expired availability status as current.</p>`,
 `<p>Source: <a href="${SOURCE_URL}">Abyss beginner dive event data</a>. ${s.events.length} supplied upcoming records: ${s.counts.shore} shore, ${s.counts.boat} boat and ${s.counts.trip} trips. ${s.coverage.first?'Coverage: '+pretty(s.coverage.first)+' to '+pretty(s.coverage.last)+'.':'No upcoming records are supplied.'}</p>`,
 '<p>Fully booked means zero places at the check. Check availability is used for every positive count; an exact current number is not known. Unknown source availability is explicitly noted. Open the particular booking page for current places, package inclusions, price basis and the payable total. No place or rental equipment is held by this chat.</p>',
 '<p>This is source coverage, not a list of dives approved for every beginner. Technical, unguided, deeper and members-only listings must not be recommended without the relevant requirements. Use maintained site, service and course information to match the diver and route. The beginner page displays a selected 42-day-ahead window; later events may only be visible at their direct booking links. Course dates use the separate maintained course feed.</p>'];
 for(const [kind,label] of [['shore','Shore dives'],['boat','Boat dives'],['trip','Trips']]){
  lines.push(`<h2>${label}</h2>`);const group=s.events.filter(e=>e.kind===kind);
  if(!group.length)lines.push('<p>No upcoming records in this category were supplied by the successfully checked source. This does not establish that no later dates will run.</p>');
  for(const e of group){
   const end=e.endDate&&e.endDate!==e.startDate?' to '+pretty(e.endDate):'';
   lines.push(`<h3>${html(pretty(e.startDate)+end+' — '+e.title)}</h3>`);
   let body=`${html(e.product)}. ${e.time?'Source start time: '+e.time+' ('+html(e.timeBasis)+'). ':'Start time not supplied; check booking. '}`;
   if(e.listedDepth)body+=`Depth text in listing: ${html(e.listedDepth)}; confirm the appropriate planned route. `;
   body+=`<strong>${e.availabilityLabel}</strong> (at the check). `;
   if(e.availability==='unknown')body+='Source availability was not confirmed. ';
   if(e.listedPrice)body+=`Listed price: A$${e.listedPrice.amount.toFixed(2)}; confirm package basis and extras at booking. `;
   else body+='Price not confirmed; do not assume free. ';
   body+=e.notes.map(html).join(' ')+' ';
   body+=`<a href="${html(e.bookingUrl)}">${e.availability==='fully_booked'?'View listing or check for a reopened place':'Check this date and booking details'}</a>.`;
   lines.push('<p>'+body+'</p>');
  }
 }
 return lines.join('\n');
}
export const fingerprint=text=>createHash('sha256').update(String(text).replace(/<!--[\s\S]*?-->/g,'').replace(/>\s+</g,'><').trim()).digest('hex');
