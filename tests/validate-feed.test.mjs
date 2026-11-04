import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import { validateFeed, MAX_FEED_AGE_HOURS } from "../scripts/validate-feed.mjs";

const now = DateTime.fromISO("2026-10-07T06:00:00Z");
import { checkedRange, RELIABLE_HORIZON_DAYS, sourceErrors, canReuseSource } from "../src/feed-coverage.mjs";
import { evaluateWebsiteFeed } from "../src/website-feed-health.mjs";
const bookingCode = Buffer.from("part_number=Test dive&date=&open_cart_id=123").toString("base64");

function fixture(checkedAt = now.minus({ hours: 12 }).toISO()) {
  const day = DateTime.fromISO(checkedAt).setZone("Australia/Sydney").startOf("day");
  const date = day.plus({ days: 30 }).toISODate();
  const range = checkedRange(checkedAt);
  return {
    schemaVersion: "1.1.0", timezone: "Australia/Sydney", publicHorizonDays: 45, futureStartOffsetDays: 21,
    generatedAt: checkedAt, assembledAt: checkedAt,
    window: { startsOn: day.plus({ days: 21 }).toISODate(), publicTargetThrough: range.checkedThrough, publicSearchThrough: range.checkedThrough, latestListedDate: date },
    sources: Object.fromEntries([["guided-shore", "4745"], ["boat-seal", "4746"]].map(([name, widgetId]) => [name, {
      widgetId, role: "core", status: "fresh", lastSuccessfulAt: checkedAt,
      firstDate: date, lastDate: date, rawEventCount: 1, ...range,
      extraction: { complete: true, sourceTotal: 1, rowCount: 1, totalPages: 1, pagesCollected: 1, pageSize: 20, pageSizes: [1], explicitEmpty: false }
    }])),
    eventCount: 1,
    events: [{
      id: "123", source: "guided-shore", startDate: date, price: { amount: 0 }, beyondReliableHorizon: false,
      bookingUrl: `https://www.abyss.com.au/charters/guided-shore-dives?q=${bookingCode}`,
      bookingCode, openCartId: "123", productPath: "/charters/guided-shore-dives"
    }]
  };
}

test("fresh feed and core source timestamps pass without changing the feed", () => {
  const feed = fixture();
  const original = structuredClone(feed);
  assert.deepEqual(validateFeed(feed, { now }), {
    valid: true, errors: [], warnings: [], eventCount: 1
  });
  assert.deepEqual(feed, original);
});

test("the August snapshot is rejected despite stored fresh and coverage flags", () => {
  const report = validateFeed(fixture("2026-08-30T06:40:52.937Z"), { now });
  assert.equal(report.valid, false);
  assert.equal(report.errors.filter(message => /older than 48 hours/.test(message)).length, 4);
});

test("fresh generatedAt does not disguise expired core source data", () => {
  const feed = fixture();
  feed.sources["boat-seal"].lastSuccessfulAt = "2026-08-30T06:40:52.937Z";
  const report = validateFeed(feed, { now });
  assert.equal(report.valid, false);
  assert.match(report.errors.join("\n"), /boat-seal: lastSuccessfulAt is older than 48 hours/);
});

test("exactly 48 hours is allowed and one millisecond older is rejected", () => {
  assert.equal(MAX_FEED_AGE_HOURS, 48);
  const boundary = now.minus({ hours: 48 });
  assert.equal(validateFeed(fixture(boundary.toISO()), { now }).valid, true);
  assert.equal(validateFeed(fixture(boundary.minus({ milliseconds: 1 }).toISO()), { now }).valid, false);
});

test("Sydney daylight-saving offsets are compared as elapsed time", () => {
  const checkedAt = now.minus({ hours: 47 }).setZone("Australia/Sydney").toISO();
  assert.match(checkedAt, /\+11:00$/);
  assert.equal(validateFeed(fixture(checkedAt), { now }).valid, true);
  assert.equal(validateFeed(fixture("2026-10-05T17:00:00+11:00"), { now }).valid, true);
});

