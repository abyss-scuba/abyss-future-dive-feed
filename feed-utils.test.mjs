import test from "node:test";
import assert from "node:assert/strict";
import { decodeBookingUrl, stripTrailingDate } from "../src/booking-code.mjs";

test("decodes an Abyss DS360 event booking URL", () => {
  const url = "https://www.abyss.com.au/charters/scuba-dive-with-seals?q=cGFydF9udW1iZXI9TWFydGluIElzbGFuZCBTZWFscyAxMS83LzIwMjYmZGF0ZT0mb3Blbl9jYXJ0X2lkPTY2MTIxODc4";
  const decoded = decodeBookingUrl(url);

  assert.equal(decoded.openCartId, "66121878");
  assert.equal(decoded.partNumber, "Martin Island Seals 11/7/2026");
  assert.match(decoded.decodedBookingCode, /open_cart_id=66121878/);
});

test("strips common date suffixes from part numbers", () => {
  assert.equal(stripTrailingDate("The Steps 11/7/2026"), "The Steps");
  assert.equal(stripTrailingDate("Voodoo Club Dive 12-07-2026"), "Voodoo Club Dive");
});
