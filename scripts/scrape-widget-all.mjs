#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { DateTime } from "luxon";
import { cleanText, parseTableDate } from "../src/dates.mjs";
import { normaliseRawEvent } from "../src/normalise-event.mjs";
import {
  deduplicateEvents
} from "../src/feed-utils.mjs";

import { RELIABLE_HORIZON_DAYS, SCHEMA_VERSION, REQUIRED_SOURCES, checkedRange, canReuseSource, reliableSearchThrough } from "../src/feed-coverage.mjs";
import { validateFeed } from "./validate-feed.mjs";

const CONFIG = {
  sourceUrl: process.env.SOURCE_URL || "https://www.abyss.com.au/widget-all",
  outputDir: process.env.OUTPUT_DIR || "data",
  diagnosticsDir: process.env.DIAGNOSTICS_DIR || "diagnostics",
  minInitialDelayMs: numberEnv("MIN_INITIAL_DELAY_MS", 10_000),
  widgetTimeoutMs: numberEnv("WIDGET_TIMEOUT_MS", 90_000),
  stabilityPollMs: numberEnv("STABILITY_POLL_MS", 1_000),
  stablePollsRequired: numberEnv("STABLE_POLLS_REQUIRED", 3),
  finalSettleMs: numberEnv("FINAL_SETTLE_MS", 1_500),
  futureStartOffsetDays: numberEnv("FUTURE_START_OFFSET_DAYS", 21),
  maxStaleHours: numberEnv("MAX_STALE_HOURS", 48),
  maxPagesPerSource: numberEnv("MAX_PAGES_PER_SOURCE", 10),
  headless: String(process.env.HEADLESS || "true").toLowerCase() !== "false",
  chromiumExecutablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  htmlFixturePath: process.env.HTML_FIXTURE_PATH || null
};

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await ensureDirectory(path.dirname(filePath));
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

function log(message, details = null) {
  const prefix = `[${new Date().toISOString()}]`;
  if (details == null) console.log(`${prefix} ${message}`);
  else console.log(`${prefix} ${message}`, details);
}

async function loadPage(page) {
  if (CONFIG.htmlFixturePath) {
    const fixtureHtml = await fs.readFile(CONFIG.htmlFixturePath, "utf8");
    const inertHtml = fixtureHtml
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '<script type="application/x-source">$1</script>')
      .replace(/<link\b[^>]*>/gi, "")
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<img\b[^>]*>/gi, "");
    await page.setContent(inertHtml, {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
    return;
  }

  await page.goto(CONFIG.sourceUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120_000
  });

  if (CONFIG.minInitialDelayMs > 0) {
    log(`Allowing DS360 ${CONFIG.minInitialDelayMs} ms to initialise`);
    await page.waitForTimeout(CONFIG.minInitialDelayMs);
  }
}

export async function readPageConfiguration(page) {
  await page.waitForSelector("#widget-all-source", {
    timeout: CONFIG.widgetTimeoutMs
  });

  const config = await page.locator("#widget-all-source").evaluate((root) => ({
    feedVersion: root.dataset.feedVersion || "1",
    sourcePublicHorizonDays: Number(root.dataset.publicHorizonDays || 90),
    collectionTargetDays: Number(root.dataset.collectionTargetDays || 100),
    timezone: root.dataset.timezone || "Australia/Sydney"
  }));
  if (config.timezone !== "Australia/Sydney" || !Number.isInteger(config.collectionTargetDays) || config.collectionTargetDays < 1) throw new Error("Invalid page configuration");
  // The site's legacy 90/100 attributes must not override the reliability policy.
  return { ...config, publicHorizonDays: RELIABLE_HORIZON_DAYS };

}

