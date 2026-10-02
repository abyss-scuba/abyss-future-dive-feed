import test from 'node:test';
import assert from 'node:assert/strict';
import {searchChecks,CASES} from '../scripts/verify-beginner-docs-search.mjs';
test('twelve narrow queries span all six target articles',()=>{assert.equal(CASES.length,12);assert.equal(new Set(CASES.map(c=>c[1])).size,6);});
test('read-only first-page rank excludes private previews',async()=>{const r=await searchChecks(async(m,p)=>{assert.equal(m,'GET');assert.ok(p.includes('status=published'));assert.ok(p.includes('visibility=all'));return {articles:{page:1,count:2,items:[{id:'unrelated',preview:'PRIVATE'},{id:CASES[0][1],preview:'PRIVATE'}]}};},[CASES[0]]);assert.equal(r[0].firstPageRank,2);assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.ok(!JSON.stringify(r).includes('unrelated'));});
test('no matching record is a missing retrieval not a fabricated pass',async()=>{const r=await searchChecks(async()=>({articles:{page:1,count:0,items:[]}}),[CASES[0]]);assert.equal(r[0].foundOnFirstPage,false);assert.equal(r[0].firstPageRank,null);});
test('malformed search response fails explicitly',async()=>{await assert.rejects(searchChecks(async()=>({articles:{page:2,count:1,items:[]}}),[CASES[0]]));});
