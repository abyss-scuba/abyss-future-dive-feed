#!/usr/bin/env node
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { DateTime } from "luxon";
import { deduplicateWidgetRows } from "../src/helpscout-calendar.mjs";
import { SOURCE_URL, SOURCE, ZONE, boatTarget, buildBoatSnapshot, renderBoatArticle, updateBoatArticle } from "../src/helpscout-boat.mjs";
const TIMEOUT = 90_000;
const MAX_PAGES = 10;
const DRY_RUN = process.env.DRY_RUN !== "false";
const SOURCE_ONLY = process.env.SOURCE_ONLY === "true";

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
  const links = root.locator(`.pagination .page-link[data-page="${number}"]`);
  const visible = links.filter({ visible: true });
  const link = await visible.count() ? visible.first() : links.first();
  if (await link.count() === 0) throw new Error(`${source.label}: page ${number} link missing`);
  console.log(`${source.label}: loading page ${number}`);
  await link.evaluate((element) => element.click());
  // The calendar may update from a cache, a GET or a POST. Verify the visible
  // result instead of depending on a particular request URL or method.
  const started = Date.now();
  let observedPage = 1;
  let observedRows = 0;
  while (Date.now() - started < 45_000) {
    observedPage = await currentPage(root);
    const after = await signature(root);
    observedRows = after ? after.split("\n").length : 0;
    if (observedPage === number && after && after !== before) break;
    await page.waitForTimeout(500);
  }
  if (observedPage !== number || before === await signature(root)) {
    throw new Error(`${source.label}: page ${number} did not load (selected page ${observedPage}, ${observedRows} rows)`);
  }
  await waitForStable(page, root, source);
  if (before === await signature(root)) throw new Error(`${source.label}: page ${number} repeated the previous rows`);
}

async function scrapeSource(page, source) {
  const root = page.locator(`#widget${source.id}`);
  console.log(`${source.label}: waiting for widget ${source.id}`);
  await root.waitFor({ state: "attached", timeout: TIMEOUT });
  await waitForStable(page, root, source);
  const pageSize = root.locator("select.per_page").first();
  // The DS360 charter widget has repeated rows on page 2 at 50/page.
  // Its 20/page navigation returns distinct, sequential pages.
  if (await pageSize.count() && await pageSize.inputValue() !== "20") {
    console.log(`${source.label}: changing page size to 20`);
    await pageSize.evaluate((element) => {
      if (![...element.options].some((option) => option.value === "20")) {
        throw new Error("20-row option missing");
      }
      element.value = "20";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(({ selector, allowEmpty }) => {
      const root = document.querySelector(selector);
      const count = root?.querySelectorAll("tr.main-row").length || 0;
      return count <= 20 && (count > 0 || allowEmpty);
    }, { selector: `#widget${source.id}`, allowEmpty: source.kind === "trip" }, { timeout: 45_000 });
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
  const result = deduplicateWidgetRows(rows, source);
  console.log(`${source.label}: ${result.rows.length} unique rows across ${total} page(s), ${result.identicalDuplicates} matching duplicate(s), ${result.excluded.length} conflicting row(s) omitted`);
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-AU", timezoneId: ZONE });
    page = await context.newPage();
    await page.route("**/*", route => ["image", "font", "media"].includes(route.request().resourceType()) ? route.abort() : route.continue());
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(10_000);
    const result = await scrapeSource(page, SOURCE);
    if (result.excluded.length) throw new Error("Conflicting boat source rows; article left unchanged");
    const snapshot = buildBoatSnapshot(result.rows, DateTime.now().setZone(ZONE));
    await fs.mkdir("diagnostics", { recursive: true });
    await fs.writeFile("diagnostics/helpscout-boat-candidate.html", renderBoatArticle(snapshot));
    const summary = {
      checkedAt: snapshot.checkedAt.toISO(), eventCount: snapshot.events.length,
      technicalCount: snapshot.events.filter(e => e.category === "Technical boat dive").length,
      sealCount: snapshot.events.filter(e => /seal/i.test(e.category)).length,
      unguidedCount: snapshot.events.filter(e => e.unguided).length,
      firstDate: snapshot.events[0].startDate, lastDate: snapshot.events.at(-1).startDate,
      dryRun: DRY_RUN, sourceOnly: SOURCE_ONLY
    };
    await fs.writeFile("diagnostics/helpscout-boat-summary.json", JSON.stringify(summary, null, 2));
    if (SOURCE_ONLY) {
      console.log(`Boat source-only check: ${summary.eventCount} validated events, ${summary.firstDate} through ${summary.lastDate}; no Help Scout request`);
      return;
    }
    const target = boatTarget(JSON.parse(await fs.readFile("data/helpscout-boat-target.json", "utf8")));
    const publication = await updateBoatArticle(snapshot, process.env.HELP_SCOUT_DOCS_API_KEY, fetch, { dryRun: DRY_RUN, target });
    summary.publication = publication;
    await fs.writeFile("diagnostics/helpscout-boat-summary.json", JSON.stringify(summary, null, 2));
    if (!DRY_RUN) {
      await fs.mkdir("data", { recursive: true });
      await fs.writeFile("data/helpscout-boat-sync-status.json", `${JSON.stringify(summary, null, 2)}\n`);
    }
    const message = `Boat snapshot ${publication.status}: ${publication.count} validated events, ${summary.technicalCount} technical, ${summary.sealCount} seal and ${summary.unguidedCount} explicitly unguided; ${summary.firstDate} through ${summary.lastDate}.`;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n\nChecked ${summary.checkedAt}. Daily schedule: 01:00 and 01:37 Australia/Sydney.\n`);
  } catch (error) {
    await fs.mkdir("diagnostics", { recursive: true });
    await fs.writeFile("diagnostics/helpscout-boat-error.txt", `${error.message}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(`Boat snapshot sync failed: ${error.message}`); process.exitCode = 1; });