export async function discoverSources(page) {
  const sources = await page.locator("#widget-all-source .widget-all-source").evaluateAll(
    (elements) =>
      elements.map((element) => ({
        selector: `#${element.id}`,
        source: element.dataset.source,
        role: element.dataset.sourceRole || "supplementary",
        widgetId: element.dataset.widgetId,
        category: element.dataset.category || "dive",
        productPath: element.dataset.productPath || null,
        possibleTags: (element.dataset.tags || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      }))
  );
  const names = new Set();
  const widgets = new Set();
  for (const source of sources) {
    if (!source.source || !source.widgetId || source.selector === "#" || names.has(source.source) || widgets.has(source.widgetId)) throw new Error("Missing or duplicate source identity");
    names.add(source.source); widgets.add(source.widgetId);
    if (await page.locator(`${source.selector} #widget${source.widgetId}`).count() !== 1) throw new Error(`${source.source}: expected widget ${source.widgetId} missing or duplicated`);
  }
  for (const [name, id] of Object.entries(REQUIRED_SOURCES)) {
    if (!sources.some(source => source.source === name && source.widgetId === id && source.role === "core")) throw new Error(`${name}: required core widget ${id} missing or changed`);
  }
  return sources;
}

async function rowSignature(sourceLocator) {
  return sourceLocator.locator("tr.main-row").evaluateAll((rows) =>
    rows
      .map((row) => {
        const href = row.querySelector('a[href*="?q="]')?.href || "";
        return `${row.innerText.replace(/\s+/g, " ").trim()}|${href}`;
      })
      .join("\n---\n")
  );
}

async function waitForSourceStable(page, sourceMeta, options = {}) {
  const sourceLocator = page.locator(sourceMeta.selector);
  const timeoutMs = options.timeoutMs || CONFIG.widgetTimeoutMs;
  const started = Date.now();

  await sourceLocator.waitFor({ state: "attached", timeout: timeoutMs });

  let previousSignature = null;
  let stablePolls = 0;

  while (Date.now() - started < timeoutMs) {
    const rowCount = await sourceLocator.locator("tr.main-row").count();
    const text = cleanText(await sourceLocator.innerText().catch(() => ""));
    const explicitEmpty = /no (?:records|events|data)|nothing found/i.test(text);

    if (/access denied|forbidden|failed to load|error loading|something went wrong/i.test(text)) throw new Error(`${sourceMeta.source}: widget reports an error`);
    if (rowCount > 0 || explicitEmpty) {
      const signature = rowCount ? await rowSignature(sourceLocator) : `empty:${text}`;
      const stillLoading = /loading .*calendar|please wait/i.test(text);

      if (!stillLoading && signature && signature === previousSignature) {
        stablePolls += 1;
      } else {
        stablePolls = 0;
      }

      if (stablePolls >= CONFIG.stablePollsRequired) {
        if (CONFIG.finalSettleMs > 0) {
          await page.waitForTimeout(CONFIG.finalSettleMs);
        }
        return { rowCount, explicitEmpty: rowCount === 0 && explicitEmpty };
      }

      previousSignature = signature;
    }

    await page.waitForTimeout(CONFIG.stabilityPollMs);
  }

  throw new Error(
    `${sourceMeta.source} did not become stable within ${timeoutMs} ms`
  );
}

async function extractRawRows(sourceLocator, pageNumber) {
  const table = sourceLocator.locator("table").first();
  const headers = await table.locator("thead th").evaluateAll((elements) =>
    elements.map((element) => element.textContent.replace(/\s+/g, " ").trim())
  );

  const headerIndex = new Map(
    headers.map((header, index) => [header.toLowerCase(), index])
  );

  const getIndex = (name, fallback) => headerIndex.get(name) ?? fallback;
  const indexes = {
    startDate: getIndex("start date", 1),
    endDate: getIndex("end date", 2),
    charter: getIndex("charter", 3),
    maxPlaces: getIndex("max. places", 4),
    placesAvailable: getIndex("places available", 5),
    price: getIndex("price", 6)
  };

  return table.locator("tbody tr.main-row").evaluateAll(
    (rows, payload) =>
      rows.map((row, rowIndex) => {
        const cells = [...row.querySelectorAll(":scope > td")];
        const detailRow =
          row.nextElementSibling?.classList.contains("expand-row")
            ? row.nextElementSibling
            : null;

        let detailStartText = null;
        let detailPriceText = null;
        let detailText = null;

        if (detailRow) {
          for (const paragraph of detailRow.querySelectorAll("p")) {
            const strong = paragraph.querySelector("strong");
            const label = strong?.textContent
              ?.replace(/\s+/g, " ")
              .trim()
              .toLowerCase();
            const paragraphText = paragraph.textContent
              .replace(/\s+/g, " ")
              .trim();

            if (label?.startsWith("start date")) {
              detailStartText = paragraphText.replace(/^start date:\s*/i, "");
            } else if (label?.startsWith("our price")) {
              detailPriceText = paragraphText.replace(/^our price:\s*/i, "");
            } else if (
              paragraph.matches('[style*="font-style"]') ||
              paragraph.style.fontStyle === "italic"
            ) {
              detailText = paragraphText;
            }
          }
        }

        const bookingAnchor = row.querySelector('a[href*="?q="]');
        const contactButton = row.querySelector(".contact_us_btn");

        const cellText = (index) =>
          cells[index]?.textContent?.replace(/\s+/g, " ").trim() || null;

        return {
          pageNumber: payload.pageNumber,
          rowIndex,
          startDateText: cellText(payload.indexes.startDate),
          endDateText: cellText(payload.indexes.endDate),
          charterText: cellText(payload.indexes.charter),
          maxPlacesText: cellText(payload.indexes.maxPlaces),
          placesAvailableText: cellText(payload.indexes.placesAvailable),
          priceText: cellText(payload.indexes.price),
          detailStartText,
          detailPriceText,
          detailText,
          bookingHref: bookingAnchor?.href || null,
          contactPart: contactButton?.getAttribute("data-part") || null
        };
      }),
    { indexes, pageNumber }
  );
}

async function currentPageNumber(sourceLocator) {
  const active = sourceLocator.locator(".pagination .page-item.active .page-link");
  if ((await active.count()) === 0) return 1;
  const text = cleanText(await active.first().textContent());
  const page = Number(text);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export async function paginationState(sourceLocator) {
  const metadata = await sourceLocator.evaluate(root => {
    const scripts = [...root.querySelectorAll("script")].map(script => script.textContent).join("\n");
    const pageSize = Number(root.querySelector("select.per_page")?.value);
    const links = [...root.querySelectorAll(".pagination .page-link[data-page]")].map(link => Number(link.dataset.page)).filter(n => Number.isInteger(n) && n > 0);
    return { scripts, pageSize, links, observedRows: root.querySelectorAll("tr.main-row").length };
  });
  return parsePaginationMetadata({ ...metadata, currentPage: await currentPageNumber(sourceLocator) });
}

export function parsePaginationMetadata(metadata) {
  metadata = { ...metadata,
    counts: [...metadata.scripts.matchAll(/\bvar\s+count\s*=\s*["'](\d+)["']/g)].map(match => Number(match[1])),
    declaredPages: [...metadata.scripts.matchAll(/\bvar\s+totalPages\s*=\s*parseInt\(["'](\d+)["']\)/g)].map(match => Number(match[1]))
  };
  if (!metadata.counts.length || new Set(metadata.counts).size !== 1 || !metadata.declaredPages.length || new Set(metadata.declaredPages).size !== 1) throw new Error("Source total/page metadata missing or conflicting");
  const sourceTotal = metadata.counts[0];
  // DS360 omits page-size and navigation controls when the whole result fits
  // on one page. This is verified by independent declared total/pages and the
  // exact observed row count; absence of controls alone is never sufficient.
  const completeSinglePage = !metadata.pageSize && metadata.declaredPages[0] === 1 &&
    metadata.currentPage === 1 && metadata.observedRows === sourceTotal &&
    metadata.links.every(page => page === 1);
  const pageSize = completeSinglePage ? Math.max(1, sourceTotal) : metadata.pageSize;
  if (!Number.isSafeInteger(sourceTotal) || sourceTotal < 0 || (!completeSinglePage && ![20, 50].includes(pageSize))) throw new Error("Invalid source total or page size");
  const totalPages = Math.max(1, Math.ceil(sourceTotal / pageSize));
  // Inline totalPages can retain the original page-size value after a reload.
  // It must describe a valid source layout; DOM links and exact per-page counts
  // independently verify the selected 20-row layout below.
  if (!completeSinglePage && ![Math.max(1, Math.ceil(sourceTotal / 50)), Math.max(1, Math.ceil(sourceTotal / 20))].includes(metadata.declaredPages[0])) throw new Error("Inconsistent source page total");
  if (metadata.links.some(page => page > totalPages)) throw new Error("Pagination exceeds the declared source total");
  return { sourceTotal, pageSize, totalPages, currentPage: metadata.currentPage };
}

async function ensureTwentyRowsPerPage(page, sourceMeta) {
  const root = page.locator(sourceMeta.selector);
  const select = root.locator("select.per_page").first();
  if (!(await select.count())) return;
  if (CONFIG.htmlFixturePath) return;
  if (!(await select.locator('option[value="20"]').count())) throw new Error(`${sourceMeta.source}: 20-row page option missing`);
  // Dispatch even when the displayed control already says 20: DS360's internal
  // offset may still differ. Actual row counts are verified after the reload.
  await root.evaluate((element, timeoutMs) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error("Page-size reset did not replace calendar rows")); }, timeoutMs);
    const isCalendar = node => node.nodeType === 1 && (node.matches("table, tbody, tr") || node.querySelector("table, tbody, tr"));
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === "childList" && (record.target.matches?.("table, tbody, tr") || [...record.addedNodes, ...record.removedNodes].some(isCalendar)))) {
        clearTimeout(timer); observer.disconnect(); resolve();
      }
    });
    observer.observe(element, { childList: true, subtree: true });
    const control = element.querySelector("select.per_page");
    control.value = "20";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }), CONFIG.widgetTimeoutMs);
  await waitForSourceStable(page, sourceMeta);
  const metadata = await paginationState(root);
  const rowCount = await root.locator("tr.main-row").count();
  if (metadata.currentPage !== 1 || metadata.pageSize !== 20 || rowCount !== Math.min(20, metadata.sourceTotal)) throw new Error(`${sourceMeta.source}: page-size reset did not produce a complete first page (${rowCount} rows; expected ${Math.min(20, metadata.sourceTotal)})`);

}

