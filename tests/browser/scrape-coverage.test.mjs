import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

Object.assign(process.env, {
  WIDGET_TIMEOUT_MS: '1000', STABILITY_POLL_MS: '5',
  STABLE_POLLS_REQUIRED: '2', FINAL_SETTLE_MS: '0', MAX_PAGES_PER_SOURCE: '10'
});
delete process.env.HTML_FIXTURE_PATH;
const scraper = await import('../../scripts/scrape-widget-all.mjs');
const { scrapeSource, clickPageAndWait, paginationState } = scraper;
const meta = { selector: '#shore', source: 'guided-shore', widgetId: '4745', role: 'core', category: 'shore', possibleTags: [], productPath: '/charters/guided-shore-dives' };
const config = { timezone: 'Australia/Sydney', publicHorizonDays: 45, collectionTargetDays: 100 };
const checkedAt = '2026-11-04T01:00:00Z';
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, ...(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); });

function row(id, { date = '20 Nov 2026', link = true } = {}) {
  const code = Buffer.from(`part_number=Guided shore dive&date=&open_cart_id=${id}`).toString('base64');
  return `<tr class="main-row"><td>+</td><td>${date}</td><td>${date}</td><td>Guided Shore Dives</td><td>20</td><td>7</td><td>$0.00</td><td>${link ? `<a href="https://www.abyss.com.au/charters/guided-shore-dives?q=${code}">Book</a>` : ''}</td></tr><tr class="expand-row"><td colspan="8"><p><strong>Start date:</strong> ${date} 10:00 AM</p><p><strong>Our Price:</strong> $0.00</p></td></tr>`;
}
const batch = (start, count, options) => Array.from({ length: count }, (_, i) => row(start + i, options)).join('');
async function fixture(t, { pages = [batch(1, 1)], total = 1, declared = Math.max(1, Math.ceil(total / 20)), metadata = true, empty = false, mode = 'normal' } = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route('**/*', route => route.abort());
  await page.setContent(`<div id="widget-all-source" data-public-horizon-days="90" data-collection-target-days="100" data-timezone="Australia/Sydney"><section id="shore" class="widget-all-source" data-source="guided-shore" data-source-role="core" data-widget-id="4745"><div id="widget4745">${metadata ? `<script type="application/json">var count = '${total}'; var totalPages = parseInt('${declared}');</script>` : ''}<select class="per_page"><option value="20" selected>20</option></select><table><thead><tr><th></th><th>Start date</th><th>End date</th><th>Charter</th><th>Max. Places</th><th>Places Available</th><th>Price</th><th></th></tr></thead><tbody>${pages[0]}</tbody></table>${empty ? '<p>No records found</p>' : ''}<ul class="pagination">${Array.from({ length: declared }, (_, i) => `<li class="page-item ${i === 0 ? 'active' : ''}"><a class="page-link" data-page="${i + 1}" href="#">${i + 1}</a></li>`).join('')}</ul></div></section><section id="boat" class="widget-all-source" data-source="boat-seal" data-source-role="core" data-widget-id="4746"><div id="widget4746"></div></section></div>`);
  await page.evaluate(({ pages, mode }) => {
    const root = document.querySelector('#shore');
    root.querySelector('select.per_page').addEventListener('change', () => {
      setTimeout(() => { const next = document.createElement('tbody'); next.innerHTML = pages[0]; root.querySelector('tbody').replaceWith(next); }, 5);
    });
    root.querySelectorAll('.page-link').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      const n = Number(link.dataset.page);
      if (mode !== 'wrong-page') {
        root.querySelectorAll('.page-item').forEach(li => li.classList.remove('active'));
        link.parentElement.classList.add('active');
      }
      if (mode !== 'repeated') root.querySelector('tbody').innerHTML = pages[n - 1] || '';
      if (mode === 'changed-total') root.querySelector('script').textContent = "var count = '22'; var totalPages = parseInt('2');";
    }));
  }, { pages, mode });
  return page;
}
const scrape = page => scrapeSource(page, meta, config, checkedAt);

