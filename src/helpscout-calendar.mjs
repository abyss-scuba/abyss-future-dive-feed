import { createHash } from "node:crypto";
import { DateTime } from "luxon";

export const ZONE = "Australia/Sydney";
export const ARTICLE_TITLE = "Upcoming Sydney dive dates — schedule snapshot";
export const COLLECTION_ID = "6ab98d4249f1bc2c6aefca54";

export const SOURCES = [
  { id: "3855", kind: "course", label: "courses" },
  { id: "3857", kind: "trip", label: "travel" },
  { id: "3856", kind: "charter", label: "charters" }
];

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const html = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function dateFromTable(value) {
  // The widget uses English three-letter month names, including "Sep".
  // Luxon's en-AU locale expects "Sept", so parse the source spelling as en-US.
  const date = DateTime.fromFormat(clean(value), "dd LLL yyyy", { zone: ZONE, locale: "en-US" });
  return date.isValid ? date.toISODate() : null;
}

function dateFromDetail(value) {
  const match = clean(value).match(/^(\d{1,2} [A-Za-z]{3} \d{4})\s+(\d{1,2}:\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const date = DateTime.fromFormat(match[1], "d LLL yyyy", { zone: ZONE, locale: "en-US" });
  const time = DateTime.fromFormat(`${match[2]} ${match[3].toUpperCase()}`, "h:mm a", { zone: ZONE, locale: "en-US" });
  return date.isValid && time.isValid
    ? { date: date.toISODate(), time: time.toFormat("HH:mm") }
    : null;
}

function trailingDate(value) {
  const match = clean(value).match(/\b(\d{1,2})([/-])(\d{1,2})\2(\d{2}|\d{4})\s*$/);
  if (!match) return null;
  const year = match[4].length === 2 ? 2000 + Number(match[4]) : Number(match[4]);
  const date = DateTime.fromObject({ day: Number(match[1]), month: Number(match[3]), year }, { zone: ZONE });
  return date.isValid ? date.toISODate() : "invalid";
}

function decodeBookingLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.abyss.com.au", "abyss.com.au"].includes(url.hostname)) return null;
    const q = url.searchParams.get("q");
    if (!q || !/^[A-Za-z0-9+/]+={0,2}$/.test(q)) return null;
    const decoded = Buffer.from(q, "base64").toString("utf8");
    const params = new URLSearchParams(decoded);
    if (!params.get("open_cart_id") || !params.get("part_number")) return null;
    return { url: url.href, partNumber: clean(params.get("part_number")), id: params.get("open_cart_id") };
  } catch {
    return null;
  }
}

function category(row, kind) {
  if (kind !== "charter") return kind;
  const label = clean(row.label).toLowerCase();
  if (label === "guided shore dives") return "guided shore dive";
  if (label === "boat dives") return "boat dive";
  if (label === "tech boat dives") return "technical boat dive";
  if (label === "seal diving") return "seal diving";
  return label || "charter";
}

export function parseWidgetRow(row, source) {
  const errors = [];
  const startDate = dateFromTable(row.startDate);
  const endDate = dateFromTable(row.endDate);
  const detail = dateFromDetail(row.detailStart);
  const booking = decodeBookingLink(row.bookingUrl);
  if (!startDate || !endDate) errors.push("invalid table date");
  if (startDate && endDate && endDate < startDate) errors.push("end date precedes start date");
  if (!detail) errors.push("missing or invalid detailed start time");
  if (detail && startDate && detail.date !== startDate) errors.push("table and detail dates disagree");
  if (!booking) errors.push("missing exact event booking link");
  const bookDate = trailingDate(booking?.partNumber);
  if (bookDate && bookDate !== startDate) errors.push("booking code and table dates disagree");
  const detailHeading = clean(row.detailText).split(":")[0];
  const headingDate = trailingDate(detailHeading);
  if (headingDate && headingDate !== startDate) errors.push("description and table dates disagree");
  if (errors.length) return { event: null, errors };

  const bookingTitle = clean((booking.partNumber || detailHeading).replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, ""));
  // Course booking codes are often abbreviations such as "AOW 03-10-2026".
  const title = (source.kind === "course" ? clean(row.label) : bookingTitle) || clean(row.label);
  const description = clean(row.detailText).includes(":")
    ? clean(row.detailText).slice(clean(row.detailText).indexOf(":") + 1).trim()
    : "";
  return {
    event: {
      id: booking.id,
      kind: source.kind,
      title,
      category: category(row, source.kind),
      description,
      startDate,
      endDate,
      startTime: detail.time,
      bookingUrl: booking.url
    },
    errors: []
  };
}