function rowsAreAscending(rawRows, zone) {
  const dates = rawRows
    .map((row) => parseTableDate(row.startDateText, zone))
    .filter(Boolean)
    .map((value) => value.toMillis());

  return dates.every((value, index) => index === 0 || value >= dates[index - 1]);
}

export async function clickPageAndWait(page, sourceMeta, targetPage) {
  const sourceLocator = page.locator(sourceMeta.selector);
  const before = await rowSignature(sourceLocator);
  const links = sourceLocator.locator(`.page-link[data-page="${targetPage}"]`);
  const visible = links.filter({ visible: true });
  const link = (await visible.count() ? visible : links).first();
  if ((await link.count()) === 0) throw new Error(`${sourceMeta.source}: expected page ${targetPage} link missing`);
  await link.evaluate(element => element.click());
  const started = Date.now();
  let moved = false;
  while (Date.now() - started < CONFIG.widgetTimeoutMs) {
    const after = await rowSignature(sourceLocator);
    if (await currentPageNumber(sourceLocator) === targetPage && after && after !== before) { moved = true; break; }
    await page.waitForTimeout(Math.min(500, CONFIG.stabilityPollMs));
  }
  if (!moved) throw new Error(`${sourceMeta.source}: page ${targetPage} did not load distinct rows`);
  await waitForSourceStable(page, sourceMeta);
  if (await currentPageNumber(sourceLocator) !== targetPage || await rowSignature(sourceLocator) === before) throw new Error(`${sourceMeta.source}: page ${targetPage} is unchanged or incorrectly selected`);
}