test('collects every page despite distant dates and unsorted rows', async t => {
  const page = await fixture(t, { total: 21, pages: [row(1, { date: '01 Jun 2027' }) + batch(2, 19), row(21, { date: '19 Nov 2026' })] });
  const result = await scrape(page);
  assert.equal(result.events.length, 21);
  assert.equal(result.events.at(-1).startDate, '2026-11-19');
  assert.equal(result.summary.lastDate, '2027-06-01');
  assert.equal(result.summary.rowsAscending, false);
  assert.deepEqual(result.summary.extraction.pageSizes, [20, 1]);
  assert.equal(result.summary.extraction.complete, true);
});

test('confirmed zero count and explicit empty state establish complete extraction', async t => {
  const page = await fixture(t, { total: 0, pages: [''], empty: true });
  const result = await scrape(page);
  assert.deepEqual(result.events, []);
  assert.equal(result.summary.extraction.explicitEmpty, true);
  assert.equal(result.summary.extraction.complete, true);
  assert.equal(result.summary.lastDate, null);
});

for (const [name, options, expected] of [
  ['missing metadata', { metadata: false }, /metadata missing/],
  ['false empty with positive total', { total: 1, pages: [''], empty: true }, /expected 1|Page-size reset/],
  ['zero without explicit empty', { total: 0, pages: [''] }, /did not become stable/],
  ['repeated page', { total: 40, pages: [batch(1, 20), batch(21, 20)], mode: 'repeated' }, /did not load distinct rows/],
  ['overlapping page', { total: 21, pages: [batch(1, 20), row(1)] }, /duplicate or overlapping/],
  ['wrong selected page', { total: 21, pages: [batch(1, 20), row(21)], mode: 'wrong-page' }, /did not load distinct rows/],
  ['source row count mismatch', { total: 2 }, /expected 2/],
  ['page cap exceeded', { total: 201, pages: [batch(1, 20)] }, /safety limit/],
  ['invalid raw date', { pages: [row(1, { date: 'not a date' })] }, /malformed date/],
  ['lost booking link', { pages: [row(1, { link: false })] }, /lost booking link/],
  ['changed source total mid-extraction', { total: 21, pages: [batch(1, 20), row(21)], mode: 'changed-total' }, /pagination changed/]
]) test(`rejects ${name}`, async t => {
  const page = await fixture(t, options);
  await assert.rejects(scrape(page), expected);
});

test('missing expected page link fails rather than certifying completeness', async t => {
  const page = await fixture(t);
  await assert.rejects(clickPageAndWait(page, meta, 2), /expected page 2 link missing/);
});

test('pagination metadata is scoped to each source', async t => {
  const page = await fixture(t, { total: 21, pages: [batch(1, 20), row(21)] });
  await page.locator('#boat').evaluate(root => { root.innerHTML += `<script type="application/json">var count = '999'; var totalPages = parseInt('50');</script>`; });
  assert.deepEqual(await paginationState(page.locator('#shore')), { sourceTotal: 21, pageSize: 20, totalPages: 2, currentPage: 1 });
});

test('source discovery requires both exact core widget identities', async t => {
  const page = await fixture(t);
  assert.equal((await scraper.discoverSources(page)).length, 2);
  await page.locator('#boat').evaluate(root => root.remove());
  await assert.rejects(scraper.discoverSources(page), /boat-seal.*4746/);
});

for (const [name, mutation] of [
  ['wrong widget identity', "document.querySelector('#boat').dataset.widgetId='9999'"],
  ['downgraded core role', "document.querySelector('#boat').dataset.sourceRole='supplementary'"],
  ['duplicate source name', "document.querySelector('#boat').dataset.source='guided-shore'"],
  ['missing actual widget', "document.querySelector('#widget4746').remove()"]
]) test(`source discovery rejects ${name}`, async t => {
  const page = await fixture(t);
  await page.evaluate(mutation);
  await assert.rejects(scraper.discoverSources(page), /missing|changed|duplicate/);
});

test('legacy source horizon cannot override reliable 45-day policy', async t => {
  const page = await fixture(t);
  const result = await scraper.readPageConfiguration(page);
  assert.equal(result.publicHorizonDays, 45);
  assert.equal(result.sourcePublicHorizonDays, 90);
});
