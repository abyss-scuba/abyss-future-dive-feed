import { createHash } from "node:crypto";
import { decodeBookingUrl, stripTrailingDate } from "./booking-code.mjs";
import {
  cleanText,
  combineDateAndTime,
  extractTime,
  parseTableDate
} from "./dates.mjs";
import { classifyEvent } from "./classify.mjs";

export function parseMoney(value) {
  const display = cleanText(value);
  if (!display) {
    return { amount: null, currency: "AUD", display: null };
  }

  const numeric = display.replace(/[^0-9.-]/g, "");
  const amount = numeric === "" ? null : Number(numeric);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: "AUD",
    display
  };
}

function parseInteger(value) {
  const match = cleanText(value).match(/-?\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function splitDetailText(value) {
  const text = cleanText(value);
  if (!text) return { heading: null, description: null };

  const colonIndex = text.indexOf(":");
  if (colonIndex === -1) {
    return { heading: text, description: null };
  }

  return {
    heading: cleanText(text.slice(0, colonIndex)),
    description: cleanText(text.slice(colonIndex + 1)) || null
  };
}

function stableFallbackId(parts) {
  return createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 24);
}

function sameMoney(a, b) {
  if (a?.amount == null || b?.amount == null) return true;
  return Math.abs(a.amount - b.amount) < 0.005;
}

export function normaliseRawEvent(raw, sourceMeta, context) {
  const zone = context.timezone;
  const qualityWarnings = [];

  const startDate = parseTableDate(raw.startDateText, zone);
  const endDate = parseTableDate(raw.endDateText, zone) || startDate;
  if (!startDate) qualityWarnings.push("invalid_start_date");

  const booking = decodeBookingUrl(raw.bookingHref, context.sourceUrl);
  if (booking.decodeError) qualityWarnings.push("booking_code_decode_failed");

  let productPath = sourceMeta.productPath || null;
  if (booking.bookingUrl) {
    try {
      productPath = new URL(booking.bookingUrl).pathname;
    } catch {
      qualityWarnings.push("invalid_product_path");
    }
  }

  const detailParts = splitDetailText(raw.detailText);
  const title =
    stripTrailingDate(booking.partNumber) ||
    stripTrailingDate(detailParts.heading) ||
    cleanText(raw.charterText) ||
    "Sydney dive";

  const timeText = extractTime(raw.detailStartText);
  const startDateTime = combineDateAndTime(startDate, timeText, zone);

  const tablePrice = parseMoney(raw.priceText);
  const detailPrice = parseMoney(raw.detailPriceText);
  const selectedPrice =
    detailPrice.amount != null ? detailPrice : tablePrice;

  if (!sameMoney(tablePrice, detailPrice)) {
    qualityWarnings.push("price_mismatch_between_table_and_detail");
  }
  if (selectedPrice.amount == null) qualityWarnings.push("missing_price");

  const maxPlaces = parseInteger(raw.maxPlacesText);
  const placesAvailable = parseInteger(raw.placesAvailableText);
  if (
    maxPlaces != null &&
    placesAvailable != null &&
    placesAvailable > maxPlaces
  ) {
    qualityWarnings.push("places_available_exceeds_max_places");
  }

  const classification = classifyEvent(
    {
      charter: cleanText(raw.charterText),
      title,
      description: detailParts.description,
      partNumber: booking.partNumber,
      productPath
    },
    sourceMeta
  );

  const openCartId = booking.openCartId || null;
  const id =
    openCartId ||
    stableFallbackId([
      productPath,
      startDate?.toFormat("yyyy-LL-dd"),
      timeText,
      title,
      booking.bookingUrl
    ]);

  const isExactBookingLink = Boolean(
    booking.bookingUrl && booking.bookingCode
  );
  if (!isExactBookingLink) qualityWarnings.push("missing_exact_booking_link");
  if (booking.bookingCode && !openCartId) {
    qualityWarnings.push("missing_decoded_open_cart_id");
  }

  return {
    id,
    openCartId,
    source: sourceMeta.source,
    sourceWidgetId: sourceMeta.widgetId,
    sourceRole: sourceMeta.role,
    sourceAliases: [sourceMeta.source],
    primaryCategory: classification.primaryCategory,
    tags: classification.tags,
    charter: cleanText(raw.charterText) || null,
    title,
    description: detailParts.description,
    partNumber: booking.partNumber,
    startDate: startDate?.toFormat("yyyy-LL-dd") || null,
    endDate: endDate?.toFormat("yyyy-LL-dd") || null,
    startTime: startDateTime?.toFormat("HH:mm") || null,
    start: startDateTime?.toISO({ suppressMilliseconds: true }) || null,
    timezone: zone,
    price: {
      amount: selectedPrice.amount,
      currency: "AUD",
      display: selectedPrice.display,
      tableDisplay: tablePrice.display,
      detailDisplay: detailPrice.display
    },
    availabilitySnapshot: {
      maxPlaces,
      placesAvailable,
      status:
        placesAvailable == null
          ? "unknown"
          : placesAvailable > 0
            ? "snapshot-open"
            : "snapshot-full-or-unavailable"
    },
    bookingUrl: booking.bookingUrl,
    bookingCode: booking.bookingCode,
    decodedBookingCode: booking.decodedBookingCode,
    productPath,
    actionType: isExactBookingLink ? "booking" : "contact-or-unavailable",
    bookable: isExactBookingLink,
    contactPart: cleanText(raw.contactPart) || null,
    qualityWarnings: [...new Set(qualityWarnings)].sort(),
    scrapedAt: context.scrapedAt
  };
}