export async function scrapeSource(page, sourceMeta, pageConfig, scrapedAt) {
  const sourceLocator = page.locator(sourceMeta.selector);
  await waitForSourceStable(page, sourceMeta);
  await ensureTwentyRowsPerPage(page, sourceMeta);
  if (await currentPageNumber(sourceLocator) !== 1) await clickPageAndWait(page, sourceMeta, 1);
  const initial = await paginationState(sourceLocator);
  if (initial.totalPages > CONFIG.maxPagesPerSource) throw new Error(`${sourceMeta.source}: all ${initial.totalPages} pages exceed the ${CONFIG.maxPagesPerSource}-page safety limit`);
  const allRawRows = [];
  const pageSizes = [];
  const signatures = new Set();
  let explicitEmpty = false;
  for (let pageNumber = 1; pageNumber <= initial.totalPages; pageNumber++) {
    if (pageNumber > 1) await clickPageAndWait(page, sourceMeta, pageNumber);
    const stable = await waitForSourceStable(page, sourceMeta);
    const metadata = await paginationState(sourceLocator);
    if (metadata.currentPage !== pageNumber || metadata.sourceTotal !== initial.sourceTotal || metadata.pageSize !== initial.pageSize || metadata.totalPages !== initial.totalPages) throw new Error(`${sourceMeta.source}: source pagination changed during extraction`);
    const rawRows = await extractRawRows(sourceLocator, pageNumber);
    const expected = Math.min(initial.pageSize, Math.max(0, initial.sourceTotal - (pageNumber - 1) * initial.pageSize));
    if (rawRows.length !== expected) throw new Error(`${sourceMeta.source}: page ${pageNumber} has ${rawRows.length} rows; expected ${expected}`);
    explicitEmpty = initial.sourceTotal === 0 && stable.explicitEmpty;
    if (!initial.sourceTotal && !explicitEmpty) throw new Error(`${sourceMeta.source}: zero count without a verified empty state`);
    const signature = JSON.stringify(rawRows.map(({pageNumber, ...row}) => row));
    if (signatures.has(signature)) throw new Error(`${sourceMeta.source}: repeated page rows`);
    signatures.add(signature);
    pageSizes.push(rawRows.length);
    allRawRows.push(...rawRows);
  }
  const context = { timezone: pageConfig.timezone, sourceUrl: CONFIG.sourceUrl, scrapedAt };
  const events = allRawRows.map(row => normaliseRawEvent(row, sourceMeta, context));
  const identities = new Set();
  for (const event of events) {
    if (!event.startDate || !event.startTime || !Number.isFinite(event.price?.amount)) throw new Error(`${sourceMeta.source}: malformed date, time or price in source row ${event.id}`);
    if (event.bookable && (!event.openCartId || !event.partNumber || event.qualityWarnings.includes("booking_code_decode_failed"))) throw new Error(`${sourceMeta.source}: malformed booking identity ${event.id}`);
    if (!event.bookable && !event.contactPart) throw new Error(`${sourceMeta.source}: lost booking link without an explicit contact action`);
    if (identities.has(event.id)) throw new Error(`${sourceMeta.source}: duplicate or overlapping event ${event.id}`);
    identities.add(event.id);
  }
  const dates = events.map(event => event.startDate).sort();
  return { sourceMeta, events, summary: {
    widgetId: sourceMeta.widgetId, role: sourceMeta.role, status: "fresh",
    pagesCollected: pageSizes.length, rawEventCount: events.length,
    firstDate: dates[0] || null, lastDate: dates.at(-1) || null,
    rowsAscending: rowsAreAscending(allRawRows, pageConfig.timezone),
    ...checkedRange(scrapedAt, pageConfig.timezone),
    extraction: { complete: true, sourceTotal: initial.sourceTotal, rowCount: events.length, totalPages: initial.totalPages, pagesCollected: pageSizes.length, pageSize: initial.pageSize, pageSizes, explicitEmpty },
    coversPublicHorizon: true,
    lastSuccessfulAt: scrapedAt, warnings: []
  }};
}

