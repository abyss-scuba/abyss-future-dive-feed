#!/usr/bin/env node
import { updateCalendarGuides } from "../src/calendar-guide-updates.mjs";

const dryRun = process.env.DRY_RUN !== "false";

try {
  const result = await updateCalendarGuides(
    process.env.HELP_SCOUT_DOCS_API_KEY,
    process.env.HELP_SCOUT_ARTICLE_ID,
    fetch,
    { dryRun }
  );
  console.log(`${dryRun ? "DRY_RUN=true" : "PUBLISHED"}: ${result.articles.filter((item) => item.change === "update").length} of ${result.articles.length} calendar guides ${dryRun ? "would change" : "changed"}`);
  for (const item of result.articles) console.log(`${item.change}: ${item.title}`);
} catch (error) {
  console.error(`Calendar guide update failed: ${error.message}`);
  process.exitCode = 1;
}
