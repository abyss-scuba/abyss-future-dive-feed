import test from "node:test";
import assert from "node:assert/strict";
import { normaliseRawEvent } from "../src/normalise-event.mjs";

const context = {
  timezone: "Australia/Sydney",
  sourceUrl: "https://www.abyss.com.au/widget-all",
  scrapedAt: "2026-07-10T00:00:00.000Z"
};

test("normalises price, Sydney time and booking identity", () => {
  const event = normaliseRawEvent(
    {
      startDateText: "11 Jul 2026",
      endDateText: "11 Jul 2026",
      charterText: "Seal Diving",
      maxPlacesText: "19",
      placesAvailableText: "0",
      priceText: "$130.00",
      detailStartText: "11 Jul 2026 11:30 AM",
      detailPriceText: "$130.00",
      detailText:
        "Martin Island Seals 11/7/2026: Playful fur seals swirl around you.",
      bookingHref:
        "https://www.abyss.com.au/charters/scuba-dive-with-seals?q=cGFydF9udW1iZXI9TWFydGluIElzbGFuZCBTZWFscyAxMS83LzIwMjYmZGF0ZT0mb3Blbl9jYXJ0X2lkPTY2MTIxODc4",
      contactPart: null
    },
    {
      source: "boat-seal",
      role: "core",
      widgetId: "4746",
      category: "boat",
      productPath: null
    },
    context
  );

  assert.equal(event.id, "66121878");
  assert.equal(event.title, "Martin Island Seals");
  assert.equal(event.price.amount, 130);
  assert.equal(event.start, "2026-07-11T11:30:00+10:00");
  assert.equal(event.primaryCategory, "seal");
  assert.deepEqual(event.tags, ["boat", "marine-life", "seal"]);
});

test("accepts zero-dollar dives as a valid price", () => {
  const event = normaliseRawEvent(
    {
      startDateText: "10 Jul 2026",
      endDateText: "10 Jul 2026",
      charterText: "Guided Shore Dives",
      maxPlacesText: "20",
      placesAvailableText: "7",
      priceText: "$0.00",
      detailStartText: "10 Jul 2026 10:00 AM",
      detailPriceText: "$0.00",
      detailText:
        "Leap to Steps 10/7/2026: Drift dive for confident divers.",
      bookingHref:
        "https://www.abyss.com.au/charters/guided-shore-dives?q=cGFydF9udW1iZXI9TGVhcCB0byBTdGVwcyAxMC83LzIwMjYmZGF0ZT0mb3Blbl9jYXJ0X2lkPTY2MTIxODQ1",
      contactPart: null
    },
    {
      source: "guided-shore",
      role: "core",
      widgetId: "4745",
      category: "shore",
      productPath: "/charters/guided-shore-dives"
    },
    context
  );

  assert.equal(event.price.amount, 0);
  assert.equal(event.bookable, true);
  assert.equal(event.primaryCategory, "shore");
});
