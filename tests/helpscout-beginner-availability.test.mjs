import test from 'node:test';
import assert from 'node:assert/strict';
import { beginnerAvailability, parseObservedPlaces, BEGINNER_SNAPSHOT_TTL_MS } from '../src/helpscout-beginner-availability.mjs';
const checkedAt = '2026-10-02T03:30:00+10:00';
const now = '2026-10-02T14:00:00+10:00';

for (const value of [0, '0', ' 0 ', '00']) test(`exact zero ${JSON.stringify(value)} is fully booked`, () => {
  const result = beginnerAvailability(value, {checkedAt, now});
  assert.equal(result.status, 'fully_booked');
  assert.equal(result.label, 'Fully booked');
  assert.match(result.explanation, /last successful check/);
});
for (const value of [1, 2, 3, 10, 14, 99, '1', ' 14 ']) test(`positive observation ${JSON.stringify(value)} is not a count`, () => {
  const result = beginnerAvailability(value, {checkedAt, now});
  assert.equal(result.status, 'check_availability');
  assert.equal(result.label, 'Check availability');
  assert.equal('count' in result, false);
  assert.equal('remainingPlaces' in result, false);
  assert.doesNotMatch(result.explanation, /\d|only|left|spots available/i);
});
for (const value of [null, undefined, '', ' ', false, true, -1, 1.5, NaN, Infinity, 'N/A', 'Sold out', '0 places', '1e2', '$0.00', [], {}, Number.MAX_SAFE_INTEGER+1]) {
  test(`unknown or malformed ${String(value)} is not zero`, () => {
    assert.equal(parseObservedPlaces(value), null);
    assert.equal(beginnerAvailability(value, {checkedAt, now}).status, 'unknown');
  });
}
test('all positive counts yield identical AI-visible output', () => {
  const baseline = beginnerAvailability(1, {checkedAt, now});
  for (const count of [2, 3, 9, 10, 14, 999]) assert.deepEqual(beginnerAvailability(count, {checkedAt, now}), baseline);
});
test('stale zero is not a current fully-booked declaration', () => {
  assert.equal(beginnerAvailability(0, {checkedAt, now:'2026-10-03T15:30:00+10:00'}).status, 'stale');
});
test('freshness boundary is exactly 36 elapsed hours', () => {
  const start = Date.parse(checkedAt);
  assert.equal(beginnerAvailability(0, {checkedAt, now:new Date(start+BEGINNER_SNAPSHOT_TTL_MS-1).toISOString()}).fresh, true);
  assert.equal(beginnerAvailability(0, {checkedAt, now:new Date(start+BEGINNER_SNAPSHOT_TTL_MS).toISOString()}).fresh, false);
});
test('DST does not change elapsed-time expiry', () => {
  const beforeDST = '2026-10-04T01:30:00+10:00';
  const result = beginnerAvailability(1, {checkedAt:beforeDST, now:'2026-10-04T04:30:00+11:00'});
  assert.equal(Date.parse(result.expiresAt)-Date.parse(result.checkedAt), BEGINNER_SNAPSHOT_TTL_MS);
  assert.equal(result.fresh, true);
});
test('actual successful-check time is retained rather than hardcoded to 03:30', () => {
  const actual = '2026-10-02T03:47:12+10:00';
  assert.equal(beginnerAvailability(0, {checkedAt:actual, now}).checkedAt, '2026-10-01T17:47:12.000Z');
});
test('missing, invalid and timezone-less check timestamps fail', () => {
  for (const checkedAt of [undefined, '', 'yesterday', '2026-10-02T03:30:00']) {
    assert.throws(()=>beginnerAvailability(0, {checkedAt, now}), TypeError);
  }
});
test('future successful-check time fails', () => {
  assert.throws(()=>beginnerAvailability(0, {checkedAt:'2026-10-03T03:30:00+10:00',now}), RangeError);
});
