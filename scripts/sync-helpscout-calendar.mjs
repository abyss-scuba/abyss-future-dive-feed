#!/usr/bin/env node
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { DateTime } from "luxon";
import { SOURCES, ZONE, buildSnapshot, renderArticle, updateHelpScoutArticle } from "../src/helpscout-calendar.mjs";

const SOURCE_URL = "https://www.abyss.com.au/beacon";
const TIMEOUT = 90_000;
const MAX_PAGES = 10;
const DRY_RUN = process.env.DRY_RUN === "true";

async function signature(root) {
  return root.locator("tr.main-row").evaluateAll((rows) => rows.map((r) =>
    `${r.textContent.replace(/\s+/g, " ").trim()}|${r.querySelector('a[href*="?q="]')?.href || ""}`
  ).join("\n"));
}

async function waitForStable(page, root, source) {
  const start = Date.now();
  let previous = "";
  let stable = 0;
  while (Date.now() - start < TIMEOUT) {
    const rows = await root.locator("tr.main-row").count();
    const text = await root.innerText().catch(() => "");
    if (rows === 0 && source.kind === "trip" && /no (?:records|events|data)|nothing found/i.test(text)) return;
    const current = rows > 0 ? await signature(root) : "";
    if (current && current === previous && !/loading .*calendar|please wait/i.test(text)) stable++;
    else stable = 0;
    if (stable >= 3) return;
    previous = current;
    await page.waitForTimeout(750);
  }
  throw new Error(`${source.label}: widget never produced stable rows`);
}

async function waitForAjax(page, label, action) {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/calendar/ajax_list") && response.request().method() === "POST", { timeout: 45_000 });
  // If the action itself fails, closing the browser also rejects this pending
  // response wait. Handle that rejection so the original error is preserved.
  responsePromise.catch(() => {});
  try {
    await action();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`calendar returned HTTP ${response.status()}`);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`, { cause: error });
  }
}

async function extractRows(root) {
  return root.locator("table tbody tr.main-row").evaluateAll((rows) => rows.map((row) => {
    const cells = [...row.querySelectorAll(":scope > td")];
    const detail = row.nextElementSibling?.classList.contains("expand-row") ? row.nextElementSibling : null;
    const paragraphs = [...(detail?.querySelectorAll("p") || [])];
    const detailStart = paragraphs.find((p) => /^start date:/i.test(p.textContent.trim()))?.textContent.replace(/^\s*start date:\s*/i, "") || "";
    const detailText = paragraphs.find((p) => p.style.fontStyle === "italic")?.textContent || "";
    return {
      startDate: cells[1]?.textContent.trim() || "",
      endDate: cells[2]?.textContent.trim() || "",
      label: cells[3]?.textContent.trim() || "",
      detailStart,
      detailText,
      bookingUrl: row.querySelector('a[href*="?q="]')?.href || ""
    };
  }));
}

async function currentPage(root) {
  const active = root.locator(".pagination .page-item.active .page-link");
  if (await active.count() === 0) return 1;
  const selected = await active.first().textContent();
  return Number(selected.trim()) || 1;
}

async function goToPage(page, root, source, number) {
  const before = await signature(root);
  const link = root.locator(`.pagination .page-link[data-page="${number}"]`).first();
  if (await link.count() === 0) throw new Error(`${source.label}: page ${number} link missing`);
  console.log(`${source.label}: loading page ${number}`);
  // The widget sometimes renders a page link before Playwright considers it
  // actionable. Its own pagination handler listens for DOM click events.
  await waitForAjax(page, `${source.label}: page ${number}`, () => link.evaluate((element) => element.click()));
  await page.waitForFunction(({ selector, expected }) => {
    const root = document.querySelector(selector);
    return Number(root?.querySelector(".pagination .page-item.active .page-link")?.textContent.trim()) === expected;
  }, { selector: `#widget${source.id}`, expected: number }, { timeout: TIMEOUT });
  await waitForStable(page, root, source);
  if (before === await signature(root)) throw new Error(`${source.label}: page ${number} repeated the previous rows`);
}

