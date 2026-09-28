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

async function waitForAjax(page, action) {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/calendar/ajax_list") && response.request().method() === "POST", { timeout: 45_000 });
  await action();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`Calendar pagination returned HTTP ${response.status()}`);
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
  const selected = await root.locator(".pagination .page-item.active .page-link").first().textContent().catch(() => "1");
  return Number(selected.trim()) || 1;
}

async function pages(root) {
  const nav = await root.locator(".pagination .page-link").allTextContents();
  if (nav.some((n) => n.trim() === ">>")) throw new Error("Pagination has more pages than its numbered links expose");
  const numbered = nav.map((n) => Number(n.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return Math.max(1, ...numbered);
}

async function goToPage(page, root, source, number) {
  const before = await signature(root);
  const link = root.locator(`.pagination .page-link[data-page="${number}"]`)
    .filter({ hasText: new RegExp(`^\\s*${number}\\s*$`) }).first();
  if (await link.count() !== 1) throw new Error(`${source.label}: page ${number} link missing`);
  await waitForAjax(page, () => link.click());
  await page.waitForFunction(({ selector, expected }) => {
    const root = document.querySelector(selector);
    return Number(root?.querySelector(".pagination .page-item.active .page-link")?.textContent.trim()) === expected;
  }, { selector: `#widget${source.id}`, expected: number }, { timeout: TIMEOUT });
  await waitForStable(page, root, source);
  if (before === await signature(root)) throw new Error(`${source.label}: page ${number} repeated the previous rows`);
}

async function scrapeSource(page, source) {
  const root = page.locator(`#widget${source.id}`);
  await root.waitFor({ state: "attached", timeout: TIMEOUT });
  await waitForStable(page, root, source);
  const pageSize = root.locator("select.per_page").first();
  if (await pageSize.count() && await pageSize.inputValue() !== "50") {
    await waitForAjax(page, () => pageSize.selectOption("50"));
    await waitForStable(page, root, source);
  }
  if (await currentPage(root) !== 1) await goToPage(page, root, source, 1);
  const total = await pages(root);
  if (total > MAX_PAGES) throw new Error(`${source.label}: ${total} pages exceed safety limit`);
  const rows = await extractRows(root);
  for (let number = 2; number <= total; number++) {
    await goToPage(page, root, source, number);
    rows.push(...await extractRows(root));
  }
  if (source.kind !== "trip" && rows.length === 0) throw new Error(`${source.label}: no event rows`);
  const urls = rows.map((r) => r.bookingUrl).filter(Boolean);
  if (urls.length !== new Set(urls).size) throw new Error(`${source.label}: duplicate event links across pages`);
  console.log(`${source.label}: ${rows.length} rows across ${total} page(s)`);
  return rows;
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
