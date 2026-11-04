import { validateFeed } from "../scripts/validate-feed.mjs";
import { freshnessError, REQUIRED_SOURCES } from "./feed-coverage.mjs";

export function evaluateWebsiteFeed(feed, now) {
  if (!feed) return { generatedAt: null, state: "FAIL", errors: ["website feed missing"] };
  const validation = validateFeed(feed, { now });
  const errors = [...validation.errors];
  for (const [label, timestamp] of [["generatedAt", feed.generatedAt], ...Object.keys(REQUIRED_SOURCES).map(name => [name, feed.sources?.[name]?.lastSuccessfulAt])]) {
    const error = freshnessError(timestamp, now, 30);
    if (error) errors.push(`${label}: ${error}`);
  }
  return { generatedAt: feed.generatedAt || null, state: errors.length ? "FAIL" : validation.warnings.length ? "WARN" : "PASS", errors, warnings: validation.warnings };
}
