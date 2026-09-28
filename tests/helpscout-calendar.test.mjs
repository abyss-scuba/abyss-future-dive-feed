import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  ARTICLE_TITLE, COLLECTION_ID, ZONE,
  parseWidgetRow, buildSnapshot, deduplicateWidgetRows, renderArticle, updateHelpScoutArticle
} from "../src/helpscout-calendar.mjs";

const ARTICLE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

function row(date, title, id, label = "Boat Dives") {
  const [day, month, year] = date.split(" ");
  const monthNumber = DateTime.fromFormat(month, "LLL", { locale: "en-US" }).month;
  return {
    startDate: date, endDate: date, label,
    detailStart: `${date}  12:00 PM`,
    detailText: `${title} ${Number(day)}/${monthNumber}/${year.slice(-2)}: Dive details`,
    bookingUrl: `https://www.abyss.com.au/charters/boat-dives?q=${Buffer.from(`part_number=${encodeURIComponent(`${title} ${Number(day)}/${monthNumber}/${year.slice(-2)}`)}&date=&open_cart_id=${id}`).toString("base64")}`
  };
}

function sample() {
  const raw = {
    3855: [row("03 Oct 2026", "Advanced Open Water", "course1", "Advanced Open Water Diver")],
    3857: [],
    3856: [row("03 Oct 2026", "Magic Point Shark Dive", "charter1")]
  };
  return buildSnapshot(raw, DateTime.fromISO("2026-09-28T05:07:00", { zone: ZONE }), { minimumEvents: 2 });
}

test("a complete booking code and matching dates produce a precise event", () => {
  const parsed = parseWidgetRow(row("03 Oct 2026", "Magic Point Shark Dive", "charter1"), { kind: "charter" });
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.event.title, "Magic Point Shark Dive");
  assert.equal(parsed.event.startTime, "12:00");
  assert.equal(parsed.event.startDate, "2026-10-03");
  assert.ok(parsed.event.bookingUrl.includes("?q="));
});

test("contradictory detail or booking dates cannot enter the article", () => {
  const differentDetail = row("03 Oct 2026", "Magic Point", "a");
  differentDetail.detailStart = "04 Oct 2026  12:00 PM";
  assert.match(parseWidgetRow(differentDetail, { kind: "charter" }).errors.join(" "), /disagree/);
  const differentCode = row("03 Oct 2026", "Magic Point", "b");
  differentCode.bookingUrl = row("04 Oct 2026", "Magic Point", "b").bookingUrl;
  assert.match(parseWidgetRow(differentCode, { kind: "charter" }).errors.join(" "), /booking code/);

  const hyphenCode = row("24 Oct 2026", "Equipment Specialist", "equipment", "Equipment Specialist Course");
  const booking = new URL(hyphenCode.bookingUrl);
  booking.searchParams.set("q", Buffer.from("part_number=EQUIP%2024-10-2027&date=&open_cart_id=equipment").toString("base64"));
  hyphenCode.bookingUrl = booking.href;
  assert.match(parseWidgetRow(hyphenCode, { kind: "course" }).errors.join(" "), /booking code/);

  booking.searchParams.set("q", Buffer.from("part_number=EQUIP%2024-10-2026&date=&open_cart_id=equipment").toString("base64"));
  hyphenCode.bookingUrl = booking.href;
  assert.deepEqual(parseWidgetRow(hyphenCode, { kind: "course" }).errors, []);
});

test("matching page-boundary rows are kept once, while conflicting booking links are omitted", () => {
  const first = row("03 Oct 2026", "Advanced Open Water", "shared", "Advanced Open Water Diver");
  const same = { ...first, detailStart: "03 Oct 2026 12:00 PM" };
  const matching = deduplicateWidgetRows([first, same], { label: "courses" });
  assert.equal(matching.rows.length, 1);
  assert.equal(matching.identicalDuplicates, 1);
  assert.deepEqual(matching.excluded, []);

  const changed = { ...first, startDate: "04 Oct 2026" };
  const conflicting = deduplicateWidgetRows([first, changed], { label: "courses" });
  assert.equal(conflicting.rows.length, 0);
  assert.equal(conflicting.excluded.length, 2);
  assert.equal(conflicting.conflicts[0].rows.length, 2);
  assert.throws(() => buildSnapshot({
    3855: [row("03 Oct 2026", "Advanced Open Water", "safe")],
    3857: [], 3856: [row("03 Oct 2026", "Boat Dive", "boat")]
  }, DateTime.fromISO("2026-09-28T05:07:00", { zone: ZONE }), {
    minimumEvents: 2, preExcluded: conflicting.excluded
  }), /Too many inconsistent widget rows/);
});

test("the widget's Sep abbreviation is parsed as a Sydney date", () => {
  const parsed = parseWidgetRow(row("03 Sep 2027", "Shore Dive", "september"), { kind: "charter" });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.event.startDate, "2027-09-03");
});

