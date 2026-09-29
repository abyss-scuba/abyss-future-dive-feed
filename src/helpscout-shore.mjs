import { DateTime } from "luxon";
import { parseWidgetRow, deduplicateWidgetRows, articleFingerprint, ZONE } from "./helpscout-calendar.mjs";

export { ZONE };
export const SOURCE_URL = "https://www.abyss.com.au/shore-dive-beacon-data";
export const SOURCE = { id: "4861", kind: "charter", label: "shore dives" };
export const ARTICLE_ID = "6abb494803648d35ccabcf5d";
export const COLLECTION_ID = "6abb22ad5c1e572f6ed8ba47";
export const ARTICLE_TITLE = "Upcoming Shore dive dates — schedule snapshot";
const categories = new Map([
  ["/charters/guided-shore-dives", "guided shore dives"],
  ["/charters/marine-marvels-dives", "marine marvels dives"]
]);
const html = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const date = value => value.setLocale("en-AU").toFormat("cccc d LLLL yyyy");

export function buildShoreSnapshot(rows, checkedAt = DateTime.now().setZone(ZONE)) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Shore widget has no rows; article left unchanged");
  const unique = deduplicateWidgetRows(rows, SOURCE);
  if (unique.conflicts.length) throw new Error("Conflicting shore event rows; article left unchanged");
  const today = checkedAt.setZone(ZONE).startOf("day");
  const through = today.plus({ months: 3 });
  const events = [];
  for (const row of unique.rows) {
    const parsed = parseWidgetRow(row, SOURCE);
    if (parsed.errors.length) throw new Error(`Invalid shore event: ${parsed.errors.join("; ")}`);
    const event = parsed.event;
    const expected = categories.get(new URL(event.bookingUrl).pathname.replace(/\/$/, ""));
    if (!expected || row.label.trim().toLowerCase() !== expected) {
      throw new Error("Unexpected category or booking destination in shore-only source; article left unchanged");
    }
    if (event.startDate < today.toISODate() || event.startDate > through.toISODate()) continue;
    event.category = expected === "marine marvels dives" ? "Marine Marvels shore dive" : "Guided shore dive";
    events.push(event);
  }
  events.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
  if (!events.length) throw new Error("No validated upcoming shore events; article left unchanged");
  if (new Set(events.map(e => e.id)).size !== events.length) throw new Error("Duplicate shore event identity");
  return { events, checkedAt: checkedAt.setZone(ZONE), today, through };
}

export function weekendWindows(today) {
  // During a weekend, show its remaining dates as this weekend; next is a week later.
  const thisSaturday = today.plus({ days: 6 - today.weekday });
  const next = today.weekday <= 5 ? thisSaturday : thisSaturday.plus({ weeks: 1 });
  return { thisWeekend: thisSaturday, nextWeekend: next, followingWeekend: next.plus({ weeks: 1 }) };
}

