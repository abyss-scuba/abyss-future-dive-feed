import test from 'node:test';
import assert from 'node:assert/strict';
import {firstDiveChoices,newDiverWindow,compareRecommendationEvents,eventFactCard,SOURCE} from '../src/helpscout-beginner-first-dive.mjs';
import {renderFirstAnswerOptions} from '../src/helpscout-beginner-first-answer.mjs';
const NOW='2026-10-03T04:30:00.000Z'; // Saturday in Sydney, before DST transition.
function event(id,site,date,time='09:00',extra={}){return {id,title:site+' Dive',kind:'shore',product:'Guided Shore Dives',startDate:date,time,availability:'check_availability',notes:[],listedPrice:{amount:0,currency:'AUD'},bookingUrl:'https://www.abyss.com.au/charters/guided-shore-dives?q='+id,...extra};}
function snapshot(events,now=NOW){return {source:SOURCE,checkedAt:now,expiresAt:new Date(Date.parse(now)+36*3600000).toISOString(),events};}
const friday=event('oak-fri','Oak Park','2026-10-09');
const sundayOak=event('oak-sun','Oak Park','2026-10-11');
const sundayBare=event('bare-sun','Bare Island','2026-10-04');
const saturdayBare=event('bare-sat','Bare Island','2026-10-10');
test('later Sunday at same site beats earlier Friday before per-site reduction',()=>{const c=firstDiveChoices(snapshot([friday,sundayOak]),{now:NOW});assert.equal(c.primary[0].event.id,'oak-sun');});
test('rank Sunday Saturday Friday across the full eligible set',()=>{const c=firstDiveChoices(snapshot([friday,sundayBare,saturdayBare,sundayOak]),{now:NOW});assert.deepEqual(c.primary.map(x=>x.event.id),['bare-sun','oak-sun']);});
test('Saturday preferred to Friday when no Sunday is available',()=>{const c=firstDiveChoices(snapshot([friday,saturdayBare]),{now:NOW});assert.equal(c.primary[0].event.id,'bare-sat');});
test('explicit Friday availability excludes Sundays before preference ranking',()=>{const c=firstDiveChoices(snapshot([friday,sundayBare,sundayOak]),{now:NOW,requestedWeekdays:[5]});assert.deepEqual(c.primary.map(x=>x.event.id),['oak-fri']);});
test('unmatched explicit weekday returns no substitute',()=>assert.equal(firstDiveChoices(snapshot([sundayBare]),{now:NOW,requestedWeekdays:[5]}).primary.length,0));
test('full day fourteen included; today, past and day fifteen excluded',()=>{const events=[event('past','Oak Park','2026-10-02'),event('today','Oak Park','2026-10-03','23:59'),event('day14','Oak Park','2026-10-17','23:59'),event('day15','Oak Park','2026-10-18')];assert.deepEqual(newDiverWindow(snapshot(events),NOW).events.map(x=>x.id),['day14']);});
test('today excluded when today is Sunday after Sydney DST change',()=>{const now='2026-10-04T00:30:00.000Z';const c=firstDiveChoices(snapshot([sundayBare,saturdayBare,sundayOak],now),{now});assert.equal(c.primary[0].event.id,'oak-sun');assert.ok(!c.primary.some(x=>x.event.startDate==='2026-10-04'));});
test('fully booked or inappropriate Sunday cannot outrank suitable Friday',()=>{const full={...sundayBare,availability:'fully_booked'};const night={...sundayOak,title:'Oak Park Night Dive'};const c=firstDiveChoices(snapshot([full,night,friday]),{now:NOW});assert.deepEqual(c.primary.map(x=>x.event.id),['oak-fri']);});
test('all three topical excerpts prefer the same suitable Sunday',()=>{const s=snapshot([friday,sundayBare]),c=firstDiveChoices(s,{now:NOW});for(const topic of [276,429,430]){const html=renderFirstAnswerOptions(s,c,NOW,{topic});assert.match(html,/Bare Island/);assert.match(html,/Sunday.*4 October 2026/);assert.ok(html.includes(sundayBare.bookingUrl));assert.ok(!html.includes(friday.bookingUrl));}});
test('card preserves location date time and link from one event',()=>{const s=snapshot([friday,sundayBare]),c=firstDiveChoices(s,{now:NOW});const card=eventFactCard(c.primary[0]);assert.ok(card.includes('Bare Island'));assert.ok(card.includes('4 October 2026'));assert.ok(card.includes(sundayBare.bookingUrl));assert.ok(!card.includes(friday.bookingUrl));});
test('does not mutate canonical event order or invent extra departures',()=>{const s=snapshot([friday,sundayBare,sundayOak]);const before=JSON.stringify(s);firstDiveChoices(s,{now:NOW});assert.equal(JSON.stringify(s),before);});
test('expiry produces no recommendations, not recycled dates',()=>{const s=snapshot([sundayBare]);assert.equal(firstDiveChoices(s,{now:s.expiresAt}).primary.length,0);});
test('invalid explicit weekday filters fail closed',()=>{for(const requestedWeekdays of [[],[7],[-1],['Sunday']])assert.throws(()=>firstDiveChoices(snapshot([sundayBare]),{now:NOW,requestedWeekdays}));});
test('same preferred weekday orders by actual date then time',()=>{const earlier={...sundayBare,time:'08:00',id:'early'};const later={...sundayBare,time:'12:00',id:'late'};assert.deepEqual([later,sundayOak,earlier].sort(compareRecommendationEvents).map(x=>x.id),['early','late','oak-sun']);});
