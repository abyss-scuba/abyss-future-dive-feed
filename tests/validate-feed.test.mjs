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
const bookingCode = Buffer.from("part_number=Test dive&date=&open_cart_id=123").toString("base64");

function fixture(checkedAt = now.minus({ hours: 12 }).toISO()) {
  return {
    schemaVersion: "1.0.0",
    generatedAt: checkedAt,
    sources: Object.fromEntries(["guided-shore", "boat-seal"].map(name => [name, {
      role: "core", status: "fresh", lastSuccessfulAt: checkedAt,
      lastDate: "2027-01-16", coversPublicHorizon: true
    }])),
    events: [{
      id: "123", startDate: "2026-11-01", price: { amount: 0 },
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
  assert.equal(report.errors.filter(message => /older than 48 hours/.test(message)).length, 3);
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
    assert.equal(report.errors.length, 2);
  });
}

test("a fresh incomplete core horizon remains a failure", () => {
  const feed = fixture();
  feed.sources["guided-shore"].coversPublicHorizon = false;
  const report = validateFeed(feed, { now });
  assert.equal(report.valid, false);
  assert.match(report.errors.join("\n"), /guided-shore: public horizon is not covered/);
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