async function scrapeSource(page, source) {
  const root = page.locator(`#widget${source.id}`);
  console.log(`${source.label}: waiting for widget ${source.id}`);
  await root.waitFor({ state: "attached", timeout: TIMEOUT });
  await waitForStable(page, root, source);
  const pageSize = root.locator("select.per_page").first();
  // The live charter widget repeats its first rows on page 2 at 50/page.
  // Its 20/page navigation returns distinct, sequential pages.
  if (await pageSize.count() && await pageSize.inputValue() !== "20") {
    console.log(`${source.label}: changing page size to 20`);
    await waitForAjax(page, `${source.label}: set 20 rows per page`, () => pageSize.evaluate((element) => {
      if (![...element.options].some((option) => option.value === "20")) {
        throw new Error("20-row option missing");
      }
      element.value = "20";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    await waitForStable(page, root, source);
  }
  if (await currentPage(root) !== 1) await goToPage(page, root, source, 1);
  const rows = await extractRows(root);
  let total = 1;
  for (let number = 2; number <= MAX_PAGES; number++) {
    if (await root.locator(`.pagination .page-link[data-page="${number}"]`).count() === 0) break;
    await goToPage(page, root, source, number);
    rows.push(...await extractRows(root));
    total = number;
  }
  if (await root.locator(`.pagination .page-link[data-page="${total + 1}"]`).count()) {
    throw new Error(`${source.label}: more than ${MAX_PAGES} pages; article was left unchanged`);
  }
  if (source.kind !== "trip" && rows.length === 0) throw new Error(`${source.label}: no event rows`);
  const seen = new Map();
  const unique = [];
  for (const row of rows) {
    const previous = row.bookingUrl && seen.get(row.bookingUrl);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(row)) {
        throw new Error(`${source.label}: conflicting rows share an event link; article was left unchanged`);
      }
      continue;
    }
    if (row.bookingUrl) seen.set(row.bookingUrl, row);
    unique.push(row);
  }
  console.log(`${source.label}: ${unique.length} unique rows across ${total} page(s), ${rows.length - unique.length} identical boundary duplicate(s)`);
  return unique;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-AU", timezoneId: ZONE });
    const page = await context.newPage();
    await page.route("**/*", (route) => ["image", "font", "media"].includes(route.request().resourceType()) ? route.abort() : route.continue());
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const raw = {};
    for (const source of SOURCES) raw[source.id] = await scrapeSource(page, source);
    const snapshot = buildSnapshot(raw, DateTime.now().setZone(ZONE));
    console.log(`Validated ${snapshot.events.length} events; omitted ${snapshot.excluded.length} inconsistent rows`);
    await fs.mkdir("diagnostics", { recursive: true });
    await fs.writeFile("diagnostics/helpscout-calendar-candidate.html", renderArticle(snapshot));
    await fs.writeFile("diagnostics/helpscout-calendar-summary.json", JSON.stringify({
      checkedAt: snapshot.checkedAt.toISO(), eventCount: snapshot.events.length,
      firstDate: snapshot.events[0].startDate, lastDate: snapshot.events.at(-1).startDate,
      omitted: snapshot.excluded
    }, null, 2));
    if (DRY_RUN) {
      console.log("DRY_RUN=true: candidate built; Help Scout article was left unchanged");
      return;
    }
    const result = await updateHelpScoutArticle(snapshot, process.env.HELP_SCOUT_DOCS_API_KEY);
    console.log(`Help Scout article ${result.status}; ${result.count} events`);
    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/helpscout-calendar-sync-status.json", `${JSON.stringify({
      checkedOn: snapshot.checkedAt.toISODate(),
      eventCount: snapshot.events.length,
      firstDate: snapshot.events[0].startDate,
      lastDate: snapshot.events.at(-1).startDate,
      result: "verified"
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Calendar article sync failed: ${error.message}`);
  process.exitCode = 1;
});
