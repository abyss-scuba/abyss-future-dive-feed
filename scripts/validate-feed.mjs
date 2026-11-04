#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { DateTime } from "luxon";
import { decodeBookingUrl } from "../src/booking-code.mjs";

const feedPath = process.argv[2] || "data/future-dives.json";

function error(errors, message) {
  errors.push(message);
}

export { MAX_FEED_AGE_HOURS } from "../src/feed-coverage.mjs";
import { SCHEMA_VERSION, REQUIRED_SOURCES, RELIABLE_HORIZON_DAYS, freshnessError, sourceErrors, reliableSearchThrough, checkedRange } from "../src/feed-coverage.mjs";

export function validateFeed(feed, { now = DateTime.utc() } = {}) {
  const errors = [];
  const warnings = [];

  if (feed.schemaVersion !== SCHEMA_VERSION) {
    error(errors, `Unexpected schemaVersion: ${feed.schemaVersion}`);
  }
  if (!DateTime.isDateTime(now) || !now.isValid) {
    throw new Error("Validation requires a valid current time");
  }
  const ageError = freshnessError(feed.generatedAt, now);
  if (ageError) error(errors, `generatedAt ${ageError}`);
  const assemblyError = freshnessError(feed.assembledAt, now);
  if (assemblyError) error(errors, `assembledAt ${assemblyError}`);
  if (!Array.isArray(feed.events)) error(errors, "events must be an array");

  if (feed.timezone !== "Australia/Sydney") error(errors, "timezone must be Australia/Sydney");
  if (feed.publicHorizonDays !== RELIABLE_HORIZON_DAYS) error(errors, "publicHorizonDays must be 45");
  for (const [name, widgetId] of Object.entries(REQUIRED_SOURCES)) {
    const source = feed.sources?.[name];
    errors.push(...sourceErrors(source, name, { now, zone: feed.timezone }));
    if (source && (source.role !== "core" || source.widgetId !== widgetId)) error(errors, `${name}: required source identity or role changed`);
    if (source?.status === "stale") warnings.push(`${name}: using last-known-good stale data`);
  }
  // A failed optional source may be omitted. Retained optional data must be fresh enough too.
  for (const [name, source] of Object.entries(feed.sources || {})) {
    if (!(name in REQUIRED_SOURCES) && source.status !== "failed") errors.push(...sourceErrors(source, name, { now, zone: feed.timezone }));
  }
  const retainedCheckTimes = Object.values(feed.sources || {}).filter(source => source.status !== "failed")
    .map(source => DateTime.fromISO(source.lastSuccessfulAt || "").toMillis()).filter(Number.isFinite);
  if (!retainedCheckTimes.length || DateTime.fromISO(feed.generatedAt || "").toMillis() !== Math.min(...retainedCheckTimes)) error(errors, "generatedAt must preserve the oldest retained successful source check");
  if (retainedCheckTimes.some(time => time > DateTime.fromISO(feed.assembledAt || "").toMillis())) error(errors, "source successful check cannot be after assembledAt");
  const targetThrough = checkedRange(feed.assembledAt || "", feed.timezone).checkedThrough;
  const expectedThrough = reliableSearchThrough(feed.sources || {}, targetThrough);
  if (feed.window?.publicTargetThrough !== targetThrough || feed.window?.publicSearchThrough !== expectedThrough || !expectedThrough) error(errors, "window checked range does not match source checks");
  const start = DateTime.fromISO(feed.assembledAt || "").setZone(feed.timezone).startOf("day").plus({ days: feed.futureStartOffsetDays || 0 }).toISODate();
  if (!Number.isInteger(feed.futureStartOffsetDays) || feed.futureStartOffsetDays < 0 || feed.futureStartOffsetDays > RELIABLE_HORIZON_DAYS || feed.window?.startsOn !== start) error(errors, "invalid future window start");
  if (feed.eventCount !== (Array.isArray(feed.events) ? feed.events.length : -1)) error(errors, "eventCount does not match events");
  const latest = (Array.isArray(feed.events) ? feed.events : []).map(e => e.startDate).filter(Boolean).sort().at(-1) || null;
  if (feed.window?.latestListedDate !== latest) error(errors, "latestListedDate does not match retained listings");

  const ids = new Set();
  for (const [index, event] of (Array.isArray(feed.events) ? feed.events : []).entries()) {
    const label = event.id || `event[${index}]`;
    if (!event.id) error(errors, `${label}: missing id`);
    if (ids.has(event.id)) error(errors, `${label}: duplicate id`);
    ids.add(event.id);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.startDate || "") || !DateTime.fromISO(event.startDate || "").isValid) {
      error(errors, `${label}: invalid startDate`);
    }
    if (event.startDate < start) error(errors, `${label}: event precedes public window`);
    if (event.beyondReliableHorizon !== (event.startDate > expectedThrough)) error(errors, `${label}: incorrect reliability flag`);
    const source = feed.sources?.[event.source];
    if (!source || source.status === "failed") error(errors, `${label}: event has no usable source`);
    if (event.price?.amount == null || !Number.isFinite(event.price.amount)) {
      error(errors, `${label}: missing or invalid price.amount`);
    }
    if (!event.bookingUrl || !event.bookingCode) {
      error(errors, `${label}: exact bookingUrl/bookingCode is required`);
    } else {
      const decoded = decodeBookingUrl(event.bookingUrl);
      if (decoded.decodeError || !decoded.openCartId || !decoded.partNumber) error(errors, `${label}: invalid decoded booking identity`);
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

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    eventCount: feed.events?.length || 0
  };
}

export async function main() {
  const feed = JSON.parse(await fs.readFile(feedPath, "utf8"));
  const report = validateFeed(feed);
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((failure) => {
    console.error(failure.stack || failure.message);
    process.exitCode = 1;
  });
}
