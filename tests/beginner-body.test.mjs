import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBody,verifyBody} from '../scripts/verify-beginner-body.mjs';
test('normal guide text is not confused with application chrome',()=>{const r=inspectBody('<h2>Can I come without a buddy?</h2><p>Ask the team before booking.</p>');assert.equal(r.expectedHeadingsFound,1);assert.equal(r.uiChromeDetected,false);});
test('actual accidentally pasted filter help is detected',()=>{const r=inspectBody('<p>To find results that match ALL conditions, separate multiple filters with a space: tag:abc tag:123</p>');assert.equal(r.uiChromeDetected,true);});
test('empty table is distinguished from a nonempty one',()=>{assert.equal(inspectBody('<table><tr><td>&nbsp;</td></tr></table>').emptyTableCount,1);assert.equal(inspectBody('<table><tr><td>Dive</td></tr></table>').emptyTableCount,0);});
test('report does not expose arbitrary private article text',()=>{const r=inspectBody('<p>PRIVATE-TEST-STRING</p>');assert.ok(!JSON.stringify(r).includes('PRIVATE-TEST-STRING'));});
test('wrong collection is rejected before an article read',async()=>{let n=0;await assert.rejects(verifyBody(async()=>{n++;return {collection:{id:'wrong'}};}));assert.equal(n,1);});