function priorSourceEvents(priorState, sourceName) {
  return priorState?.sources?.[sourceName]?.events || [];
}

function priorSourceMeta(priorState, sourceName) {
  return priorState?.sources?.[sourceName]?.summary || null;
}

async function captureDiagnostics(page, reason) {
  await ensureDirectory(CONFIG.diagnosticsDir);
  const slug = new Date().toISOString().replace(/[:.]/g, "-");

  await Promise.allSettled([
    page.screenshot({
      path: path.join(CONFIG.diagnosticsDir, `widget-all-${slug}.png`),
      fullPage: true
    }),
    page
      .content()
      .then((html) =>
        fs.writeFile(
          path.join(CONFIG.diagnosticsDir, `widget-all-${slug}.html`),
          html,
          "utf8"
        )
      ),
    fs.writeFile(
      path.join(CONFIG.diagnosticsDir, `failure-${slug}.txt`),
      `${reason}\n`,
      "utf8"
    )
  ]);
}

export function validateCandidate(candidate, options) {
  return validateFeed(candidate, options);
}

export function buildFeeds(sourceResults, pageConfig, scrapedAt, { futureStartOffsetDays = 21, sourceUrl = "https://www.abyss.com.au/widget-all" } = {}) {
  const allSourceEvents = Object.values(sourceResults).flatMap(
    (result) => result.events
  );
  const deduplicated = deduplicateEvents(allSourceEvents);

  const today = DateTime.fromISO(scrapedAt).setZone(pageConfig.timezone).startOf("day");
  const futureStart = today.plus({ days: futureStartOffsetDays });
  const publicEnd = today.plus({ days: pageConfig.publicHorizonDays });
  // Retain every later listing, including seasonal events beyond day 100.
  const allFutureEvents = deduplicated.filter(event => event.startDate >= today.toISODate());
  const sourceSummaries = Object.fromEntries(
    Object.entries(sourceResults).map(([name, result]) => [name, structuredClone(result.summary)])
  );
  // Legacy consumers read generatedAt only. Keep it at the oldest retained
  // successful check so a rebuilt envelope can never renew cached data's age.
  const retainedChecks = Object.values(sourceSummaries).filter(source => source.status !== "failed")
    .map(source => DateTime.fromISO(source.lastSuccessfulAt || "")).filter(time => time.isValid);
  const generatedAt = retainedChecks.length ? DateTime.min(...retainedChecks).toUTC().toISO() : null;
  const publicSearchThrough = reliableSearchThrough(sourceSummaries, publicEnd.toISODate());
  const publicFeedEvents = deduplicated.filter(event => event.bookable && event.startDate >= futureStart.toISODate())
    .map(event => ({ ...event, beyondReliableHorizon: event.startDate > publicSearchThrough }));
  for (const source of Object.values(sourceSummaries)) {
    source.coversPublicHorizon = Boolean(source.extraction?.complete && source.checkedThrough >= publicEnd.toISODate());
  }

  const publicFeed = {
    schemaVersion: SCHEMA_VERSION,
    feedVersion: pageConfig.feedVersion,
    sourcePage: sourceUrl,
    generatedAt,
    assembledAt: scrapedAt,
    timezone: pageConfig.timezone,
    futureStartOffsetDays: futureStartOffsetDays,
    publicHorizonDays: pageConfig.publicHorizonDays,
    collectionTargetDays: pageConfig.collectionTargetDays,
    window: {
      startsOn: futureStart.toFormat("yyyy-LL-dd"),
      publicSearchThrough,
      publicTargetThrough: publicEnd.toFormat("yyyy-LL-dd"),
      latestListedDate: publicFeedEvents.at(-1)?.startDate || null,
      collectedThrough: allFutureEvents.at(-1)?.startDate || null
    },
    customerNotice:
      `Schedule checked for reliable planning through ${publicSearchThrough}, not guaranteed availability. Later listed dates can change. Confirm dates, availability and final prices when booking.`,
    sources: sourceSummaries,
    eventCount: publicFeedEvents.length,
    events: publicFeedEvents
  };

  const allWidgetFeed = {
    schemaVersion: SCHEMA_VERSION,
    sourcePage: sourceUrl,
    generatedAt,
    assembledAt: scrapedAt,
    timezone: pageConfig.timezone,
    sources: sourceSummaries,
    rawSourceEventCount: allSourceEvents.length,
    deduplicatedEventCount: deduplicated.length,
    eventCountWithinCollectionWindow: allFutureEvents.length,
    collectionMode: "all-listed-pages",
    events: allFutureEvents
  };
  return { publicFeed, allWidgetFeed, allSourceEvents, deduplicated, publicSearchThrough, publicFeedEvents };
}

