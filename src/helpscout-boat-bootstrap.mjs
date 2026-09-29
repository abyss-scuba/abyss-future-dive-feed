import { createHash } from "node:crypto";

export const SHORE_COLLECTION_ID = "6abb22ad5c1e572f6ed8ba47";
export const BOAT_COLLECTION_NAME = "Boat Diving";
export const SCHEDULE_TITLE = "Upcoming Sydney boat dives — schedule snapshot";
const API = "https://docsapi.helpscout.net/v1";
const ID = /^[0-9a-f]{24}$/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameKeywords(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    new Set(a).size === a.length && b.every(value => a.includes(value));
}

function comparableHtml(value) {
  return String(value ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><").trim();
}

function managedSchedule(text) {
  return text.includes("ABYSS_BOAT_SNAPSHOT_V1") ||
    (text.includes("https://www.abyss.com.au/boat-diving-beacon") &&
      text.includes(SCHEDULE_TITLE));
}

export function verifyPack(payload, sourceBytes) {
  assert(Array.isArray(payload?.articles) && payload.articles.length === 7,
    "Boat Docs pack must contain exactly seven articles");
  assert(payload.sourceSha256 === createHash("sha256").update(sourceBytes).digest("hex"),
    "Boat Docs source and compiled articles differ; rebuild the payload");
  const slugs = new Set();
  const names = new Set();
  for (const article of payload.articles) {
    assert(typeof article.name === "string" && article.name.trim() === article.name && article.name,
      "Invalid Boat Docs article title");
    assert(typeof article.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug),
      `Invalid slug: ${article.name}`);
    assert(!slugs.has(article.slug) && !names.has(article.name), "Duplicate Boat Docs article");
    slugs.add(article.slug);
    names.add(article.name);
    assert(Array.isArray(article.keywords) && article.keywords.length >= 10 &&
      article.keywords.every(x => typeof x === "string" && x.trim() === x && x.length > 2) &&
      new Set(article.keywords).size === article.keywords.length,
      `Invalid keywords: ${article.name}`);
    assert(typeof article.text === "string" && article.text.includes("<h2") &&
      !article.text.includes("# Implementation notes") && !article.text.includes("**Keywords:**"),
      `Invalid article HTML: ${article.name}`);
  }
  assert(names.has(SCHEDULE_TITLE), "Schedule article missing from Boat Docs pack");
  const scheduleText = payload.articles.find(a => a.name === SCHEDULE_TITLE).text;
  assert(managedSchedule(scheduleText),
    "Schedule article has no managed source marker");
  assert(!scheduleText.includes("<table") && !/Schedule checked\s+\d/.test(scheduleText),
    "Initial schedule article must be a live-booking fallback, not a dated inventory");
  return payload.articles;
}

export function makeDocsClient(apiKey, fetchImpl = fetch) {
  assert(apiKey, "HELP_SCOUT_DOCS_API_KEY is not configured");
  const authorization = `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`;
  return async (method, path, body) => {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new Error(`Help Scout ${method} ${path.split("?")[0]} returned HTTP ${response.status}`);
    if (method === "POST") {
      const location = response.headers.get("location");
      const id = location?.match(/\/([0-9a-f]{24})\/?$/i)?.[1];
      assert(id, `Help Scout ${path} did not return a usable Location ID`);
      return id;
    }
    if (method === "GET") return response.json();
    return null;
  };
}

async function listAll(request, path, envelope) {
  const result = [];
  let page = 1;
  while (true) {
    assert(page <= 100, `Help Scout pagination exceeded 100 pages for ${path}`);
    const response = (await request("GET", `${path}${path.includes("?") ? "&" : "?"}page=${page}`))?.[envelope];
    assert(Array.isArray(response?.items) && Number.isInteger(response.pages) &&
      response.pages >= 1 && page <= response.pages,
      `Invalid Help Scout pagination for ${path}`);
    result.push(...response.items);
    if (page === response.pages) return result;
    page++;
  }
}

function verifyCollection(collection, siteId) {
  assert(ID.test(collection?.id) && collection.siteId === siteId &&
    collection.name === BOAT_COLLECTION_NAME && collection.visibility === "private",
    "Boat Diving collection identity, site or privacy mismatch");
}

function verifyArticleIdentity(current, planned, collectionId) {
  assert(ID.test(current?.id) && current.collectionId === collectionId &&
    current.slug === planned.slug && current.name === planned.name && !current.hasDraft,
    `Article identity or draft conflict: ${planned.name}`);
  assert(current.status === "published", `Article is not published: ${planned.name}`);
  if (planned.name === SCHEDULE_TITLE) {
    assert(managedSchedule(current.text ?? ""), "Boat schedule managed source marker missing");
  }
}

function verifyPublished(current, planned, collectionId, expectedText) {
  verifyArticleIdentity(current, planned, collectionId);
  assert(current.status === "published", `Article is not published: ${planned.name}`);
  assert(sameKeywords(current.keywords, planned.keywords),
    `Keyword readback mismatch: ${planned.name}`);
  if (expectedText !== undefined) {
    assert(comparableHtml(current.text) === comparableHtml(expectedText),
      `Article body readback mismatch: ${planned.name}`);
  }
}

