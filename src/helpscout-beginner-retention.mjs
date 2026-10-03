/** Pure preference and presentation helpers; no new schedule or source of prices. */
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function preferredDayRank(event){
 const day=new Date(event.startDate+'T12:00:00Z').getUTCDay();
 return day===0?0:day===6?1:day===5?2:3;
}
export function comparePreferredDates(a,b){
 return preferredDayRank(a)-preferredDayRank(b)||a.startDate.localeCompare(b.startDate)||(a.time||'99').localeCompare(b.time||'99')||String(a.id).localeCompare(String(b.id));
}
export function buddyOutingFact({site,event:e}){
 if(site.kind!=='shore'||site.name==='Marine Marvels')throw new Error('Expected regular guided shore outing');
 const date=new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(e.startDate+'T12:00:00Z'));
 const label=site.name+' guided shore dive on '+date+(e.time?' at '+e.time:'');
 const sunday=preferredDayRank(e)===0;
 const social=sunday?' After a regular Sunday guided shore dive, participants are invited back to the shop for complimentary pizza and beer and a chat with their new dive friends. For junior divers, describe the pizza and social time, not alcohol.':'';
 return '<p><strong>Coming without a buddy: a suitable upcoming outing.</strong> A certified diver who has no pre-arranged buddy can book one place on the <a href="'+esc(e.bookingUrl)+'">'+esc(label)+'</a>. Abyss arranges suitable buddy teams, and the Divemaster briefs and leads the group underwater. '+esc(site.why)+social+' This is a scheduled option, not a reserved place or a guarantee of conditions; use the link to check availability and have the team confirm the route and suitability. Group guiding is not private one-to-one instruction.</p>';
}