test("contradictory distant events do not block a near-term snapshot", () => {
  const distant = row("03 Sep 2027", "Shore Dive", "distant");
  distant.detailStart = "04 Sep 2027  12:00 PM";
  const raw = {
    3855: [row("03 Oct 2026", "Advanced Open Water", "course1"), distant],
    3857: [],
    3856: [row("03 Oct 2026", "Boat Dive", "charter1")]
  };
  const snapshot = buildSnapshot(raw, DateTime.fromISO("2026-09-28T05:07:00", { zone: ZONE }), { minimumEvents: 2 });
  assert.equal(snapshot.events.length, 2);
  assert.deepEqual(snapshot.excluded, []);
});

test("the snapshot gives both same-day departures, omits places and escapes source text", () => {
  const snapshot = sample();
  snapshot.events[1].description = "Sharks & <rays>";
  const markup = renderArticle(snapshot);
  assert.match(markup, /12:00 · <a href=/);
  assert.match(markup, /Magic Point Shark Dive/);
  assert.match(markup, /Sharks &amp; &lt;rays&gt;/);
  assert.match(markup, /Use Filter Dives on this page/);
  assert.doesNotMatch(markup, /href="https:\/\/www\.abyss\.com\.au\/sydney-dive-calendar"/);
  assert.doesNotMatch(markup, /href="https:\/\/www\.abyss\.com\.au\/beacon"/);
  assert.doesNotMatch(markup, /places available|live seats|\$130/i);
  assert.equal((markup.match(/<li>/g) || []).length, 2);
});

test("an unpublished draft blocks all writes", async () => {
  let writes = 0;
  const fakeFetch = async (_url, init) => {
    if (init.method === "PUT") writes++;
    return new Response(JSON.stringify({ article: {
      id: ARTICLE_ID, collectionId: COLLECTION_ID, name: ARTICLE_TITLE,
      status: "published", hasDraft: true, text: "Schedule snapshot checked yesterday"
    } }), { status: 200 });
  };
  await assert.rejects(updateHelpScoutArticle(sample(), "fake-key", fakeFetch, { articleId: ARTICLE_ID }), /unpublished draft/);
  assert.equal(writes, 0);
});

test("the same snapshot skips a second publish", async () => {
  let writes = 0;
  const markup = renderArticle(sample());
  const fakeFetch = async (_url, init) => {
    if (init.method === "PUT") writes++;
    return new Response(JSON.stringify({ article: {
      id: ARTICLE_ID, collectionId: COLLECTION_ID, name: ARTICLE_TITLE,
      status: "published", hasDraft: false, text: markup
    } }), { status: 200 });
  };
  const result = await updateHelpScoutArticle(sample(), "fake-key", fakeFetch, { articleId: ARTICLE_ID });
  assert.equal(result.status, "unchanged");
  assert.equal(writes, 0);
});

test("the dry run verifies the exact Docs target with GET and never publishes", async () => {
  const methods = [];
  const fakeFetch = async (_url, init) => {
    methods.push(init.method);
    return new Response(JSON.stringify({ article: {
      id: ARTICLE_ID, collectionId: COLLECTION_ID, name: ARTICLE_TITLE,
      status: "published", hasDraft: false,
      text: "Schedule snapshot checked yesterday"
    } }), { status: 200 });
  };
  const result = await updateHelpScoutArticle(sample(), "fake-key", fakeFetch, {
    articleId: ARTICLE_ID, dryRun: true
  });
  assert.equal(result.status, "dry-run");
  assert.deepEqual(methods, ["GET"]);
});

test("a verified live update sends only the new article text and confirms publication", async () => {
  const methods = [];
  const snapshot = sample();
  let published = "Schedule snapshot checked yesterday";
  const fakeFetch = async (_url, init) => {
    methods.push(init.method);
    if (init.method === "PUT") {
      const payload = JSON.parse(init.body);
      assert.deepEqual(Object.keys(payload), ["text"]);
      assert.equal(payload.text, renderArticle(snapshot));
      published = payload.text;
      return new Response(null, { status: 200 });
    }
    return new Response(JSON.stringify({ article: {
      id: ARTICLE_ID, collectionId: COLLECTION_ID, name: ARTICLE_TITLE,
      status: "published", hasDraft: false, text: published
    } }), { status: 200 });
  };
  const result = await updateHelpScoutArticle(snapshot, "fake-key", fakeFetch, { articleId: ARTICLE_ID });
  assert.equal(result.status, "updated");
  assert.deepEqual(methods, ["GET", "PUT", "GET"]);
});

test("a sudden loss of listed events blocks publication", async () => {
  const methods = [];
  const fakeFetch = async (_url, init) => {
    methods.push(init.method);
    return new Response(JSON.stringify({ article: {
      id: ARTICLE_ID, collectionId: COLLECTION_ID, name: ARTICLE_TITLE,
      status: "published", hasDraft: false,
      text: "<p>Schedule snapshot checked yesterday. These are 75 listed events.</p>"
    } }), { status: 200 });
  };
  await assert.rejects(updateHelpScoutArticle(sample(), "fake-key", fakeFetch, {
    articleId: ARTICLE_ID
  }), /Event count fell from 75 to 2/);
  assert.deepEqual(methods, ["GET"]);
});
