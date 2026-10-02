import { bookingIdentity } from './helpscout-beginner-snapshot.mjs';
export function encodedNameRepair(sourceUrl){
 const u=new URL(sourceUrl),raw=Buffer.from(u.searchParams.get('q')||'','base64').toString('utf8');
 const m=raw.match(/^part_number=(.+)&date=([^&]*)&open_cart_id=(\d+)$/);
 if(!m||!m[1].includes('&'))return null;
 // Some source names contain an unescaped ampersand inside the inner query.
 // Keep the original URL as provenance; never accept the repaired candidate
 // without verifying the same selected booking on the actual product page.
 const title=decodeURIComponent(m[1].replace(/\+/g,' '));
 const params=new URLSearchParams({part_number:title,date:decodeURIComponent(m[2]),open_cart_id:m[3]});
 u.searchParams.set('q',Buffer.from(params.toString()).toString('base64'));
 return {url:u.href,title,id:m[3],reason:'URL-encoded an unescaped ampersand in the source part_number'};
}
async function checkLink(e,url,fetchImpl){
 const r=await fetchImpl(url,{signal:AbortSignal.timeout(30000),redirect:'follow'});
 if(!r.ok)throw new Error(`HTTP ${r.status}`);
 const expected=new URL(url),actual=new URL(r.url);
 if(actual.origin!==expected.origin||actual.pathname!==expected.pathname)throw new Error('Booking destination changed');
 if(actual.searchParams.has('q')&&bookingIdentity(actual.href).id!==e.id)throw new Error('Selected booking changed');
 const text=await r.text();
 if(/verify you are human|access denied|checking your browser/i.test(text))throw new Error('Booking page not accessible');
 if(!text.includes(e.id)||!/add to cart|book now|contact us|contact_us|fully booked|sold out/i.test(text))throw new Error('Selected booking identity or controls not verified');
}
export async function validateBookingLinks(snapshot,fetchImpl=fetch){
 const queue=[...snapshot.events],failures=[];
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){
  const e=queue.shift();
  try{
   try{await checkLink(e,e.bookingUrl,fetchImpl);}catch(original){
    const candidate=encodedNameRepair(e.bookingUrl);
    if(!candidate||candidate.id!==e.id)throw original;
    await checkLink(e,candidate.url,fetchImpl);
    e.sourceBookingUrl=e.bookingUrl;e.bookingUrl=candidate.url;e.title=candidate.title;e.bookingLinkRepair=candidate.reason;
   }
   e.bookingLinkCheckedAt=new Date().toISOString();
  }catch(error){failures.push(`${e.id}: ${error.message}`);}
 }}));
 if(failures.length)throw new Error('Unverified booking links: '+failures.join('; '));
 return snapshot.events.length;
}
