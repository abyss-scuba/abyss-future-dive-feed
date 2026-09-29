import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DateTime } from "luxon";
import { ARTICLE_ID, ARTICLE_TITLE, COLLECTION_ID, ZONE, buildShoreSnapshot, weekendWindows, renderShoreArticle, updateShoreArticle } from "../src/helpscout-shore.mjs";

const rows = JSON.parse(fs.readFileSync(new URL("./fixtures/shore-widget-2026-09-29.json", import.meta.url)));
const checkedAt = DateTime.fromISO("2026-09-29T04:00:00", { zone: ZONE });
const snapshot = () => buildShoreSnapshot(rows, checkedAt);
const currentArticle = text => ({ id: ARTICLE_ID, name: ARTICLE_TITLE, collectionId: COLLECTION_ID, status: "published", hasDraft: false, text });
const previous = '<p>Last successfully checked: yesterday</p><p>shore-dive-beacon-data: 28 shore-dive events are listed.</p>';

test("actual source has 28 shore events including both Marine Marvels and evening dives", () => {
  const s = snapshot();
  assert.equal(s.events.length, 28);
  assert.equal(s.events.filter(e => e.category === "Marine Marvels shore dive").length, 2);
  assert.equal(s.events.find(e => e.title === "Oak Park ND").startTime, "18:00");
  assert.equal(s.events.at(-1).startDate, "2026-11-29");
  const text = renderShoreArticle(s);
  assert.match(text, /Saturday 3 October 2026 at 09:00/);
  assert.match(text, /Sunday 4 October 2026 at 10:00/);
  assert.match(text, /Marine Marvels ARE shore dives/);
  assert.match(text, /Select your dive gear/);
  assert.doesNotMatch(text, /\$25|\$49|14 places|Magic Point|boat-dives\?q=/);
});

test("boat, unknown and mismatched category URLs fail closed", () => {
  const boat = { ...rows[0], label: "Boat Dives", bookingUrl: rows[0].bookingUrl.replace("guided-shore-dives", "boat-dives") };
  assert.throws(() => buildShoreSnapshot([boat], checkedAt), /Unexpected category/);
  assert.throws(() => buildShoreSnapshot([{ ...rows[0], label: "Marine Marvels Dives" }], checkedAt), /Unexpected category/);
  assert.throws(() => buildShoreSnapshot([{ ...rows[0], detailStart: "03 Oct 2026 10:00 AM" }], checkedAt), /dates disagree/);
  assert.throws(() => buildShoreSnapshot([], checkedAt), /no rows/);
});

test("duplicate links with conflicting event details block publishing", () => {
  assert.throws(() => buildShoreSnapshot([...rows, { ...rows[0], detailStart: "02 Oct 2026 11:00 AM" }], checkedAt), /Conflicting/);
  assert.equal(buildShoreSnapshot([...rows, rows[0]], checkedAt).events.length, 28);
});

test("three-month window excludes past rows without inventing unsupplied dates", () => {
  const s = buildShoreSnapshot(rows, DateTime.fromISO("2026-10-05T04:00", { zone: ZONE }));
  assert.equal(s.events[0].startDate, "2026-10-09");
  assert.equal(s.through.toISODate(), "2027-01-05");
  assert.match(renderShoreArticle(s), /Absence beyond the last listed date does not prove no dives/);
});

test("weekend dates follow Sydney weekdays across DST and a Sunday", () => {
  assert.equal(weekendWindows(checkedAt.startOf("day")).nextWeekend.toISODate(), "2026-10-03");
  const sunday = DateTime.fromISO("2026-10-04T04:00", { zone: ZONE });
  assert.equal(sunday.offset, 660);
  assert.equal(weekendWindows(sunday.startOf("day")).nextWeekend.toISODate(), "2026-10-10");
  const autumn = DateTime.fromISO("2027-04-04T04:00", { zone: ZONE });
  assert.equal(autumn.offset, 600);
});

test("source descriptions are escaped as text", () => {
  const s = snapshot(); s.events[0].description = '<script>alert(1)</script> & rays';
  assert.match(renderShoreArticle(s), /&lt;script&gt;/);
  assert.doesNotMatch(renderShoreArticle(s), /<script>/);
});

test("dry run verifies exact target with GET only; publishing only updates text and reads it back", async () => {
  const methods = []; let saved = previous;
  const fake = async (url, init) => {
    assert.equal(url, `https://docsapi.helpscout.net/v1/articles/${ARTICLE_ID}`);
    methods.push(init.method);
    if (init.method === "PUT") {
      const payload = JSON.parse(init.body);
      assert.deepEqual(Object.keys(payload), ["text"]); saved = payload.text;
      return new Response(null, { status: 200 });
    }
    return new Response(JSON.stringify({ article: currentArticle(saved) }));
  };
  assert.equal((await updateShoreArticle(snapshot(), "fake", fake)).status, "dry-run");
  assert.deepEqual(methods, ["GET"]); methods.length = 0;
  assert.equal((await updateShoreArticle(snapshot(), "fake", fake, { dryRun: false })).status, "updated");
  assert.deepEqual(methods, ["GET", "PUT", "GET"]); methods.length = 0;
  assert.equal((await updateShoreArticle(snapshot(), "fake", fake, { dryRun: false })).status, "unchanged");
  assert.deepEqual(methods, ["GET"]);
});

test("wrong article, collection, title, status, draft and large count losses prevent writes", async () => {
  for (const changes of [{ id: "other" }, { collectionId: "other" }, { name: "other" }, { status: "draft" }, { hasDraft: true }, { text: "unmanaged" }, { text: previous.replace("28 shore", "90 shore") }]) {
    const methods = [];
    const fake = async (_url, init) => { methods.push(init.method); return new Response(JSON.stringify({ article: { ...currentArticle(previous), ...changes } })); };
    await assert.rejects(updateShoreArticle(snapshot(), "fake", fake, { dryRun: false }));
    assert.deepEqual(methods, ["GET"]);
  }
});

test("failed published readback cannot be reported as success", async () => {
  const fake = async (_url, init) => init.method === "PUT" ? new Response(null) : new Response(JSON.stringify({ article: currentArticle(previous) }));
  await assert.rejects(updateShoreArticle(snapshot(), "fake", fake, { dryRun: false }), /readback mismatch/);
});
