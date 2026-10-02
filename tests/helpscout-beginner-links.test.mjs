import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBookingLinks} from '../src/helpscout-beginner-links.mjs';
const url='https://www.abyss.com.au/charters/boat-dives?q='+Buffer.from('part_number=Test&open_cart_id=123').toString('base64');
const fixture=()=>({events:[{id:'123',bookingUrl:url}]});
test('selected booking and controls are verified',async()=>{const s=fixture();assert.equal(await validateBookingLinks(s,async()=>({ok:true,url,text:async()=>'<form>123 Add to Cart</form>'})),1);assert.ok(s.events[0].bookingLinkCheckedAt);});
test('HTTP success alone does not verify booking',async()=>{await assert.rejects(()=>validateBookingLinks(fixture(),async()=>({ok:true,url,text:async()=>'<p>Homepage</p>'})),/identity/);});
test('redirect outside selected product rejected',async()=>{await assert.rejects(()=>validateBookingLinks(fixture(),async()=>({ok:true,url:'https://www.abyss.com.au/',text:async()=>'<p>123 Book Now</p>'})),/destination changed/);});
