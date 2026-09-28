import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  ZONE,
  parseWidgetRow, buildSnapshot, renderArticle, updateHelpScoutArticle
} from "../src/helpscout-calendar.mjs";

const ARTICLE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

function row(date, title, id, label = "Boat Dives") {
  const [day, month, year] = date.split(" ");
  const monthNumber = DateTime.fromFormat(month, "LLL", { locale: "en-AU" }).month;
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
});

test("the snapshot gives both same-day departures, omits places and escapes source text", () => {
  const snapshot = sample();
  snapshot.events[1].description = "Sharks & <rays>";
  const markup = renderArticle(snapshot);
  assert.match(markup, /12:00 · <a href=/);
  assert.match(markup, /Magic Point Shark Dive/);
  assert.match(markup, /Sharks &amp; &lt;rays&gt;/);
  assert.doesNotMatch(markup, /places available|live seats|\$130/i);
  assert.equal((markup.match(/<li>/g) || []).length, 2);
});

test("an unpublished draft blocks all writes", async () => {
  let writes = 0;
  const fakeFetch = async (_url, init) => {
    if (init.method === "PUT") writes++;
    return new Response(JSON.stringify({ article: {
      id: ARTICLE_ID,
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
      id: ARTICLE_ID,
      status: "published", hasDraft: false, text: markup
    } }), { status: 200 });
  };
  const result = await updateHelpScoutArticle(sample(), "fake-key", fakeFetch, { articleId: ARTICLE_ID });
  assert.equal(result.status, "unchanged");
  assert.equal(writes, 0);
});