export function deduplicateWidgetRows(rows, source) {
  const byLink = new Map();
  const withoutLink = [];
  for (const row of rows) {
    if (!row.bookingUrl) {
      withoutLink.push(row);
      continue;
    }
    if (!byLink.has(row.bookingUrl)) byLink.set(row.bookingUrl, []);
    byLink.get(row.bookingUrl).push(row);
  }
  const unique = [...withoutLink];
  const excluded = [];
  const conflicts = [];
  let identicalDuplicates = 0;
  for (const [bookingUrl, group] of byLink) {
    const variants = new Map(group.map((row) => [JSON.stringify({
      startDate: clean(row.startDate), endDate: clean(row.endDate),
      label: clean(row.label), detailStart: clean(row.detailStart),
      detailText: clean(row.detailText)
    }), row]));
    if (variants.size > 1) {
      conflicts.push({ source: source.label, bookingUrl, rows: [...variants.values()] });
      for (const row of group) excluded.push({
        source: source.label, startDate: row.startDate,
        reason: "conflicting rows share an event booking link"
      });
      continue;
    }
    unique.push(group[0]);
    identicalDuplicates += group.length - 1;
  }
  return { rows: unique, excluded, conflicts, identicalDuplicates };
}

export function buildSnapshot(rawBySource, checkedAt = DateTime.now().setZone(ZONE), options = {}) {
  const days = options.days ?? 56;
  const minimumEvents = options.minimumEvents ?? 12;
  const today = checkedAt.setZone(ZONE).startOf("day");
  const through = today.plus({ days });
  const events = [];
  const excluded = [];
  let candidateCount = 0;
  for (const entry of options.preExcluded || []) {
    const date = dateFromTable(entry.startDate);
    if (date && (date < today.toISODate() || date > through.toISODate())) continue;
    excluded.push(entry);
    candidateCount++;
  }
  for (const source of SOURCES) {
    const rows = rawBySource[source.id];
    if (!Array.isArray(rows) || (source.kind !== "trip" && rows.length === 0)) {
      throw new Error(`${source.label}: required widget data missing`);
    }
    for (const row of rows) {
      const tableDate = dateFromTable(row.startDate);
      // A distant bad description must not block a snapshot about the next 56
      // days. An unparseable table date still counts as a candidate error.
      if (tableDate && (tableDate < today.toISODate() || tableDate > through.toISODate())) continue;
      candidateCount++;
      const parsed = parseWidgetRow(row, source);
      if (parsed.errors.length) {
        excluded.push({ source: source.label, startDate: row.startDate, reason: parsed.errors.join("; ") });
      } else {
        events.push(parsed.event);
      }
    }
  }
  if (excluded.length > 5 || excluded.length > candidateCount * 0.1) {
    throw new Error(`Too many inconsistent widget rows (${excluded.length}); article was left unchanged`);
  }
  const unique = [...new Map(events.map((event) => [event.bookingUrl, event])).values()]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
  if (unique.length < minimumEvents || !unique.some((e) => e.kind === "course") || !unique.some((e) => e.kind === "charter")) {
    throw new Error(`Only ${unique.length} events in the ${days}-day window, or a required event type is absent; article was left unchanged`);
  }
  return { events: unique, excluded, checkedAt, today, through };
}

