import { DateTime } from "luxon";
import { articleFingerprint, deduplicateWidgetRows, parseWidgetRow, ZONE } from "./helpscout-calendar.mjs";

export { ZONE };
export const SOURCE_URL = "https://www.abyss.com.au/boat-diving-beacon";
export const SOURCE = { id: "4862", kind: "charter", label: "boat dives" };
export const MARKER = "ABYSS_BOAT_SNAPSHOT_V1";
export const ARTICLE_HEADING = "Upcoming Sydney boat dives — schedule snapshot";

const categories = new Map([
  ["/charters/boat-dives", { label: "boat dives", name: "Boat dive" }],
  ["/charters/tech-boat-dives", { label: "tech boat dives", name: "Technical boat dive" }],
  ["/charters/single-seal-dive", { label: "single seal dive", name: "Single seal boat dive" }],
  ["/charters/scuba-dive-with-seals", { label: "seal diving", name: "Seal boat dive" }]
]);
const html = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const date = value => value.setLocale("en-AU").toFormat("cccc d LLLL yyyy");
const asDate = iso => DateTime.fromISO(iso, { zone: ZONE });

export function boatTarget(record) {
  const articleId = record?.articleId;
  const collectionId = record?.collectionId;
  const siteId = record?.siteId;
  const title = record?.articleTitle;
  if (!/^[a-f0-9]{24}$/i.test(articleId || "") || !/^[a-f0-9]{24}$/i.test(collectionId || "") ||
      !/^[a-f0-9]{24}$/i.test(siteId || "") || !title || title.trim() !== title || title.length > 200) {
    throw new Error("Verified Boat article ID, collection ID, site ID and exact title must be present before any Help Scout request");
  }
  return { articleId, collectionId, siteId, title };
}

export function publishedDepth(description, title = "") {
  const text = `${description} ${title}`;
  const matches = [...text.matchAll(/\b(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\s*m\b/gi)];
  if (!matches.length) return null;
  const depths = matches.map(match => ({
    text: match[0].replace(/\s+/g, ""),
    maximum: Number(match[2] || match[1])
  }));
  return depths.reduce((deepest, item) => item.maximum > deepest.maximum ? item : deepest);
}

export function certificationGuidance(event) {
  if (event.category === "Technical boat dive" || (event.depth?.maximum ?? 0) > 40) {
    return "Technical-diving qualification and relevant experience required; confirm this trip's exact requirements with the dive team.";
  }
  if (!event.depth) return "Depth and trip-specific certification are not stated in this event; confirm with the dive team before booking.";
  if (event.depth.maximum > 30) return "Deep-diving qualification and relevant experience required; confirm this trip's exact requirements with the dive team.";
  if (event.depth.maximum > 18 || /must be advanced/i.test(event.description)) {
    return "Advanced Open Water or higher and suitable recent experience; confirm this trip's exact requirements with the dive team.";
  }
  return "At least Open Water certification; confirm any trip-specific requirements with the dive team.";
}

export function buildBoatSnapshot(rows, checkedAt = DateTime.now().setZone(ZONE)) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Boat widget has no rows; article left unchanged");
  const unique = deduplicateWidgetRows(rows, SOURCE);
  if (unique.conflicts.length) throw new Error("Conflicting boat event rows; article left unchanged");
  const today = checkedAt.setZone(ZONE).startOf("day");
  const through = today.plus({ months: 3 });
  const events = [];
  for (const row of unique.rows) {
    const parsed = parseWidgetRow(row, SOURCE);
    if (parsed.errors.length) throw new Error(`Invalid boat event: ${parsed.errors.join("; ")}`);
    const event = parsed.event;
    const expected = categories.get(new URL(event.bookingUrl).pathname.replace(/\/$/, ""));
    if (!expected || row.label.trim().toLowerCase() !== expected.label) {
      throw new Error("Unexpected category or booking destination in boat-only source; article left unchanged");
    }
    if (event.startDate < today.toISODate() || event.startDate > through.toISODate()) continue;
    event.category = expected.name;
    event.depth = publishedDepth(event.description, event.title);
    event.unguided = /\bunguided\b/i.test(`${event.title} ${event.description}`);
    events.push(event);
  }
  events.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
  if (!events.length) throw new Error("No validated upcoming boat events; article left unchanged");
  if (new Set(events.map(event => event.id)).size !== events.length) throw new Error("Duplicate boat event identity");
  return { events, checkedAt: checkedAt.setZone(ZONE), today, through };
}

export function weekendWindows(today) {
  const thisSaturday = today.plus({ days: 6 - today.weekday });
  const next = thisSaturday.plus({ weeks: 1 });
  return { thisWeekend: thisSaturday, nextWeekend: next, followingWeekend: next.plus({ weeks: 1 }) };
}

function eventLine(event) {
  const depth = event.depth ? `Published depth: ${html(event.depth.text)}. ` : "Depth is not stated in this event. ";
  const guidance = html(certificationGuidance(event));
  const guided = event.unguided ? " <strong>This event is explicitly UNGUIDED.</strong>" : "";
  return `<li><strong>${html(date(asDate(event.startDate)))} at ${html(event.startTime)} — ${html(event.title)}</strong> (${html(event.category)}). ${depth}${guidance}${guided} ${html(event.description)} <a href="${html(event.bookingUrl)}">Check live details, price and places; book this event</a>.</li>`;
}

