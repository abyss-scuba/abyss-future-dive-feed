import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DateTime } from "luxon";
import {
  ARTICLE_HEADING, MARKER, SOURCE_URL, boatTarget, buildBoatSnapshot,
  certificationGuidance, publishedDepth, renderBoatArticle, updateBoatArticle, weekendWindows
} from "../src/helpscout-boat.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/boat-widget-2026-09-29.json", import.meta.url)));
const now = DateTime.fromISO("2026-09-29T17:00:00", { zone: "Australia/Sydney" });
const snapshot = () => buildBoatSnapshot(fixture.rows, now);
const target = {
  articleId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  collectionId: "bbbbbbbbbbbbbbbbbbbbbbbb",
  title: "Upcoming boat dives — schedule snapshot"
};
const bootstrap = `<!-- ${MARKER} --><h1>${ARTICLE_HEADING}</h1><p>Source: ${SOURCE_URL}.</p>`;
const article = (overrides = {}) => ({
  id: target.articleId, collectionId: target.collectionId, name: target.title,
  status: "published", hasDraft: false, text: bootstrap, ...overrides
});

function docsFetch(initial = article(), { corruptReadback = false } = {}) {
  let current = initial;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "PUT") {
      const payload = JSON.parse(options.body);
      if (!corruptReadback) current = { ...current, text: payload.text };
      return { ok: true, status: 200 };
    }
    return { ok: true, status: 200, json: async () => ({ article: current }) };
  };
  return { fetchImpl, calls };
}

test("captured widget 4862 yields 32 distinct exact event links and all four boat categories", () => {
  assert.equal(fixture.sourceWidgetId, "4862");
  const result = snapshot();
  assert.equal(result.events.length, 32);
  assert.equal(new Set(result.events.map(event => event.bookingUrl)).size, 32);
  assert.deepEqual(new Set(result.events.map(event => event.category)), new Set([
    "Boat dive", "Technical boat dive", "Single seal boat dive", "Seal boat dive"
  ]));
  assert.equal(result.events[0].startDate, "2026-10-03");
  assert.equal(result.events.at(-1).startDate, "2026-11-29");
});

test("published depth sets conservative certification guidance and discloses unguided trips", () => {
  const events = snapshot().events;
  const henry = events.find(event => event.title.startsWith("Henry Head"));
  const tuggerah = events.find(event => event.title.startsWith("Tuggerah"));
  const wanderers = events.find(event => event.title.includes("Wanderers"));
  assert.deepEqual(henry.depth, { text: "12–24m", maximum: 24 });
  assert.match(certificationGuidance(henry), /Advanced Open Water/);
  assert.equal(tuggerah.depth.maximum, 46);
  assert.match(certificationGuidance(tuggerah), /Technical-diving qualification/);
  assert.equal(wanderers.depth.maximum, 40);
  assert.match(certificationGuidance(wanderers), /Deep-diving qualification/);
  assert.equal(wanderers.unguided, true);
  assert.deepEqual(publishedDepth("reef 25–35m", "Voodoo"), { text: "25–35m", maximum: 35 });
  assert.equal(publishedDepth("site and depth to be confirmed"), null);
});

test("negative seat counts and $0.00 do not become availability or a free-price promise", () => {
  const seal = fixture.rows.find(row => row.partNumber === "Single Seal Dive 18/10/2026");
  const undola = fixture.rows.find(row => row.partNumber === "Undola Technical Dive 24/10/2026");
  assert.equal(seal.placesAvailable, -3);
  assert.equal(undola.price, "$0.00");
  const html = renderBoatArticle(snapshot());
  assert.ok(html.includes(seal.bookingUrl));
  assert.ok(html.includes(undola.bookingUrl));
  assert.match(html, /Wanderers UNGUIDED Boat Dive/);
  assert.match(html, /explicitly UNGUIDED/);
  assert.doesNotMatch(html, /-3 places|\$0\.00|13 places|Free boat dive/);
  assert.match(html, /Check live details, price and places/);
});

test("wrong booking path, category mismatch, invalid event and conflicting duplicates block a snapshot", () => {
  const wrongPath = structuredClone(fixture.rows);
  wrongPath[0].bookingUrl = wrongPath[0].bookingUrl.replace("/charters/boat-dives", "/charters/guided-shore-dives");
  assert.throws(() => buildBoatSnapshot(wrongPath, now), /Unexpected category or booking destination/);
  const wrongLabel = structuredClone(fixture.rows);
  wrongLabel[0].label = "Guided Shore Dives";
  assert.throws(() => buildBoatSnapshot(wrongLabel, now), /Unexpected category or booking destination/);
  const invalidDate = structuredClone(fixture.rows);
  invalidDate[0].detailStart = "04 Oct 2026 08:00 AM";
  assert.throws(() => buildBoatSnapshot(invalidDate, now), /table and detail dates disagree/);
  const duplicate = structuredClone(fixture.rows);
  duplicate.push({ ...duplicate[0], detailStart: "03 Oct 2026 09:00 AM" });
  assert.throws(() => buildBoatSnapshot(duplicate, now), /Conflicting boat event rows/);
});