export function renderArticle(snapshot) {
  const { events, excluded, checkedAt } = snapshot;
  const first = DateTime.fromISO(events[0].startDate, { zone: ZONE });
  const last = DateTime.fromISO(events.at(-1).startDate, { zone: ZONE });
  const date = (d) => d.setLocale("en-AU").toFormat("d LLLL yyyy");
  const fullDate = (d) => d.setLocale("en-AU").toFormat("cccc d LLLL yyyy");
  // The date is stable across retries. Content changes are still compared below.
  const parts = [
    `<p>Schedule snapshot checked ${html(date(checkedAt.setZone(ZONE)))} Sydney time. These are ${events.length} listed events from ${html(date(first))} to ${html(date(last))} on the <a href="https://www.abyss.com.au/beacon">Abyss calendar data page</a>. Times below are Sydney local time. Dates, times, sites and trip details can change. Follow each event link to confirm current details and places before booking. This article is a schedule snapshot, not live availability or a suitability assessment.</p>`,
    '<p>If you are unsure which event fits your certification, experience, equipment or travel plans, ask the dive team in chat. You can also explore the <a href="https://www.abyss.com.au/sydney-dive-calendar">Sydney Dive Calendar</a>.</p>'
  ];
  let month = "";
  let day = "";
  for (const event of events) {
    const start = DateTime.fromISO(event.startDate, { zone: ZONE });
    const currentMonth = start.setLocale("en-AU").toFormat("LLLL yyyy");
    if (currentMonth !== month) {
      if (day) parts.push("</ul>");
      month = currentMonth;
      day = "";
      parts.push(`<h2>${html(month)}</h2>`);
    }
    if (event.startDate !== day) {
      if (day) parts.push("</ul>");
      day = event.startDate;
      parts.push(`<h3>${html(fullDate(start))}</h3><ul>`);
    }
    const ends = event.endDate !== event.startDate
      ? ` · ends ${html(DateTime.fromISO(event.endDate, { zone: ZONE }).setLocale("en-AU").toFormat("dd LLL yyyy"))}` : "";
    const description = event.description ? ` — ${html(event.description)}` : "";
    parts.push(`<li>${html(event.startTime)} · <a href="${html(event.bookingUrl)}">${html(event.title)}</a> (${html(event.category)})${ends}${description}</li>`);
  }
  if (day) parts.push("</ul>");
  parts.push(`<p>Source: Abyss /beacon course, travel and charter listings.${excluded.length ? ` ${excluded.length} row${excluded.length === 1 ? "" : "s"} with contradictory or incomplete event details ${excluded.length === 1 ? "was" : "were"} omitted; ask the dive team if you cannot find an event.` : ""}</p>`);
  return parts.join("\n");
}

export function articleFingerprint(markup) {
  // Help Scout may reformat HTML. Compare the meaningful text and exact booking
  // links so a delayed retry will not publish the same snapshot a second time.
  return createHash("sha256").update(String(markup || "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, " LINK:$1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ").trim()).digest("hex");
}

export async function updateHelpScoutArticle(snapshot, apiKey, fetchImpl = fetch, options = {}) {
  if (!apiKey) throw new Error("HELP_SCOUT_DOCS_API_KEY is not configured");
  const articleId = options.articleId || process.env.HELP_SCOUT_ARTICLE_ID;
  if (!/^[a-f0-9]{24}$/i.test(articleId || "")) throw new Error("HELP_SCOUT_ARTICLE_ID is not configured");
  const url = `https://docsapi.helpscout.net/v1/articles/${articleId}`;
  const headers = { Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`, Accept: "application/json" };
  const request = async (method, body) => {
    const response = await fetchImpl(url, { method, headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Help Scout ${method} returned HTTP ${response.status}`);
    return method === "GET" ? (await response.json()).article : null;
  };
  const current = await request("GET");
  if (current?.id !== articleId || current?.collectionId !== COLLECTION_ID ||
      current?.name !== ARTICLE_TITLE || current?.status !== "published") {
    throw new Error("Help Scout article identity, collection, title or published status changed; article was left unchanged");
  }
  if (current.hasDraft) throw new Error("Help Scout article has an unpublished draft; article was left unchanged");
  if (!/Schedule snapshot checked|Source: Abyss \/beacon/.test(current.text || "")) {
    throw new Error("Article no longer looks like the managed schedule snapshot; article was left unchanged");
  }
  const next = renderArticle(snapshot);
  if (articleFingerprint(current.text) === articleFingerprint(next)) return { status: "unchanged", count: snapshot.events.length };
  if (options.dryRun) return { status: "dry-run", count: snapshot.events.length, html: next };
  await request("PUT", { text: next });
  const verified = await request("GET");
  if (verified?.status !== "published" || articleFingerprint(verified.text) !== articleFingerprint(next)) {
    throw new Error("Help Scout readback did not match the new snapshot; inspect the article before retrying");
  }
  return { status: "updated", count: snapshot.events.length };
}