export async function main() {
  await ensureDirectory(CONFIG.outputDir);
  await ensureDirectory(CONFIG.diagnosticsDir);

  const priorStatePath = path.join(CONFIG.outputDir, "scrape-state.json");
  const priorState = await readJsonIfPresent(priorStatePath);
  const scrapedAt = new Date().toISOString();

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    executablePath: CONFIG.chromiumExecutablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
    userAgent:
      "AbyssFutureDiveFeed/1.0 (+https://www.abyss.com.au/widget-all)"
  });

  const page = await context.newPage();
  const browserMessages = [];

  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) {
      browserMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const resourceType = request.resourceType();
    if (!["image", "font", "media"].includes(resourceType)) {
      browserMessages.push(
        `requestfailed: ${request.url()} — ${request.failure()?.errorText || "unknown"}`
      );
    }
  });

  if (!CONFIG.htmlFixturePath) {
    await page.route("**/*", async (route) => {
      if (["image", "font", "media"].includes(route.request().resourceType())) {
        await route.abort();
      } else {
        await route.continue();
      }
    });
  }

  try {
    log(`Loading ${CONFIG.htmlFixturePath || CONFIG.sourceUrl}`);
    await loadPage(page);

    const pageConfig = await readPageConfiguration(page);
    const sources = await discoverSources(page);
    if (!sources.length) throw new Error("No .widget-all-source elements found");

    log(`Discovered ${sources.length} sources`, sources.map((s) => s.source));

    const sourceResults = {};
    const fatalFailures = [];

    for (const sourceMeta of sources) {
      try {
        log(`Scraping ${sourceMeta.source} (widget ${sourceMeta.widgetId})`);
        sourceResults[sourceMeta.source] = await scrapeSource(
          page,
          sourceMeta,
          pageConfig,
          scrapedAt
        );
      } catch (error) {
        log(`${sourceMeta.source} failed: ${error.message}`);
        const previousEvents = priorSourceEvents(priorState, sourceMeta.source);
        const previousSummary = priorSourceMeta(priorState, sourceMeta.source);
        const canUsePrevious =
          canReuseSource(previousSummary, previousEvents, DateTime.fromISO(scrapedAt), CONFIG.maxStaleHours, sourceMeta);

        if (canUsePrevious) {
          sourceResults[sourceMeta.source] = {
            sourceMeta,
            events: previousEvents,
            summary: {
              ...previousSummary,
              widgetId: sourceMeta.widgetId,
              role: sourceMeta.role,
              status: "stale",
              staleReason: error.message,
              warnings: [
                ...(previousSummary?.warnings || []),
                `Current scrape failed; retained last-known-good data: ${error.message}`
              ]
            }
          };
        } else if (sourceMeta.role === "core") {
          fatalFailures.push(`${sourceMeta.source}: ${error.message}`);
        } else {
          sourceResults[sourceMeta.source] = {
            sourceMeta,
            events: [],
            summary: {
              widgetId: sourceMeta.widgetId,
              role: sourceMeta.role,
              status: "failed",
              pagesCollected: 0,
              rawEventCount: 0,
              firstDate: null,
              lastDate: null,
              checkedFrom: null,
              checkedThrough: null,
              extraction: { complete: false },
              coversPublicHorizon: false,
              lastSuccessfulAt: previousSummary?.lastSuccessfulAt || null,
              warnings: [error.message]
            }
          };
        }
      }
    }

    if (fatalFailures.length) {
      throw new Error(`Core source failure: ${fatalFailures.join("; ")}`);
    }

    const { publicFeed, allWidgetFeed, allSourceEvents, deduplicated, publicSearchThrough, publicFeedEvents } = buildFeeds(sourceResults, pageConfig, scrapedAt, { futureStartOffsetDays: CONFIG.futureStartOffsetDays, sourceUrl: CONFIG.sourceUrl });

    const candidateValidation = validateCandidate(publicFeed);
    const validationReport = {
      ...candidateValidation,
      generatedAt: scrapedAt,
      sourcePage: CONFIG.sourceUrl,
      browserMessages: browserMessages.slice(-100),
      counts: {
        sourceEvents: allSourceEvents.length,
        deduplicatedEvents: deduplicated.length,
        publicFeedEvents: publicFeedEvents.length
      }
    };

    await writeJsonAtomic(
      path.join(CONFIG.diagnosticsDir, "candidate-future-dives.json"),
      publicFeed
    );
    await writeJsonAtomic(
      path.join(CONFIG.diagnosticsDir, "candidate-validation-report.json"),
      validationReport
    );

    if (!candidateValidation.valid) {
      throw new Error(
        `Candidate feed failed validation: ${candidateValidation.errors.join("; ")}`
      );
    }

    const nextState = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: scrapedAt,
      sources: Object.fromEntries(
        Object.entries(sourceResults).map(([name, result]) => [
          name,
          { summary: result.summary, events: result.events }
        ])
      )
    };

    await Promise.all([
      writeJsonAtomic(path.join(CONFIG.outputDir, "future-dives.json"), publicFeed),
      writeJsonAtomic(
        path.join(CONFIG.outputDir, "all-widget-events.json"),
        allWidgetFeed
      ),
      writeJsonAtomic(
        path.join(CONFIG.outputDir, "validation-report.json"),
        validationReport
      ),
      writeJsonAtomic(priorStatePath, nextState)
    ]);

    log(
      `Published ${publicFeedEvents.length} future events (${allSourceEvents.length} raw, ${deduplicated.length} deduplicated)`
    );
    log(`Public search coverage ends ${publicSearchThrough}`);
  } catch (error) {
    await captureDiagnostics(page, error.stack || error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
