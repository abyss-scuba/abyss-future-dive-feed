import { DateTime } from 'luxon';
import { makeDocsClient } from './helpscout-boat-bootstrap.mjs';
export const ZONE='Australia/Sydney';
export const SOURCE_URL='https://www.abyss.com.au/travel-beacon';
export const WIDGET_ID='4864';
export const TITLE='Upcoming Abyss dive trips — dates and availability snapshot';
export const MARKER='ABYSS_TRAVEL_SNAPSHOT_V1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const isoDate=s=>{
 const d=DateTime.fromFormat(s,'dd LLL yyyy',{zone:ZONE,locale:'en-US'});
 assert(d.isValid&&d.toFormat('dd LLL yyyy')===s,`Invalid trip date: ${s}`);return d.toISODate();
};
export function buildTravelSnapshot(rows,checkedAt=DateTime.now().setZone(ZONE)){
 assert(Array.isArray(rows)&&rows.length>0,'No trip rows; previous snapshot must be retained');
 assert(checkedAt.isValid,'Invalid check time');
 const trips=[],seen=new Map();
 for(const row of rows){
  const startDate=isoDate(row.startDate),endDate=isoDate(row.endDate);
  assert(endDate>=startDate,'Trip return precedes departure');
  assert(/^[0-9]+$/.test(row.available)&&/^[0-9]+$/.test(row.maxPlaces),'Missing or invalid capacity');
  const available=Number(row.available),maxPlaces=Number(row.maxPlaces);
  assert(Number.isSafeInteger(available)&&Number.isSafeInteger(maxPlaces)&&available<=maxPlaces,'Places exceed capacity');
  assert(typeof row.name==='string'&&row.name.trim().length>2,'Missing trip name');
  const url=new URL(row.bookingUrl);
  assert(url.protocol==='https:'&&url.hostname==='www.abyss.com.au'&&/^\/trips\/[a-z0-9-]+$/.test(url.pathname),'Unexpected booking destination');
  assert(url.searchParams.has('q'),'Exact departure booking code missing');
  const q=new URLSearchParams(Buffer.from(url.searchParams.get('q'),'base64').toString('utf8'));
  const id=q.get('open_cart_id');assert(/^\d+$/.test(id??'')&&q.get('part_number'),'Invalid departure identity');
  assert(/^\$[\d,]+\.\d{2}$/.test(row.price),'Missing or malformed displayed price');
  const amount=Number(row.price.replace(/[$,]/g,''));assert(Number.isFinite(amount)&&amount>=0,'Invalid price');
  const trip={id,name:row.name.trim(),startDate,endDate,available,maxPlaces,listedPriceAud:amount>0?amount:null,bookingUrl:row.bookingUrl,description:String(row.description??'').trim()};
  if(seen.has(id)){assert(JSON.stringify(seen.get(id))===JSON.stringify(trip),'Conflicting duplicate trip');continue}
  seen.set(id,trip);
  if(startDate>=checkedAt.setZone(ZONE).toISODate())trips.push(trip);
 }
 assert(trips.length>0,'No upcoming trips; previous snapshot must be retained');
 trips.sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name));
 return {checkedAt:checkedAt.setZone(ZONE).toISO(),trips};
}
export function renderTravelSnapshot(snapshot){
 const at=DateTime.fromISO(snapshot.checkedAt).setZone(ZONE),fmt=s=>DateTime.fromISO(s,{zone:ZONE}).toFormat('d LLLL yyyy');
 const out=[`<!-- ${MARKER} -->`,`<h2>${TITLE}</h2>`,`<p><strong>Last successfully checked: ${esc(at.toFormat('d LLLL yyyy, HH:mm ZZZZ'))} (Australia/Sydney).</strong></p>`,
 `<p>Source: <a href="${SOURCE_URL}">Abyss Travel Beacon feed</a>. These are ${snapshot.trips.length} listed upcoming departures. Regular refresh is scheduled daily at 8 am Australia/Sydney, including daylight saving. The timestamp above is the actual successful scrape time; a schedule does not prove a successful update.</p>`,
 '<h2>Using dates, prices and places</h2><p>Places available are a snapshot accurate when checked, not live inventory or a held booking. Quote the check date with availability and ask customers to confirm on the exact trip page before booking. Zero places means sold out in this snapshot; offer a waitlist enquiry or an alternative. A missing departure does not prove that no future trip will run. If this snapshot is older than 48 hours, direct customers to current trip pages or Abyss instead of presenting old counts as current.</p>',
 '<p>Dates below are the source’s departure and return dates, not confirmed flight times. Each price is the listed AUD price at the check time, not a personalised all-in quote. Confirm the room/cabin option, inclusions and final total on the exact trip page. A zero-dollar source price is treated as price unavailable and must never be described as a free trip. Group fit requires both enough listed places and appropriate rooming and diver suitability.</p>'];
 for(const t of snapshot.trips){
  out.push(`<h2>${esc(t.name)} — ${fmt(t.startDate)} to ${fmt(t.endDate)}</h2>`,
   `<p>Departure: ${fmt(t.startDate)}. Return: ${fmt(t.endDate)}. Places available at the check time: <strong>${t.available}</strong>. Status: <strong>${t.available===0?'Sold out at the check time':'Places listed at the check time'}</strong>. ${t.listedPriceAud===null?'Price: ask Abyss; no valid non-zero price is supplied.':`Listed price: AUD $${t.listedPriceAud.toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}; confirm inclusions and final quote.`}</p>`,
   `<p>${esc(t.description)}</p><p><a href="${esc(t.bookingUrl)}">View this exact departure and confirm current details</a>.</p>`);
 }
 out.push('<p><a href="https://www.abyss.com.au/travel-enquiry">Ask Abyss about another trip, sold-out dates or a waitlist</a>. Do not claim to have joined a waitlist or reserved a place until the customer has completed the relevant process.</p>');
 return out.join('\n');
}
const comparable=s=>String(s??'').replace(/<!--[\s\S]*?-->/g,'').replace(/>\s+</g,'><').trim();
export async function updateTravelSnapshot(snapshot,target,apiKey,{dryRun=true,request=makeDocsClient(apiKey)}={}){
 assert(target?.articleTitle===TITLE&&['articleId','collectionId','siteId'].every(k=>/^[a-f0-9]{24}$/.test(target[k]??'')),'Invalid travel article target');
 const collection=(await request('GET',`/collections/${target.collectionId}`))?.collection;
 assert(collection?.id===target.collectionId&&collection.siteId===target.siteId&&collection.name==='Dive Travel'&&collection.visibility==='private','Travel collection identity/privacy mismatch');
 const path=`/articles/${target.articleId}`;
 const valid=a=>assert(a?.id===target.articleId&&a.collectionId===target.collectionId&&a.name===TITLE&&a.status==='published'&&!a.hasDraft,'Travel article identity or draft conflict');
 const current=(await request('GET',path))?.article;valid(current);
 assert(current.text?.includes(MARKER)||(current.text?.includes(SOURCE_URL)&&current.text?.includes(TITLE)),'Travel managed source marker missing');
 const oldCount=Number(current.text.match(/These are (\d+) listed upcoming departures/)?.[1]);
 assert(!oldCount||snapshot.trips.length>=oldCount*0.6,'Suspicious trip-count drop; previous snapshot retained');
 const next=renderTravelSnapshot(snapshot);
 if(comparable(current.text)===comparable(next))return {status:'unchanged',count:snapshot.trips.length};
 if(dryRun)return {status:'dry-run',count:snapshot.trips.length};
 await request('PUT',path,{text:next});
 const after=(await request('GET',path))?.article;valid(after);
 assert(comparable(after.text)===comparable(next),'Travel article readback mismatch');
 return {status:'updated',count:snapshot.trips.length};
}