test("window never invents unsupplied dates and weekend answers use Sydney dates across DST", () => {
  const result = snapshot();
  const html = renderBoatArticle(result);
  assert.match(html, /Saturday 3 October 2026 and Sunday 4 October 2026/);
  assert.match(html, /Saturday 10 October 2026 and Sunday 11 October 2026/);
  const sunday = DateTime.fromISO("2026-10-04", { zone: "Australia/Sydney" });
  assert.equal(weekendWindows(sunday).thisWeekend.toISODate(), "2026-10-03");
  assert.equal(weekendWindows(sunday).nextWeekend.toISODate(), "2026-10-10");
  assert.ok(result.events.every(event => event.startDate >= "2026-09-29" && event.startDate <= "2026-12-29"));
  assert.doesNotMatch(html, /January 2027/);
});

test("source descriptions are escaped before rendering", () => {
  const rows = structuredClone(fixture.rows);
  rows[0].detailText += " <script>alert(1)</script>";
  const html = renderBoatArticle(buildBoatSnapshot(rows, now));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("target requires configured exact article, collection and title", () => {
  assert.deepEqual(boatTarget({
    HELP_SCOUT_BOAT_ARTICLE_ID: target.articleId,
    HELP_SCOUT_BOAT_COLLECTION_ID: target.collectionId,
    HELP_SCOUT_BOAT_ARTICLE_TITLE: target.title
  }), target);
  assert.throws(() => boatTarget({}), /must be configured/);
  assert.throws(() => boatTarget({ HELP_SCOUT_BOAT_ARTICLE_ID: "123" }), /must be configured/);
});

test("dry run uses GET only; publishing updates text only and verifies readback", async () => {
  const source = docsFetch();
  const dry = await updateBoatArticle(snapshot(), "fake", source.fetchImpl, { dryRun: true, target });
  assert.equal(dry.status, "dry-run");
  assert.deepEqual(source.calls.map(call => call.options.method), ["GET"]);
  assert.equal(source.calls[0].url, `https://docsapi.helpscout.net/v1/articles/${target.articleId}`);
  const live = await updateBoatArticle(snapshot(), "fake", source.fetchImpl, { dryRun: false, target });
  assert.equal(live.status, "updated");
  assert.deepEqual(source.calls.slice(1).map(call => call.options.method), ["GET", "PUT", "GET"]);
  const payload = JSON.parse(source.calls.find(call => call.options.method === "PUT").options.body);
  assert.deepEqual(Object.keys(payload), ["text"]);
  assert.match(payload.text, /<!-- ABYSS_BOAT_SNAPSHOT_V1 -->/);
  assert.match(payload.text, /https:\/\/www\.abyss\.com\.au\/boat-diving-beacon/);
  const unchanged = await updateBoatArticle(snapshot(), "fake", source.fetchImpl, { dryRun: false, target });
  assert.equal(unchanged.status, "unchanged");
  assert.equal(source.calls.filter(call => call.options.method === "PUT").length, 1);
});

test("wrong target, draft, missing marker and large count loss prevent writes", async () => {
  for (const bad of [
    { id: "cccccccccccccccccccccccc" }, { collectionId: "cccccccccccccccccccccccc" },
    { name: "wrong title" }, { status: "draft" }, { hasDraft: true },
    { text: "Unrelated content" },
    { text: `${bootstrap}<p>These are 100 listed boat events.</p>` }
  ]) {
    const source = docsFetch(article(bad));
    await assert.rejects(updateBoatArticle(snapshot(), "fake", source.fetchImpl, { dryRun: false, target }));
    assert.deepEqual(source.calls.map(call => call.options.method), ["GET"]);
  }
  const strippedComment = docsFetch(article({ text: `<h1>${ARTICLE_HEADING}</h1><p>Source: ${SOURCE_URL}</p>` }));
  assert.equal((await updateBoatArticle(snapshot(), "fake", strippedComment.fetchImpl, { dryRun: true, target })).status, "dry-run");
});

test("failed published readback is not reported as success", async () => {
  const source = docsFetch(article(), { corruptReadback: true });
  await assert.rejects(updateBoatArticle(snapshot(), "fake", source.fetchImpl, { dryRun: false, target }), /readback mismatch/);
  assert.deepEqual(source.calls.map(call => call.options.method), ["GET", "PUT", "GET"]);
});
