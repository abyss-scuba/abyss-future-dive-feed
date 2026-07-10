#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { DateTime } from "luxon";
import { decodeBookingUrl } from "../src/booking-code.mjs";

const feedPath = process.argv[2] || "data/future-dives.json";

function error(errors, message) {
  errors.push(message);
}

async function main() {
  const feed = JSON.parse(await fs.readFile(feedPath, "utf8"));
  const errors = [];
  const warnings = [];

  if (feed.schemaVersion !== "1.0.0") {
    error(errors, `Unexpected schemaVersion: ${feed.schemaVersion}`);
  }
  if (!DateTime.fromISO(feed.generatedAt || "").isValid) {
    error(errors, "generatedAt is missing or invalid");
  }
  if (!Array.isArray(feed.events)) error(errors, "events must be an array");

  const coreSources = Object.entries(feed.sources || {}).filter(
    ([, source]) => source.role === "core"
  );
  if (!coreSources.length) error(errors, "No core source summaries found");

  for (const [name, source] of coreSources) {
    if (!source.lastDate) error(errors, `${name}: missing lastDate`);
    if (!source.coversPublicHorizon) {
      error(errors, `${name}: public horizon is not covered`);
    }
    if (source.status === "stale") {
      warnings.push(`${name}: using last-known-good stale data`);
    }
  }

  const ids = new Set();
  for (const [index, event] of (feed.events || []).entries()) {
    const label = event.id || `event[${index}]`;
    if (!event.id) error(errors, `${label}: missing id`);
    if (ids.has(event.id)) error(errors, `${label}: duplicate id`);
    ids.add(event.id);

    if (!DateTime.fromISO(event.startDate || "").isValid) {
      error(errors, `${label}: invalid startDate`);
    }
    if (event.price?.amount == null || !Number.isFinite(event.price.amount)) {
      error(errors, `${label}: missing or invalid price.amount`);
    }
    if (!event.bookingUrl || !event.bookingCode) {
      error(errors, `${label}: exact bookingUrl/bookingCode is required`);
    } else {
      const decoded = decodeBookingUrl(event.bookingUrl);
      if (decoded.bookingCode !== event.bookingCode) {
        error(errors, `${label}: stored bookingCode does not match bookingUrl`);
      }
      if (event.openCartId && decoded.openCartId !== event.openCartId) {
        error(errors, `${label}: stored openCartId does not match bookingUrl`);
      }
    }
    if (!event.productPath?.startsWith("/")) {
      error(errors, `${label}: productPath is missing or invalid`);
    }
  }

  const report = {
    valid: errors.length === 0,
    errors,
    warnings,
    eventCount: feed.events?.length || 0
  };

  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((failure) => {
  console.error(failure.stack || failure.message);
  process.exitCode = 1;
});
