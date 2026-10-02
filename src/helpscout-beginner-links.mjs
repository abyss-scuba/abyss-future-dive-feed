import { bookingIdentity } from './helpscout-beginner-snapshot.mjs';
export async function validateBookingLinks(snapshot,fetchImpl=fetch){
 const queue=[...snapshot.events],failures=[];
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){
  const e=queue.shift();
  try{
   const r=await fetchImpl(e.bookingUrl,{signal:AbortSignal.timeout(30000),redirect:'follow'});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const expected=new URL(e.bookingUrl),actual=new URL(r.url);
   if(actual.origin!==expected.origin||actual.pathname!==expected.pathname)throw new Error('Booking destination changed');
   if(actual.searchParams.has('q')&&bookingIdentity(actual.href).id!==e.id)throw new Error('Selected booking changed');
   const text=await r.text();
   if(/verify you are human|access denied|checking your browser/i.test(text))throw new Error('Booking page not accessible');
   if(!text.includes(e.id)||!/add to cart|book now|contact us|contact_us|fully booked|sold out/i.test(text))throw new Error('Selected booking identity or controls not verified');
   e.bookingLinkCheckedAt=new Date().toISOString();
  }catch(error){failures.push(`${e.id}: ${error.message}`);}
 }}));
 if(failures.length)throw new Error('Unverified booking links: '+failures.join('; '));
 return snapshot.events.length;
}
