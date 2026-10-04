import { DateTime } from "luxon";
import { load } from "cheerio";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { articleFingerprint, deduplicateWidgetRows, parseWidgetRow, ZONE } from "./helpscout-calendar.mjs";

export { ZONE };
export const SOURCE_URL = "https://www.abyss.com.au/boat-diving-beacon";
export const SOURCE = { id: "4862", kind: "charter", label: "boat dives" };
export const MARKER = "ABYSS_BOAT_SNAPSHOT_V1";
export const ARTICLE_HEADING = "Upcoming Sydney boat dives — schedule snapshot";

// Preserve the operator clarification read from the existing published article
// during the owner-authorised recovery on 4 October 2026. A site maximum alone
// must not erase a confirmed, shallower Henry Head departure profile.
export const HENRY_HEAD_GUIDANCE = "Ideal first boat dive with an easily maintained shallow profile within Open Water limits. Reaching deeper water requires effort and a long swim; confirm the individual plan, recency and conditions with the team.";
export const OPERATOR_PROFILE_GUIDANCE = "Use the actual planned dive profile and confirmed operator requirements for eligibility, not the site maximum alone. Abyss confirmed on 30 September 2026 that Henry Head is an ideal first boat dive with an easy shallow profile; the 12–24m listing does not make it Advanced-only. Ask about certification and recent experience.";

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
  // The reviewed clarification applies to normal Henry Head boat departures,
  // not an explicitly Advanced-only, technical, deeper or unguided event.
  if (event.category === "Boat dive" && /\bhenry\s+head\b/i.test(event.title || "") &&
      event.depth.maximum <= 24 && !event.unguided &&
      !/must be advanced|advanced[- ]only|\bunguided\b/i.test(`${event.title || ""} ${event.description || ""}`)) {
    return HENRY_HEAD_GUIDANCE;
  }
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
    `<p>These are scheduled departures as of the check date, with Sydney local start times. Open the individual event link for current price, places, meeting point and final details before booking. The planned site can change with conditions; the skipper and dive team make the final call. If the check date is old, use the live boat booking page for current departures. ${html(OPERATOR_PROFILE_GUIDANCE)} Copy only the complete booking URL supplied for the matching event below; never construct or alter encoded q/cart parameters. If an exact event link is unavailable, give the standard booking page and state the date and time to select.</p>`
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

export function reviewedBodyFingerprint(markup) {
  // Normalise only presentation differences seen in the read-only Quill
  // capture: paragraph tags, HTML entities, whitespace and zero-width BOMs.
  const plain = load(String(markup || "").replace(/<[^>]+>/g, " ")).root().text()
    .replace(/\uFEFF/g, "").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(plain).digest("hex");
}

function isReviewedLegacyArticle(article) {
  // One exact, fully reviewed legacy body only. No generic marker bypass.
  // Changed text, unknown links, another article, or a draft still blocks.
  if (article.id !== "6abb767c171ef8b866f2c9ce" || article.collectionId !== "6abb75219dcaab7ce64c5880") return false;
  if (reviewedBodyFingerprint(article.text) !== "3e5c3c81a27c55bdd93096f274e1b67b83fbbc5b69b18a184e3044f91f5ed103") return false;
  const $ = load(article.text || "");
  const links = $("a[href]").toArray().map(el => $(el).attr("href"));
  return links.length === 41 && links.every(url => [
    "https://www.abyss.com.au/charters/boat-dives",
    "https://www.abyss.com.au/charters/tech-boat-dives",
    "https://www.abyss.com.au/charters/scuba-dive-with-seals",
    "https://www.abyss.com.au/charters/single-seal-dive"
  ].includes(url));
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
  const managed = currentText.includes(MARKER) || (currentText.includes(SOURCE_URL) && currentText.includes(ARTICLE_HEADING));
  const reviewedLegacy = !managed && isReviewedLegacyArticle(current);
  if (!managed && !reviewedLegacy) {
    throw new Error("Boat article managed marker and source heading are missing, and body does not match the reviewed recovery; article left unchanged");
  }
  const previousCount = Number(currentText.match(/These are (\d+) listed boat events/)?.[1]);
  if (previousCount && snapshot.events.length < previousCount * 0.6) {
    throw new Error(`Boat event count fell from ${previousCount} to ${snapshot.events.length}; article left unchanged`);
  }
  const next = renderBoatArticle(snapshot);
  if (contentFingerprint(currentText) === contentFingerprint(next)) return { status: "unchanged", count: snapshot.events.length };
  if (dryRun) return { status: "dry-run", count: snapshot.events.length, reviewedLegacy };
  // Re-read immediately before a write to protect edits made during the check.
  const latest = (await request(url, "GET")).article;
  validate(latest);
  if (latest.text !== currentText) throw new Error("Boat article changed during preflight; article left unchanged");
  if (reviewedLegacy) {
    // Private backup stays in the runner's temporary area, never public logs,
    // public diagnostics artifacts or the repository. A text capture is also
    // retained in the owner's recovery conversation.
    await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `boat-before-recovery-${articleId}.json`), JSON.stringify(current), { mode: 0o600 });
  }
  await request(url, "PUT", { text: next });
  const verified = (await request(url, "GET")).article;
  validate(verified);
  if (articleFingerprint(verified.text) !== articleFingerprint(next)) {
    throw new Error("Boat published readback mismatch; inspect before retrying");
  }
  return { status: "updated", count: snapshot.events.length, ...(reviewedLegacy ? { recoveredReviewedLegacy: true } : {}) };
}