test("last-known-good core source data within 48 hours keeps its stale warning", () => {
  const feed = fixture();
  feed.sources["boat-seal"].status = "stale";
  feed.sources["boat-seal"].lastSuccessfulAt = now.minus({ hours: 47 }).toISO();
  Object.assign(feed.sources["boat-seal"], checkedRange(feed.sources["boat-seal"].lastSuccessfulAt));
  feed.window.publicSearchThrough = feed.sources["boat-seal"].checkedThrough;
  feed.generatedAt = feed.sources["boat-seal"].lastSuccessfulAt;
  const report = validateFeed(feed, { now });
  assert.equal(report.valid, true);
  assert.deepEqual(report.warnings, ["boat-seal: using last-known-good stale data"]);
});

for (const timestamp of [undefined, "invalid", "2026-10-07", "2026-10-07T05:00:00", "2026-10-07T06:00:00.001Z",
  "2026-10-07T05:00:00+00:60", "2026-10-07T05:00:00+0060", "2026-10-07T05:00:00+24:00"]) {
  test(`invalid or future freshness timestamp is rejected: ${timestamp}`, () => {
    const feed = fixture();
    feed.generatedAt = timestamp;
    feed.sources["guided-shore"].lastSuccessfulAt = timestamp;
    const report = validateFeed(feed, { now });
    assert.equal(report.valid, false);
    assert.equal(report.errors.filter(error => /(?:generatedAt |lastSuccessfulAt ).*(?:is missing|is in the future)/.test(error)).length, 2);
  });
}

test("a fresh incomplete core extraction remains a failure", () => {
  const feed = fixture();
  feed.sources["guided-shore"].extraction.complete = false;
  const report = validateFeed(feed, { now });
  assert.equal(report.valid, false);
  assert.match(report.errors.join("\n"), /guided-shore: complete extraction evidence is missing/);
});

test("optional failed supplementary source does not invalidate fresh core sources", () => {
  const feed = fixture();
  feed.sources["marine-special"] = { role: "supplementary", status: "failed", lastSuccessfulAt: null };
  assert.equal(validateFeed(feed, { now }).valid, true);
});

test("invalid validation clock fails closed", () => {
  assert.throws(() => validateFeed(fixture(), { now: DateTime.invalid("bad clock") }), /valid current time/);
});

test("CLI exits nonzero for expired data, succeeds for fresh data, and never rewrites either", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "future-feed-validation-"));
  try {
    for (const [hours, expectedStatus] of [[72, 1], [1, 0]]) {
      const feedPath = path.join(directory, `${hours}.json`);
      const contents = JSON.stringify(fixture(DateTime.utc().minus({ hours }).toISO()));
      await fs.writeFile(feedPath, contents);
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("../scripts/validate-feed.mjs", import.meta.url)), feedPath
      ], { encoding: "utf8" });
      assert.equal(result.status, expectedStatus, result.stderr);
      assert.equal(JSON.parse(result.stdout).valid, expectedStatus === 0);
      assert.equal(await fs.readFile(feedPath, "utf8"), contents);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function makeEmpty(summary) {
  return { ...summary, firstDate: null, lastDate: null, rawEventCount: 0,
    extraction: { complete: true, sourceTotal: 0, rowCount: 0, totalPages: 1, pagesCollected: 1, pageSize: 20, pageSizes: [0], explicitEmpty: true } };
}

test("complete sparse sources do not require an event on day 45", () => {
  const feed = fixture();
  assert.equal(RELIABLE_HORIZON_DAYS, 45);
  assert.ok(feed.sources["boat-seal"].lastDate < feed.window.publicSearchThrough);
  assert.equal(validateFeed(feed, { now }).valid, true);
});

test("verified zero is valid, remains separate from failure, and can be reused without refreshing evidence", () => {
  const feed = fixture();
  feed.sources["boat-seal"] = makeEmpty(feed.sources["boat-seal"]);
  assert.equal(validateFeed(feed, { now }).valid, true);
  assert.equal(canReuseSource(feed.sources["boat-seal"], [], now), true);
  feed.sources["boat-seal"].status = "stale";
  assert.equal(validateFeed(feed, { now }).valid, true);
  assert.match(validateFeed(feed, { now }).warnings.join(), /stale/);
  feed.sources["boat-seal"].status = "failed";
  assert.equal(validateFeed(feed, { now }).valid, false);
  assert.equal(canReuseSource(feed.sources["boat-seal"], [], now), false);
});