export function renderBoatArticle(snapshot) {
  const { events, checkedAt, today, through } = snapshot;
  const parts = [
    `<!-- ${MARKER} -->`,
    `<h1>${ARTICLE_HEADING}</h1>`,
    `<p><strong>Last successfully checked: ${html(date(checkedAt))} at ${html(checkedAt.toFormat("HH:mm ZZZZ"))}, Australia/Sydney.</strong></p>`,
    `<p>Source: <a href="${SOURCE_URL}">Abyss Boat Diving Beacon schedule</a>. The schedule is checked daily in Sydney time. These are ${events.length} listed boat events from ${html(date(asDate(events[0].startDate)))} to ${html(date(asDate(events.at(-1).startDate)))}. The search window is ${html(date(today))} through ${html(date(through))}; only supplied events are listed. No listing beyond the last date does not prove no later boat dives will run.</p>`,
    "<h2>Using these listings</h2>",
    "<p>These are scheduled departures as of the check date, with Sydney local start times. Open the individual event link for current price, places, meeting point and final details before booking. The planned site can change with conditions; the skipper and dive team make the final call. If the check date is old, use the live boat booking page for current departures. Qualification guidance here is based on the depth published for each event; ask the dive team about your own certification and recent experience.</p>"
  ];
  const windows = weekendWindows(today);
  for (const [heading, saturday] of [
    ["What boat dives are on this weekend?", windows.thisWeekend],
    ["What boat dives are on next weekend?", windows.nextWeekend],
    ["What boat dives are on the following weekend?", windows.followingWeekend]
  ]) {
    const sunday = saturday.plus({ days: 1 });
    const matching = events.filter(event => event.startDate >= saturday.toISODate() && event.startDate <= sunday.toISODate());
    parts.push(`<h2>${heading}</h2><p>Using ${html(date(today))} as the Sydney reference date, this means ${html(date(saturday))} and ${html(date(sunday))}.</p>`);
    parts.push(matching.length ? `<ul>${matching.map(eventLine).join("\n")}</ul>` : "<p>No event is supplied for these dates in this snapshot. Check the live booking page; missing listings do not prove a cancellation.</p>");
  }
  parts.push("<h2>All upcoming boat dive dates</h2>");
  parts.push(`<ul>${events.map(eventLine).join("\n")}</ul>`);
  parts.push('<p>For current price, availability, eligibility, departure and gear options, open the individual event link or see <a href="https://www.abyss.com.au/charters/boat-dives">Sydney Boat Dives</a>.</p>');
  return parts.join("\n");
}

function contentFingerprint(markup) {
  // Ignore only the clock and offset on the same Sydney calendar day. A new
  // day must publish a fresh check date even when every event is unchanged.
  // The published readback below still compares the exact rendered content.
  return articleFingerprint(String(markup || "").replace(
    /(Last successfully checked:\s*[^<]*? at )[^<,]+(?=, Australia\/Sydney\.)/i,
    "$1[verified clock]"
  ));
}

export async function updateBoatArticle(snapshot, apiKey, fetchImpl = fetch, { dryRun = true, target } = {}) {
  if (!apiKey) throw new Error("HELP_SCOUT_DOCS_API_KEY is not configured");
  const { articleId, collectionId, siteId, title } = boatTarget(target && {
    articleId: target.articleId, collectionId: target.collectionId,
    siteId: target.siteId, articleTitle: target.title
  });
  const url = `https://docsapi.helpscout.net/v1/articles/${articleId}`;
  const collectionUrl = `https://docsapi.helpscout.net/v1/collections/${collectionId}`;
  const headers = { Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`, Accept: "application/json" };
  const request = async (requestUrl, method, body) => {
    const response = await fetchImpl(requestUrl, {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Help Scout ${method} returned HTTP ${response.status}`);
    return method === "GET" ? await response.json() : null;
  };
  const validate = article => {
    if (article?.id !== articleId || article?.collectionId !== collectionId ||
        article?.name !== title || article?.status !== "published" || article?.hasDraft) {
      throw new Error("Boat article identity, publication or draft status changed; no further writes");
    }
  };
  const collection = (await request(collectionUrl, "GET")).collection;
  if (collection?.id !== collectionId || collection?.siteId !== siteId || collection?.visibility !== "private") {
    throw new Error("Boat collection identity, site or private visibility changed; article left unchanged");
  }
  const current = (await request(url, "GET")).article;
  validate(current);
  const currentText = current.text || "";
  // Docs may strip HTML comments. The exact article identity plus source URL
  // and heading still identify a previously managed snapshot safely.
  if (!currentText.includes(MARKER) && !(currentText.includes(SOURCE_URL) && currentText.includes(ARTICLE_HEADING))) {
    throw new Error("Boat article managed marker and source heading are missing; article left unchanged");
  }
  const previousCount = Number(currentText.match(/These are (\d+) listed boat events/)?.[1]);
  if (previousCount && snapshot.events.length < previousCount * 0.6) {
    throw new Error(`Boat event count fell from ${previousCount} to ${snapshot.events.length}; article left unchanged`);
  }
  const next = renderBoatArticle(snapshot);
  if (contentFingerprint(currentText) === contentFingerprint(next)) return { status: "unchanged", count: snapshot.events.length };
  if (dryRun) return { status: "dry-run", count: snapshot.events.length };
  await request(url, "PUT", { text: next });
  const verified = (await request(url, "GET")).article;
  validate(verified);
  if (articleFingerprint(verified.text) !== articleFingerprint(next)) {
    throw new Error("Boat published readback mismatch; inspect before retrying");
  }
  return { status: "updated", count: snapshot.events.length };
}
