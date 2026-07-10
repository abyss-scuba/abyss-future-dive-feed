import test from "node:test";
import assert from "node:assert/strict";
import { deduplicateEvents } from "../src/feed-utils.mjs";

test("deduplicates by openCartId and prefers specific-source metadata", () => {
  const broad = {
    id: "123",
    openCartId: "123",
    source: "boat-seal",
    sourceAliases: ["boat-seal"],
    title: "Single Seal Dive",
    tags: ["boat", "seal"],
    qualityWarnings: []
  };
  const specific = {
    ...broad,
    source: "marine-special",
    sourceAliases: ["marine-special"],
    title: "Martin Island Single Seal Dive",
    tags: ["marine-life", "seal"],
    qualityWarnings: ["example_warning"]
  };

  const result = deduplicateEvents([broad, specific]);
  assert.equal(result.length, 1);
  assert.equal(result[0].source, "marine-special");
  assert.equal(result[0].title, "Martin Island Single Seal Dive");
  assert.deepEqual(result[0].sourceAliases, ["boat-seal", "marine-special"]);
  assert.deepEqual(result[0].tags, ["boat", "marine-life", "seal"]);
});

import { DateTime } from "luxon";
import { filterEventsByDate } from "../src/feed-utils.mjs";

test("includes an event on the inclusive Sydney end date", () => {
  const zone = "Australia/Sydney";
  const start = DateTime.fromISO("2026-07-31", { zone });
  const end = DateTime.fromISO("2026-10-08", { zone });
  const events = [
    { id: "a", startDate: "2026-10-08" },
    { id: "b", startDate: "2026-10-09" }
  ];

  assert.deepEqual(
    filterEventsByDate(events, start, end, zone).map((event) => event.id),
    ["a"]
  );
});
