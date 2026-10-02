import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrice,buildSnapshot,SOURCE_URL} from '../src/helpscout-beginner-snapshot.mjs';
test('non-finite source price stays unknown',()=>assert.equal(parsePrice('$'+'9'.repeat(400)),null));
test('zero on a boat record does not promise free diving',()=>{
 const row=(id,path)=>({cells:['','03 Oct 2026','03 Oct 2026','Boat Dives','20','7','$0.00',''],links:[{url:'https://www.abyss.com.au'+path+'?q='+Buffer.from('part_number=Test&open_cart_id='+id).toString('base64')}],detail:['Start date: 03 Oct 2026 09:00 AM']});
 const report={source:SOURCE_URL,finishedAt:'2026-10-02T05:00:00.000Z',errors:[],widgets:[{id:'widget3856',headers:['','','','Charter'],complete:true,rowCount:1,pages:[{rows:[row('1','/charters/boat-dives')]}]},{id:'widget3857',headers:['','','','Travel'],complete:true,rowCount:1,pages:[{rows:[row('2','/trips/forster')]}]}]};
 const e=buildSnapshot(report).events.find(e=>e.kind==='boat');assert.equal(e.listedPrice,null);assert.match(e.notes.join(' '),/not describe.*free/);
});
