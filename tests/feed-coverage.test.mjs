import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { buildFeeds, parsePaginationMetadata, validateCandidate } from "../scripts/scrape-widget-all.mjs";
import { checkedRange, extractionErrors } from "../src/feed-coverage.mjs";
import { validateFeed } from "../scripts/validate-feed.mjs";

const checkedAt = "2026-11-04T01:00:00Z";
const now = DateTime.fromISO(checkedAt).plus({ minutes: 1 });
const config = { timezone: "Australia/Sydney", publicHorizonDays: 45, collectionTargetDays: 100, feedVersion: "1" };
function event(id, days, source = "guided-shore") {
  const bookingCode = Buffer.from(`part_number=Dive&open_cart_id=${id}`).toString("base64");
  return { id, openCartId: id, source, title: `Dive ${id}`, startDate: now.setZone(config.timezone).startOf("day").plus({ days }).toISODate(),
    price: { amount: 0 }, bookingCode, bookingUrl: `https://www.abyss.com.au/charters/guided-shore-dives?q=${bookingCode}`, productPath: "/charters/guided-shore-dives", bookable: true };
}
function result(source, widgetId, events, timestamp = checkedAt) {
  const dates = events.map(event => event.startDate).sort();
  return { events, summary: { role: "core", widgetId, status: "fresh", lastSuccessfulAt: timestamp, ...checkedRange(timestamp), rawEventCount: events.length,
    firstDate: dates[0] || null, lastDate: dates.at(-1) || null,
    extraction: { complete: true, sourceTotal: events.length, rowCount: events.length, totalPages: 1, pagesCollected: 1, pageSize: 20, pageSizes: [events.length], explicitEmpty: events.length === 0 } } };
}
const sources = (shore = [], boat = []) => ({ "guided-shore": result("guided-shore", "4745", shore), "boat-seal": result("boat-seal", "4746", boat) });

test("builder retains day 46, 90, 100, 150 and June 2027 listings, marking only later dates", () => {
  const offsets = [20, 21, 44, 45, 46, 90, 100, 150, 209];
  const input = sources(offsets.map(days => event(String(days), days)));
  const { publicFeed, allWidgetFeed } = buildFeeds(input, config, checkedAt);
  assert.deepEqual(publicFeed.events.map(event => event.id), offsets.slice(1).map(String));
  assert.deepEqual(publicFeed.events.map(event => event.beyondReliableHorizon), [false, false, false, true, true, true, true, true]);
  assert.equal(allWidgetFeed.events.length, offsets.length);
  assert.equal(publicFeed.window.publicSearchThrough, "2026-12-19");
  assert.equal(publicFeed.window.latestListedDate, "2027-06-01");
  assert.equal(validateFeed(publicFeed, { now }).valid, true);
  assert.deepEqual(validateCandidate(publicFeed, { now }), validateFeed(publicFeed, { now }));
});

test("builder separates checked through day 45 from sparse last listed date", () => {
  const { publicFeed } = buildFeeds(sources([event("1", 30)]), config, checkedAt);
  assert.equal(publicFeed.window.latestListedDate, "2026-12-04");
  assert.equal(publicFeed.window.publicSearchThrough, "2026-12-19");
  assert.equal(validateFeed(publicFeed, { now }).valid, true);
});

test("stale source retains original checked-through boundary and does not gain a day", () => {
  const input = sources([event("1", 30)]);
  input["boat-seal"] = result("boat-seal", "4746", [], now.minus({ days: 1 }).toISO());
  input["boat-seal"].summary.status = "stale";
  const { publicFeed } = buildFeeds(input, config, checkedAt);
  assert.equal(publicFeed.window.publicTargetThrough, "2026-12-19");
  assert.equal(publicFeed.window.publicSearchThrough, "2026-12-18");
  assert.equal(publicFeed.sources["boat-seal"].coversPublicHorizon, false);
  assert.equal(validateFeed(publicFeed, { now }).valid, true);
});

test("all-empty complete sources build a valid feed without invented event dates", () => {
  const { publicFeed } = buildFeeds(sources(), config, checkedAt);
  assert.equal(publicFeed.eventCount, 0);
  assert.equal(publicFeed.window.latestListedDate, null);
  assert.equal(publicFeed.window.collectedThrough, null);
  assert.equal(validateFeed(publicFeed, { now }).valid, true);
});

const meta = (total = 21, overrides = {}) => ({ scripts: `var count = '${total}'; var totalPages = parseInt('${Math.max(1, Math.ceil(total / 20))}');`, pageSize: 20, links: [1, 2], currentPage: 1, ...overrides });
test("pagination parsing checks count, selected layout and source-scoped page declarations", () => {
  assert.deepEqual(parsePaginationMetadata(meta()), { sourceTotal: 21, pageSize: 20, totalPages: 2, currentPage: 1 });
  assert.deepEqual(parsePaginationMetadata(meta(0, { links: [1] })), { sourceTotal: 0, pageSize: 20, totalPages: 1, currentPage: 1 });
});
for (const [name, value] of [
  ["missing metadata", meta(21, { scripts: "" })],
  ["conflicting count", meta(21, { scripts: "var count='21';var count='22';var totalPages=parseInt('2');" })],
  ["invalid page total", meta(21, { scripts: "var count='21';var totalPages=parseInt('9');" })],
  ["unsupported page size", meta(21, { pageSize: 5 })],
  ["excess page link", meta(21, { links: [1, 2, 3] })]
]) test(`metadata fails closed for ${name}`, () => assert.throws(() => parsePaginationMetadata(value)));

test("extraction evidence rejects partial pages and unverified zero", () => {
  const x = sources()["boat-seal"].summary;
  assert.deepEqual(extractionErrors(x), []);
  x.extraction.explicitEmpty = false;
  assert.match(extractionErrors(x).join(), /explicit empty/);
  const y = result("guided-shore", "4745", [event("1", 30)]).summary;
  y.extraction.pageSizes = [0];
  assert.match(extractionErrors(y).join(), /page sizes/);
});

test("builder does not mutate saved source evidence and notices use the actual boundary", () => {
  const input = sources([event("1", 30)]);
  input["boat-seal"] = result("boat-seal", "4746", [], now.minus({ days: 1 }).toISO());
  input["boat-seal"].summary.status = "stale";
  const before = structuredClone(input);
  const { publicFeed } = buildFeeds(input, config, checkedAt);
  assert.deepEqual(input, before);
  assert.match(publicFeed.customerNotice, /2026-12-18/);
  assert.doesNotMatch(publicFeed.customerNotice, /next 45 days/);
});

test("live DS360 complete single pages without controls require exact count evidence", () => {
  for (const total of [0, 1, 40, 46]) {
    const input = meta(total, { scripts: `var count = '${total}'; var totalPages = parseInt('1');`, pageSize: 0, links: [], observedRows: total });
    assert.deepEqual(parsePaginationMetadata(input), { sourceTotal: total, pageSize: Math.max(1, total), totalPages: 1, currentPage: 1 });
    assert.throws(() => parsePaginationMetadata({ ...input, observedRows: total + 1 }), /Invalid source total or page size/);
    assert.throws(() => parsePaginationMetadata({ ...input, observedRows: undefined }), /Invalid source total or page size/);
    assert.throws(() => parsePaginationMetadata({ ...input, links: [2] }), /Invalid source total or page size/);
  }
});

test("missing page controls cannot certify a declared multi-page source", () => {
  assert.throws(() => parsePaginationMetadata(meta(40, { pageSize: 0, links: [], observedRows: 40 })), /Invalid source total or page size/);
});