export function verifyTarget(target) {
  assert(target && ID.test(target.articleId) && ID.test(target.collectionId) &&
    ID.test(target.siteId) && target.articleTitle === SCHEDULE_TITLE,
    "Invalid Boat Docs target metadata");
  return target;
}

export async function bootstrapBoatDocs({ request, articles, existingTarget = null }) {
  assert(typeof request === "function" && articles?.length === 7, "Invalid bootstrap inputs");

  // The existing private Shore collection anchors the new collection to the
  // actual Sydney knowledge base. No site ID is guessed or configured by hand.
  const shore = (await request("GET", `/collections/${SHORE_COLLECTION_ID}`))?.collection;
  assert(shore?.id === SHORE_COLLECTION_ID && ID.test(shore.siteId) &&
    shore.visibility === "private" && /shore/i.test(shore.name),
    "Existing Shore collection does not identify the expected private Docs site");
  const siteId = shore.siteId;
  const site = (await request("GET", `/sites/${siteId}`))?.site;
  // A private Docs site may be inactive as a public website while its private
  // collection is still the correct source for Beacon. The Shore collection
  // supplies the identity; public site status is not a publication gate.
  assert(site?.id === siteId, "Shore collection's Docs site ID did not match site readback");

  const collections = await listAll(request, `/collections?siteId=${siteId}&visibility=all`, "collections");
  const matches = collections.filter(item => item.name === BOAT_COLLECTION_NAME);
  assert(matches.length <= 1, "Ambiguous Boat Diving collections; no articles were changed");
  let collectionId;
  if (matches.length) {
    collectionId = matches[0].id;
  } else {
    collectionId = await request("POST", "/collections", {
      siteId, name: BOAT_COLLECTION_NAME, visibility: "private",
      description: "Sydney boat-diving questions and dates"
    });
  }
  const collection = (await request("GET", `/collections/${collectionId}`))?.collection;
  verifyCollection(collection, siteId);

  if (existingTarget) {
    verifyTarget(existingTarget);
    assert(existingTarget.siteId === siteId && existingTarget.collectionId === collectionId,
      "Existing Boat Docs target points at another collection or site");
  }
  const refs = await listAll(request, `/collections/${collectionId}/articles?pageSize=100&status=all`, "articles");
  // ArticleRef does not expose the slug in Help Scout's documented response.
  // Read every article in this one collection to detect both title and slug
  // collisions before writing any of the seven requested articles.
  const existing = [];
  for (const ref of refs) {
    assert(ID.test(ref?.id), "Invalid article reference in Boat Diving collection");
    const article = (await request("GET", `/articles/${ref.id}`))?.article;
    assert(article?.id === ref.id && article.collectionId === collectionId,
      "Article reference points outside Boat Diving collection");
    existing.push(article);
  }
  if (existingTarget) {
    const schedule = existing.filter(item => item.name === SCHEDULE_TITLE);
    assert(schedule.length === 1 && schedule[0].id === existingTarget.articleId,
      "Existing Boat Docs target points at a different schedule article");
  }
  const matchedIds = new Set();
  const matched = new Map();
  for (const planned of articles) {
    const candidates = existing.filter(item => item.slug === planned.slug || item.name === planned.name);
    assert(candidates.length <= 1, `Ambiguous or duplicate article: ${planned.name}`);
    const current = candidates[0];
    if (current) {
      assert(current.slug === planned.slug && current.name === planned.name && ID.test(current.id),
        `Article title/slug collision: ${planned.name}`);
      assert(!matchedIds.has(current.id), `Article reused by two definitions: ${planned.name}`);
      matchedIds.add(current.id);
      verifyArticleIdentity(current, planned, collectionId);
      // This bootstrap creates missing articles and validates existing ones.
      // Changes to staff-edited evergreen copy or keyword strategy require a
      // separate reviewed publication, never an automatic overwrite.
      verifyPublished(current, planned, collectionId,
        planned.name === SCHEDULE_TITLE ? undefined : planned.text);
    }
    matched.set(planned.slug, current);
  }
  let scheduleId;
  for (const planned of articles) {
    const current = matched.get(planned.slug);
    let id = current?.id;
    if (!id) {
      id = await request("POST", "/articles", {
        collectionId, status: "published", slug: planned.slug,
        name: planned.name, text: planned.text, keywords: planned.keywords
      });
    }
    const verified = (await request("GET", `/articles/${id}`))?.article;
    verifyPublished(verified, planned, collectionId,
      planned.name === SCHEDULE_TITLE && current ? undefined : planned.text);
    if (planned.name === SCHEDULE_TITLE) scheduleId = id;
  }

  assert(ID.test(scheduleId), "Published schedule article ID missing");
  const target = verifyTarget({ articleId: scheduleId, collectionId,
    articleTitle: SCHEDULE_TITLE, siteId });
  if (existingTarget) {
    verifyTarget(existingTarget);
    assert(JSON.stringify(existingTarget) === JSON.stringify(target),
      "Existing Boat Docs target differs from published identity; no target was rewritten");
  }
  return target;
}
