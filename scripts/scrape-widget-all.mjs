#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { DateTime } from "luxon";
import { cleanText, parseTableDate, todayInZone } from "../src/dates.mjs";
import { normaliseRawEvent } from "../src/normalise-event.mjs";
import {
  deduplicateEvents,
  filterEventsByDate,
  minimumCoreCoverageDate
} from "../src/feed-utils.mjs";

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
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
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

async function readPageConfiguration(page) {
  await page.waitForSelector("#widget-all-source", {
    timeout: CONFIG.widgetTimeoutMs
  });

  return page.locator("#widget-all-source").evaluate((root) => ({
    feedVersion: root.dataset.feedVersion || "1",
    publicHorizonDays: Number(root.dataset.publicHorizonDays || 90),
    collectionTargetDays: Number(root.dataset.collectionTargetDays || 100),
    timezone: root.dataset.timezone || "Australia/Sydney"
  }));
}

async function discoverSources(page) {
  return page.locator("#widget-all-source .widget-all-source").evaluateAll(
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

    if (rowCount === 0 && explicitEmpty) {
      return { rowCount: 0, explicitEmpty: true };
    }

    if (rowCount > 0) {
      const signature = await rowSignature(sourceLocator);
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
        return { rowCount, explicitEmpty: false };
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

async function paginationState(sourceLocator) {
  const pageNumbers = await sourceLocator
    .locator(".pagination .page-link[data-page]")
    .evaluateAll((links) =>
      links
        .map((link) => Number(link.getAttribute("data-page")))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
    .catch(() => []);

  return {
    currentPage: await currentPageNumber(sourceLocator),
    totalPages: pageNumbers.length ? Math.max(...pageNumbers) : 1
  };
}

async function waitForCalendarAjax(page) {
  return page
    .waitForResponse(
      (response) =>
        response.url().includes("/calendar/ajax_list") &&
        response.request().method() === "POST",
      { timeout: Math.min(CONFIG.widgetTimeoutMs, 60_000) }
    )
    .catch(() => null);
}

async function ensureFiftyRowsPerPage(page, sourceMeta) {
  if (CONFIG.htmlFixturePath) return;

  const sourceLocator = page.locator(sourceMeta.selector);
  const select = sourceLocator.locator("select.per_page").first();
  if ((await select.count()) === 0) return;

  const hasFifty = await select
    .locator('option[value="50"]')
    .count()
    .then((count) => count > 0);
  if (!hasFifty) return;

  log(`${sourceMeta.source}: resetting page size to 50 before pagination`);
  const responsePromise = waitForCalendarAjax(page);

  await select.evaluate((element) => {
    element.value = "50";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const response = await responsePromise;
  if (response && !response.ok()) {
    throw new Error(
      `${sourceMeta.source}: page-size reload returned HTTP ${response.status()}`
    );
  }

  await waitForSourceStable(page, sourceMeta);
}

function rowsAreAscending(rawRows, zone) {
  const dates = rawRows
    .map((row) => parseTableDate(row.startDateText, zone))
    .filter(Boolean)
    .map((value) => value.toMillis());

  return dates.every((value, index) => index === 0 || value >= dates[index - 1]);
}

function latestRawDate(rawRows, zone) {
  const parsed = rawRows
    .map((row) => parseTableDate(row.startDateText, zone))
    .filter(Boolean)
    .sort((a, b) => a.toMillis() - b.toMillis());
  return parsed.length ? parsed[parsed.length - 1] : null;
}

async function clickPageAndWait(page, sourceMeta, targetPage) {
  const sourceLocator = page.locator(sourceMeta.selector);
  const before = await rowSignature(sourceLocator);
  const link = sourceLocator.locator(`.page-link[data-page="${targetPage}"]`).first();
  if ((await link.count()) === 0) return false;

  const responsePromise = waitForCalendarAjax(page);
  await link.click({ timeout: 30_000 });
  const response = await responsePromise;

  if (response && !response.ok()) {
    throw new Error(
      `${sourceMeta.source}: page ${targetPage} returned HTTP ${response.status()}`
    );
  }

  const started = Date.now();
  while (Date.now() - started < CONFIG.widgetTimeoutMs) {
    const after = await rowSignature(sourceLocator).catch(() => "");
    if (after && after !== before) break;
    await page.waitForTimeout(500);
  }

  await waitForSourceStable(page, sourceMeta);
  return true;
}

async function scrapeSource(page, sourceMeta, pageConfig, scrapedAt) {
  const sourceLocator = page.locator(sourceMeta.selector);
  await waitForSourceStable(page, sourceMeta);

  let pagesCollected = 0;
  let allRawRows = [];
  let pageNumber = await currentPageNumber(sourceLocator);
  let rawRows = await extractRawRows(sourceLocator, pageNumber);
  pagesCollected += 1;
  allRawRows.push(...rawRows);

  const today = todayInZone(pageConfig.timezone);
  const collectionTarget = today.plus({ days: pageConfig.collectionTargetDays });
  let latest = latestRawDate(rawRows, pageConfig.timezone);
  let ascending = rowsAreAscending(rawRows, pageConfig.timezone);
  let pagination = await paginationState(sourceLocator);

  const shouldContinue = () => {
    if (pagesCollected >= CONFIG.maxPagesPerSource) return false;
    if (pageNumber >= pagination.totalPages) return false;
    if (!ascending) return true;
    return !latest || latest.toMillis() < collectionTarget.toMillis();
  };

  if (shouldContinue()) {
    await ensureFiftyRowsPerPage(page, sourceMeta);

    pageNumber = 1;
    rawRows = await extractRawRows(sourceLocator, pageNumber);
    pagesCollected = 1;
    allRawRows = [...rawRows];
    latest = latestRawDate(rawRows, pageConfig.timezone);
    ascending = rowsAreAscending(rawRows, pageConfig.timezone);
    pagination = await paginationState(sourceLocator);
  }

  while (shouldContinue()) {
    const nextPage = pageNumber + 1;
    log(`${sourceMeta.source}: collecting page ${nextPage}`);
    const moved = await clickPageAndWait(page, sourceMeta, nextPage);
    if (!moved) break;

    pageNumber = nextPage;
    rawRows = await extractRawRows(sourceLocator, pageNumber);
    pagesCollected += 1;
    allRawRows.push(...rawRows);
    latest = latestRawDate(allRawRows, pageConfig.timezone);
    pagination = await paginationState(sourceLocator);
  }

  const context = {
    timezone: pageConfig.timezone,
    sourceUrl: CONFIG.sourceUrl,
    scrapedAt
  };
  const events = allRawRows.map((row) =>
    normaliseRawEvent(row, sourceMeta, context)
  );

  const validDates = events
    .map((event) => event.startDate)
    .filter(Boolean)
    .sort();

  const firstDate = validDates[0] || null;
  const lastDate = validDates[validDates.length - 1] || null;
  const publicTarget = today.plus({ days: pageConfig.publicHorizonDays });

  return {
    sourceMeta,
    events,
    summary: {
      widgetId: sourceMeta.widgetId,
      role: sourceMeta.role,
      status: "fresh",
      pagesCollected,
      rawEventCount: events.length,
      firstDate,
      lastDate,
      rowsAscending: ascending,
      coversPublicHorizon: Boolean(
        lastDate && DateTime.fromISO(lastDate, { zone: pageConfig.timezone }).toMillis() >= publicTarget.toMillis()
      ),
      coversCollectionTarget: Boolean(
        lastDate && DateTime.fromISO(lastDate, { zone: pageConfig.timezone }).toMillis() >= collectionTarget.toMillis()
      ),
      lastSuccessfulAt: scrapedAt,
      warnings: []
    }
  };
}

function priorSourceEvents(priorState, sourceName) {
  return priorState?.sources?.[sourceName]?.events || [];
}

function priorSourceMeta(priorState, sourceName) {
  return priorState?.sources?.[sourceName]?.summary || null;
}

function hoursOld(isoTimestamp) {
  const parsed = DateTime.fromISO(String(isoTimestamp || ""));
  if (!parsed.isValid) return Number.POSITIVE_INFINITY;
  return DateTime.utc().diff(parsed.toUTC(), "hours").hours;
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

function validateCandidate(candidate) {
  const errors = [];
  const warnings = [];

  const coreSources = Object.entries(candidate.sources).filter(
    ([, source]) => source.role === "core"
  );

  if (!coreSources.length) errors.push("No core sources were discovered");

  for (const [sourceName, source] of coreSources) {
    if (!source.lastDate) errors.push(`${sourceName}: no valid event dates`);
    if (!source.coversPublicHorizon) {
      errors.push(
        `${sourceName}: does not cover the ${candidate.publicHorizonDays}-day public horizon`
      );
    }
    if (!source.coversCollectionTarget) {
      warnings.push(
        `${sourceName}: does not reach the ${candidate.collectionTargetDays}-day collection target`
      );
    }
  }

  const ids = new Set();
  for (const event of candidate.events) {
    if (!event.id) errors.push("An event has no ID");
    if (ids.has(event.id)) errors.push(`Duplicate event ID after merge: ${event.id}`);
    ids.add(event.id);

    if (!event.startDate) errors.push(`${event.id}: invalid start date`);
    if (event.price?.amount == null) errors.push(`${event.id}: missing price`);
    if (!event.bookingUrl || !event.bookingCode) {
      errors.push(`${event.id}: missing exact DS360 booking URL/code`);
    }
    if (!event.openCartId) warnings.push(`${event.id}: q code has no open_cart_id`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function main() {
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
          previousEvents.length > 0 &&
          hoursOld(previousSummary?.lastSuccessfulAt) <= CONFIG.maxStaleHours;

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
              coversPublicHorizon: false,
              coversCollectionTarget: false,
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

    const allSourceEvents = Object.values(sourceResults).flatMap(
      (result) => result.events
    );
    const deduplicated = deduplicateEvents(allSourceEvents);

    const today = todayInZone(pageConfig.timezone);
    const futureStart = today.plus({ days: CONFIG.futureStartOffsetDays });
    const publicEnd = today.plus({ days: pageConfig.publicHorizonDays });
    const collectionEnd = today.plus({ days: pageConfig.collectionTargetDays });

    const allFutureEvents = filterEventsByDate(
      deduplicated,
      today,
      collectionEnd,
      pageConfig.timezone
    );
    const publicFeedEvents = filterEventsByDate(
      deduplicated.filter((event) => event.bookable),
      futureStart,
      publicEnd,
      pageConfig.timezone
    );

    const sourceSummaries = Object.fromEntries(
      Object.entries(sourceResults).map(([name, result]) => [name, result.summary])
    );
    const minimumCoverage = minimumCoreCoverageDate(sourceSummaries);
    const publicSearchThrough = minimumCoverage
      ? DateTime.min(
          publicEnd,
          DateTime.fromISO(minimumCoverage, { zone: pageConfig.timezone })
        ).toFormat(
          "yyyy-LL-dd"
        )
      : null;

    const publicFeed = {
      schemaVersion: "1.0.0",
      feedVersion: pageConfig.feedVersion,
      sourcePage: CONFIG.sourceUrl,
      generatedAt: scrapedAt,
      timezone: pageConfig.timezone,
      futureStartOffsetDays: CONFIG.futureStartOffsetDays,
      publicHorizonDays: pageConfig.publicHorizonDays,
      collectionTargetDays: pageConfig.collectionTargetDays,
      window: {
        startsOn: futureStart.toFormat("yyyy-LL-dd"),
        publicSearchThrough,
        publicTargetThrough: publicEnd.toFormat("yyyy-LL-dd"),
        collectedThrough: collectionEnd.toFormat("yyyy-LL-dd")
      },
      customerNotice:
        "Scheduled from a twice-daily future schedule snapshot. Live availability and final prices are confirmed when booking.",
      sources: sourceSummaries,
      eventCount: publicFeedEvents.length,
      events: publicFeedEvents
    };

    const allWidgetFeed = {
      schemaVersion: "1.0.0",
      sourcePage: CONFIG.sourceUrl,
      generatedAt: scrapedAt,
      timezone: pageConfig.timezone,
      sources: sourceSummaries,
      rawSourceEventCount: allSourceEvents.length,
      deduplicatedEventCount: deduplicated.length,
      eventCountWithinCollectionWindow: allFutureEvents.length,
      events: allFutureEvents
    };

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
      schemaVersion: "1.0.0",
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

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