export function renderShoreArticle(snapshot) {
  const { events, checkedAt, today, through } = snapshot;
  const marine = events.filter(e => e.category === "Marine Marvels shore dive");
  const asDate = iso => DateTime.fromISO(iso, { zone: ZONE });
  const eventLine = e => `<li><strong>${html(date(asDate(e.startDate)))} at ${html(e.startTime)} — ${html(e.title)}</strong> (${html(e.category)}). ${html(e.description)} <a href="${html(e.bookingUrl)}">Check this event and book</a>.</li>`;
  const parts = [
    `<p><strong>Last successfully checked: ${html(date(checkedAt))} at ${html(checkedAt.toFormat("HH:mm ZZZZ"))}, Australia/Sydney.</strong></p>`,
    `<p>Source: <a href="${SOURCE_URL}">Abyss Shore Dive Beacon Data</a>. Automatically refreshed daily at 4:00 am Australia/Sydney. This dedicated shore schedule takes priority over the mixed Sydney Dive Calendar snapshot for the Sydney Shore Diving Questions Beacon.</p>`,
    `<p>These are ${events.length} listed shore events from ${html(date(asDate(events[0].startDate)))} to ${html(date(asDate(events.at(-1).startDate)))}: ${events.length - marine.length} Guided Shore Dives and ${marine.length} Marine Marvels Dives. The requested window is ${html(date(today))} through ${html(date(through))}; only dates actually supplied by the source are listed. Absence beyond the last listed date does not prove no dives will run.</p>`,
    "<p>Marine Marvels ARE shore dives, as confirmed by Abyss. Include them in shore-date and relevant marine-life answers. They may have a fee: check their own booking links for current price and inclusions; do not describe all shore events as free or promise wildlife sightings.</p>",
    "<h2>How to answer shore-diving date questions</h2>",
    "<p>If checked within the previous 36 hours, answer directly with the matching dive names, dates, Sydney start times and event links. These are scheduled listings as of the check, not live booking inventory. Never quote cached places or guarantee space, price, conditions or departure. If older than 36 hours, say the snapshot needs refreshing and point to the current shore booking page. Do not invent dates outside the supplied coverage.</p>"
  ];
  const windows = weekendWindows(today);
  for (const [heading, saturday] of [
    ["What shore dives are on this weekend?", windows.thisWeekend],
    ["What are the dives next weekend?", windows.nextWeekend],
    ["What shore dives are on the following weekend?", windows.followingWeekend]
  ]) {
    const sunday = saturday.plus({ days: 1 });
    const matching = events.filter(e => e.startDate >= saturday.toISODate() && e.startDate <= sunday.toISODate());
    parts.push(`<h2>${heading}</h2><p>Using ${html(date(today))} as the Sydney reference date, this means ${html(date(saturday))} and ${html(date(sunday))}. State these exact dates to remove ambiguity.</p>`);
    parts.push(matching.length ? `<ul>${matching.map(eventLine).join("\n")}</ul>` : "<p>No matching event is supplied in this snapshot. Check the live shore booking page or ask the team; do not interpret missing listings as a cancellation.</p>");
  }
  parts.push("<h2>Booking, rental gear and arrival</h2><p>Free guided shore dives still require booking: numbers are limited and cannot be exceeded, so book early. Add hire gear in the Select your dive gear section of the same organised-dive booking so it is linked to that specific dive. Arrive at the dive centre 15 minutes before the confirmed departure time. The times here are source-labelled scheduled start times; use the booking confirmation for meeting and departure arrangements. The separate rental page is for independent diving with a buddy.</p>");
  parts.push("<p>Site choice remains subject to certification, recent experience, conditions and the dive team's confirmation. Bare Island listings do not establish access to closed island, bridge or rock-shelf areas; the team confirms permitted entries. Leap to Steps requires appropriate advanced certification and experience.</p>");
  parts.push("<h2>Are Marine Marvels shore dives, and when are they scheduled?</h2><p>Yes. Marine Marvels are shore dives. Check their individual event details, fee and requirements. Sightings are not guaranteed.</p>");
  parts.push(marine.length ? `<ul>${marine.map(eventLine).join("\n")}</ul>` : "<p>No Marine Marvels date is supplied in the current snapshot. Ask the team about later dates.</p>");
  parts.push("<h2>All upcoming shore dive dates</h2>");
  for (const e of events) parts.push(`<h3>${html(date(asDate(e.startDate)))} — ${html(e.title)}</h3><p>Scheduled start: <strong>${html(e.startTime)}</strong> Sydney local time. ${html(e.category)}. ${html(e.description)} <a href="${html(e.bookingUrl)}">Check this event and book</a>.</p>`);
  return parts.join("\n");
}

export async function updateShoreArticle(snapshot, apiKey, fetchImpl = fetch, { dryRun = true } = {}) {
  if (!apiKey) throw new Error("HELP_SCOUT_DOCS_API_KEY is not configured");
  const headers = { Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`, Accept: "application/json" };
  const request = async (method, body) => {
    const response = await fetchImpl(`https://docsapi.helpscout.net/v1/articles/${ARTICLE_ID}`, {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Help Scout ${method} returned HTTP ${response.status}`);
    return method === "GET" ? (await response.json()).article : null;
  };
  const validate = article => {
    if (article?.id !== ARTICLE_ID || article?.collectionId !== COLLECTION_ID || article?.name !== ARTICLE_TITLE || article?.status !== "published" || article?.hasDraft) {
      throw new Error("Shore article identity, publication or draft status changed; no further writes");
    }
  };
  const current = await request("GET");
  validate(current);
  if (!/Last successfully checked:/.test(current.text || "") || !current.text.includes("shore-dive-beacon-data")) throw new Error("Shore article managed marker missing");
  const previousCount = Number(current.text.match(/(?:These are (\d+) listed shore events|(\d+) shore-dive events are listed)/)?.slice(1).find(Boolean));
  if (!previousCount) throw new Error("Previous shore event count not recognised; article left unchanged");
  if (snapshot.events.length < previousCount * 0.6) throw new Error(`Shore event count fell from ${previousCount} to ${snapshot.events.length}; article left unchanged`);
  const next = renderShoreArticle(snapshot);
  if (articleFingerprint(current.text) === articleFingerprint(next)) return { status: "unchanged", count: snapshot.events.length };
  if (dryRun) return { status: "dry-run", count: snapshot.events.length };
  // Only text is written: collection privacy, title, keywords and publication remain intact.
  await request("PUT", { text: next });
  const verified = await request("GET");
  validate(verified);
  if (articleFingerprint(verified.text) !== articleFingerprint(next)) throw new Error("Shore published readback mismatch; inspect before retrying");
  return { status: "updated", count: snapshot.events.length };
}