test("an empty feed is valid only after both complete source checks", () => {
  const feed = fixture();
  for (const name of Object.keys(feed.sources)) feed.sources[name] = makeEmpty(feed.sources[name]);
  feed.events = []; feed.eventCount = 0; feed.window.latestListedDate = null;
  assert.equal(validateFeed(feed, { now }).valid, true);
  feed.sources["guided-shore"].extraction.explicitEmpty = false;
  assert.equal(validateFeed(feed, { now }).valid, false);
});

for (const mutation of [
  feed => delete feed.sources["boat-seal"],
  feed => feed.sources["boat-seal"].role = "supplementary",
  feed => feed.sources["boat-seal"].widgetId = "4747",
  feed => feed.sources["boat-seal"].extraction.sourceTotal = 2,
  feed => feed.sources["boat-seal"].extraction.pageSizes = [],
  feed => feed.sources["boat-seal"].extraction.pagesCollected = 0,
  feed => feed.sources["boat-seal"].checkedThrough = "2028-01-01",
  feed => feed.sources["boat-seal"].status = "failed"
]) test(`invalid required source cannot be hidden by a coverage flag: ${mutation}`, () => {
  const feed = fixture(); mutation(feed);
  if (feed.sources["boat-seal"]) feed.sources["boat-seal"].coversPublicHorizon = true;
  assert.equal(validateFeed(feed, { now }).valid, false);
});

test("old schema and snapshot cannot invent complete-extraction evidence", () => {
  const feed = fixture(); feed.schemaVersion = "1.0.0";
  for (const source of Object.values(feed.sources)) delete source.extraction;
  assert.equal(validateFeed(feed, { now }).valid, false);
  assert.equal(canReuseSource(feed.sources["boat-seal"], [], now), false);
});

test("health monitor checks source freshness and completeness, not just generatedAt", () => {
  const feed = fixture();
  assert.equal(evaluateWebsiteFeed(feed, now).state, "PASS");
  feed.sources["boat-seal"].lastSuccessfulAt = now.minus({ hours: 40 }).toISO();
  Object.assign(feed.sources["boat-seal"], checkedRange(feed.sources["boat-seal"].lastSuccessfulAt));
  feed.window.publicSearchThrough = feed.sources["boat-seal"].checkedThrough;
  assert.equal(evaluateWebsiteFeed(feed, now).state, "FAIL");
  const other = fixture(); other.sources["boat-seal"].extraction.complete = false;
  assert.equal(evaluateWebsiteFeed(other, now).state, "FAIL");
});

test("Sydney date, not UTC date, controls midnight and DST reliable range", () => {
  assert.deepEqual(checkedRange("2026-10-03T14:30:00Z"), { checkedFrom: "2026-10-04", checkedThrough: "2026-11-18" });
  assert.deepEqual(checkedRange("2026-11-03T13:30:00Z"), { checkedFrom: "2026-11-04", checkedThrough: "2026-12-19" });
});

test("future and expired cache timestamps are not reusable", () => {
  for (const hours of [-1, 49]) {
    const feed = fixture(now.minus({ hours }).toISO());
    assert.equal(canReuseSource(feed.sources["boat-seal"], [{}], now), false);
  }
});

test("cached source identity must match before fallback can reuse or relabel it", () => {
  const summary = makeEmpty(fixture().sources["boat-seal"]);
  const meta = { source: "boat-seal", widgetId: "4746", role: "core" };
  assert.equal(canReuseSource(summary, [], now, 48, meta), true);
  assert.equal(canReuseSource({ ...summary, widgetId: "4747" }, [], now, 48, meta), false);
  assert.equal(canReuseSource({ ...summary, role: "supplementary" }, [], now, 48, meta), false);
});
