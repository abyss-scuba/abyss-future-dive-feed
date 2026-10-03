import test from 'node:test';
import assert from 'node:assert/strict';
import {unwrapManagedHtmlBlock} from '../src/helpscout-managed-html-block.mjs';
import {stripOptions,insertOptions,firstAnswerOptionsAreCurrent,OPENING_REVISION} from '../src/helpscout-beginner-first-answer.mjs';
const marker = 'ABYSS_BEGINNER_FIRST_ANSWER_OPTIONS_V1';
const start = `<!-- ${marker} -->`, end = `<!-- /${marker} -->`;
const body = '<h2>Buddy question</h2>\n<p>Original facts.</p>\n' + start + '\n<p>Verified dated option.</p>\n' + end + '\n<p>Retain support limits.</p>\n';
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const block = s => '<div data-html-block>' + escape(s) + '</div>';
test('ordinary raw article is byte-for-byte unchanged', () => assert.equal(unwrapManagedHtmlBlock(body, marker), body));
test('whole HTML block restores exact approved HTML and one delimiter pair', () => {
  const decoded = unwrapManagedHtmlBlock(block(body), marker);
  assert.equal(decoded, body); assert.equal(decoded.split(start).length, 2); assert.equal(decoded.split(end).length, 2);
});
test('one decode only retains intentional entity text and exact URL', () => {
  const original = body + '<p>&lt;example&gt; &amp; <a href="https://example.test/?a=1&b=2">Link</a></p>';
  assert.equal(unwrapManagedHtmlBlock(block(original), marker), original);
});
test('decoding and subsequent raw reads are idempotent', () => {
  const first = unwrapManagedHtmlBlock(block(body), marker); assert.equal(unwrapManagedHtmlBlock(first, marker), first);
});
test('empty HTML-block attribute variants supported without altering content', () => {
  for (const attr of ['data-html-block=""', "data-html-block=''"]) assert.equal(unwrapManagedHtmlBlock(block(body).replace('data-html-block', attr), marker), body);
});
test('mixed encoded and ordinary blocks fail closed, preventing duplicate dates', () => {
  assert.throws(() => unwrapManagedHtmlBlock('<p>Other text</p>' + block(body), marker));
  assert.throws(() => unwrapManagedHtmlBlock(block(body) + '<p>Other text</p>', marker));
  assert.throws(() => unwrapManagedHtmlBlock(block(body) + block(body), marker));
});
test('missing, repeated or reversed managed markers fail closed', () => {
  for (const bad of [body.replace(end, ''), body.replace(start, ''), body + body, end + start]) assert.throws(() => unwrapManagedHtmlBlock(block(bad), marker));
});
test('unrelated HTML block without managed dates is not rewritten', () => assert.equal(unwrapManagedHtmlBlock(block('<p>Unrelated content</p>'), marker), block('<p>Unrelated content</p>')));
test('invalid inputs are rejected', () => {assert.throws(() => unwrapManagedHtmlBlock(null, marker)); assert.throws(() => unwrapManagedHtmlBlock(body, ''));});
test('next refresh replaces encoded date section rather than appending another', () => {
  const fresh = insertOptions(block(body), '<p>Fresh dated option.</p>');
  assert.equal(fresh.split(start).length, 2); assert.equal(fresh.split(end).length, 2);
  assert.ok(!fresh.includes('Verified dated option.')); assert.ok(fresh.includes('Fresh dated option.'));
  assert.equal(stripOptions(fresh), stripOptions(body));
  assert.equal(insertOptions(fresh, '<p>Fresh dated option.</p>'), fresh);
});
test('mixed editor block fails before date insertion', () => assert.throws(() => insertOptions('<p>Other</p>' + block(body), 'fresh')));
const checked = '2026-10-03T04:48:06.500Z';
function mockSources(transform = x => x) {
  const cal = '6ab98d4249f1bc2c6aefca54', support = '6abf61e6c3e570044c2891ed';
  const refs = [
    ['6abf76557cdaed3f1efa5fa0', cal, 'Scuba equipment hire and the total cost of your dive', 429],
    ['6abf7841c3e570044c28921f', support, 'Nervous about your next dive? Support, pace and extra help', 430],
    ['6ab992784b37f75b5ff65c3e', cal, 'Can I join a Sydney guided dive without bringing a buddy?', 276]
  ];
  const facts = body.replace('<p>Verified dated option.</p>', `<!-- ${OPENING_REVISION} -->\n<p>Beginner schedule checked (ISO): ${checked}.</p>`);
  const articles = refs.map(([id, collectionId, name, number]) => ({id, collectionId, name, number, status: 'published', hasDraft: false, text: number === 276 ? transform(block(facts)) : facts}));
  return async (method, url) => {
    assert.equal(method, 'GET');
    if (/^\/collections\/[^/]+$/.test(url)) return {collection: {id: url.split('/')[2], siteId: '5d0ed4d02c7d3a6ebd2268ed', visibility: 'private'}};
    if (url.startsWith('/collections/')) return {articles: {items: [articles[2]], pages: 1}};
    const article = articles.find(a => url === '/articles/' + a.id); assert.ok(article); return {article};
  };
}
test('fresh encoded article is recognised without unnecessary republishing', async () => assert.equal(await firstAnswerOptionsAreCurrent(mockSources(), {text: 'Checked (ISO): ' + checked}), true));
test('encoded stale check still fails freshness', async () => assert.equal(await firstAnswerOptionsAreCurrent(mockSources(t => t.replace(checked, '2026-10-02T04:48:06.500Z')), {text: 'Checked (ISO): ' + checked}), false));
test('encoded mixed content fails current-check before any publication', async () => assert.rejects(() => firstAnswerOptionsAreCurrent(mockSources(t => '<p>Other</p>' + t), {text: 'Checked (ISO): ' + checked})));
