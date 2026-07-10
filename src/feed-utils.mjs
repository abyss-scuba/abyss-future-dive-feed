import { DateTime } from "luxon";
import { sourceSpecificity } from "./classify.mjs";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function eventIdentity(event) {
  return (
    (event.openCartId && `cart:${event.openCartId}`) ||
    (event.bookingUrl && `url:${event.bookingUrl}`) ||
    `fallback:${event.id}`
  );
}

function mergeEvents(existing, incoming) {
  const existingPriority = sourceSpecificity(existing.source);
  const incomingPriority = sourceSpecificity(incoming.source);
  const preferred = incomingPriority > existingPriority ? incoming : existing;
  const other = preferred === incoming ? existing : incoming;

  return {
    ...other,
    ...preferred,
    tags: unique([...(existing.tags || []), ...(incoming.tags || [])]).sort(),
    sourceAliases: unique([
      ...(existing.sourceAliases || [existing.source]),
      ...(incoming.sourceAliases || [incoming.source])
    ]).sort(),
    qualityWarnings: unique([
      ...(existing.qualityWarnings || []),
      ...(incoming.qualityWarnings || [])
    ]).sort()
  };
}

export function deduplicateEvents(events) {
  const byIdentity = new Map();

  for (const event of events) {
    const key = eventIdentity(event);
    const existing = byIdentity.get(key);
    byIdentity.set(key, existing ? mergeEvents(existing, event) : event);
  }

  return [...byIdentity.values()].sort((a, b) => {
    const aStart = `${a.startDate || "9999-99-99"}T${a.startTime || "99:99"}`;
    const bStart = `${b.startDate || "9999-99-99"}T${b.startTime || "99:99"}`;
    return aStart.localeCompare(bStart) || a.title.localeCompare(b.title);
  });
}

export function filterEventsByDate(
  events,
  startDate,
  endDate,
  zone = startDate?.zoneName || "Australia/Sydney"
) {
  return events.filter((event) => {
    if (!event.startDate) return false;
    const eventDate = DateTime.fromISO(event.startDate, { zone });
    return (
      eventDate.isValid &&
      eventDate.toMillis() >= startDate.toMillis() &&
      eventDate.toMillis() <= endDate.toMillis()
    );
  });
}

export function minimumCoreCoverageDate(sourceSummaries) {
  const core = Object.values(sourceSummaries)
    .filter((source) => source.role === "core" && source.lastDate)
    .map((source) => source.lastDate)
    .sort();
  return core.length ? core[0] : null;
}
