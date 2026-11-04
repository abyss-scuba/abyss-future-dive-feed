import { DateTime } from "luxon";

export const RELIABLE_HORIZON_DAYS = 45;
export const MAX_FEED_AGE_HOURS = 48;
export const REQUIRED_SOURCES = { "guided-shore": "4745", "boat-seal": "4746" };
export const SCHEMA_VERSION = "1.1.0";

export function checkedRange(checkedAt, zone = "Australia/Sydney") {
  const day = DateTime.fromISO(checkedAt, { zone }).setZone(zone).startOf("day");
  return { checkedFrom: day.toISODate(), checkedThrough: day.plus({ days: RELIABLE_HORIZON_DAYS }).toISODate() };
}

export function freshnessError(timestamp, now = DateTime.utc(), maxHours = MAX_FEED_AGE_HOURS) {
  const parsed = DateTime.fromISO(typeof timestamp === "string" ? timestamp : "");
  if (!parsed.isValid || !/[Tt].*(?:[Zz]|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/.test(timestamp || "")) {
    return "is missing or invalid (an ISO timestamp with timezone is required)";
  }
  const age = now.toUTC().diff(parsed.toUTC(), "hours").hours;
  if (age < 0) return "is in the future";
  if (age > maxHours) return `is older than ${maxHours} hours; a fresh successful scrape is required`;
  return null;
}

export function extractionErrors(summary) {
  const x = summary?.extraction;
  if (!x || x.complete !== true) return ["complete extraction evidence is missing"];
  const errors = [];
  for (const key of ["sourceTotal", "rowCount", "totalPages", "pagesCollected", "pageSize"]) {
    if (!Number.isSafeInteger(x[key]) || x[key] < (key === "sourceTotal" || key === "rowCount" ? 0 : 1)) errors.push(`invalid extraction ${key}`);
  }
  if (x.rowCount !== x.sourceTotal || summary.rawEventCount !== x.rowCount) errors.push("source row count does not match extraction");
  if (x.totalPages !== Math.max(1, Math.ceil(x.sourceTotal / x.pageSize)) || x.pagesCollected !== x.totalPages) errors.push("not all source pages were collected");
  if (!Array.isArray(x.pageSizes) || x.pageSizes.length !== x.totalPages || x.pageSizes.some((size, i) => size !== Math.min(x.pageSize, Math.max(0, x.sourceTotal - i * x.pageSize)))) errors.push("source page sizes are incomplete");
  if (x.sourceTotal === 0 && x.explicitEmpty !== true) errors.push("zero rows lack explicit empty-source evidence");
  if (x.sourceTotal > 0 && x.explicitEmpty !== false) errors.push("empty-source evidence contradicts rows");
  return errors;
}

export function sourceErrors(summary, name, { now = DateTime.utc(), zone = "Australia/Sydney", maxHours = MAX_FEED_AGE_HOURS } = {}) {
  if (!summary) return [`${name}: required source is missing`];
  const errors = extractionErrors(summary).map(error => `${name}: ${error}`);
  const ageError = freshnessError(summary.lastSuccessfulAt, now, maxHours);
  if (ageError) errors.push(`${name}: lastSuccessfulAt ${ageError}`);
  if (!["fresh", "stale"].includes(summary.status)) errors.push(`${name}: source has no usable successful check`);
  if (!ageError) {
    const expected = checkedRange(summary.lastSuccessfulAt, zone);
    if (summary.checkedFrom !== expected.checkedFrom || summary.checkedThrough !== expected.checkedThrough) errors.push(`${name}: checked range must match the last successful 45-day check`);
  }
  if (summary.rawEventCount === 0) {
    if (summary.firstDate !== null || summary.lastDate !== null) errors.push(`${name}: empty source has listed dates`);
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(summary.firstDate || "") || !DateTime.fromISO(summary.firstDate || "").isValid || !/^\d{4}-\d{2}-\d{2}$/.test(summary.lastDate || "") || !DateTime.fromISO(summary.lastDate || "").isValid || summary.firstDate > summary.lastDate) errors.push(`${name}: invalid listed date range`);
  return errors;
}

export function reliableSearchThrough(sources, targetThrough) {
  const dates = Object.keys(REQUIRED_SOURCES).map(name => sources[name]?.checkedThrough);
  return dates.every(Boolean) ? [...dates, targetThrough].sort()[0] : null;
}

export function canReuseSource(summary, events, now, maxHours = MAX_FEED_AGE_HOURS, sourceMeta = null) {
  if (sourceMeta && (summary?.widgetId !== sourceMeta.widgetId || summary?.role !== sourceMeta.role || !Array.isArray(events) || events.some(event => event.source !== sourceMeta.source || event.sourceWidgetId !== sourceMeta.widgetId))) return false;
  return Array.isArray(events) && events.length === summary?.rawEventCount &&
    sourceErrors(summary, "cached source", { now, maxHours: Math.min(MAX_FEED_AGE_HOURS, maxHours) }).length === 0;
}
