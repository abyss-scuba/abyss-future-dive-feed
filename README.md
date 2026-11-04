# Abyss Future Dive Feed

This repository turns the DS360 source widgets on:

`https://www.abyss.com.au/widget-all`

into a compact, validated JSON schedule for the future-date planner on `/sydney-dive-calendar`.

## What it collects

The scraper reads these page wrappers and widget IDs:

| Source | Widget | Role |
|---|---:|---|
| `guided-shore` | 4745 | Core |
| `boat-seal` | 4746 | Core |
| `marine-special` | 4747 | Supplementary |

For every event it extracts:

- table start and end dates;
- exact start time from the hidden expanded row;
- charter type, event title and description;
- displayed price, including valid `$0.00` events;
- exact DS360 booking URL;
- raw `q` booking code;
- decoded `part_number` and `open_cart_id`;
- product path;
- capacity figures as diagnostic snapshot data only.

The exact booking URL is always preserved. The scraper decodes `q` for identity and metadata, but never reconstructs the customer link.

## Outputs

| File | Purpose |
|---|---|
| `data/future-dives.json` | Public candidate feed from day 21 onward, retaining all later listed dates. The reliable checked window is 45 days. |
| `data/all-widget-events.json` | All deduplicated future listings from every verified source page, including dates beyond day 100. |
| `data/scrape-state.json` | Last-known-good per-source state used to survive a temporary widget failure. Do not expose this file publicly. |
| `data/validation-report.json` | Validation result and scrape diagnostics. |
| `diagnostics/` | Candidate files, screenshots and rendered HTML when a run fails. |

## Reliability behaviour

- Waits a minimum of 10 seconds for DS360 to initialise.
- Then waits until each widget's row text is stable for three consecutive checks.
- Reads hidden `.expand-row` details directly; it does not click every plus icon.
- Uses the stable outer wrappers and widget IDs, not generated inner calendar IDs.
- Collects every advertised source page, regardless of its latest listed date or sorting. Exact totals and per-page row counts must reconcile.
- When page controls exist, resets DS360 to 20 rows and waits for calendar row replacement. This avoids the documented repeated charter-page issue at 50 rows. When DS360 omits controls, accepts a complete single page only if declared pages equal 1 and observed rows exactly match the independent source count.
- Deduplicates by `open_cart_id`, then exact booking URL, then fallback event identity.
- Prefers more specific `marine-special` metadata when the same event appears in a broad widget.
- Keeps up to 48 hours of last-known-good data if one source temporarily fails.
- Requires both guided-shore widget 4745 and combined boat-seal widget 4746. The latter is required for ordinary boat dives even when no seal dives are listed.
- Treats 45 days from each successful Sydney-date check as the reliable planning horizon. No event is required on that final day. Legacy page attributes of 90/100 cannot override this policy.
- Accepts a verified empty source only with explicit empty text, zero declared count and complete matching pagination evidence. Missing widgets, loading/errors, missing metadata, repeated pages, incomplete rows and page-limit truncation fail closed.
- Preserves later listed dates with `beyondReliableHorizon: true`; this does not imply that an unlisted later date has no dives. No seasonal dates are invented or hard-coded.
- Refuses to publish malformed source rows before filtering. Exact booking URLs, valid zero-dollar prices and cross-source deduplication are preserved.
- Rejects feeds and successful source checks older than 48 hours, missing timestamps and future timestamps. Cached evidence, including verified zero, keeps its original checked-through date and stale status. Old version-1.0 cache cannot be promoted into complete-extraction evidence.
- Uses one shared validator for scraper candidates and standalone validation. Health checks inspect core-source evidence and successful-check times, not merely the feed envelope.

## Customer-facing wording

The future feed is a schedule snapshot, not live seat inventory. The calendar should display wording such as:

> Scheduled — live availability and final price confirmed when you book.

Do not present the scraped capacity figures as authoritative live availability.

## Local use

Requirements: Node.js 22 or later.

```bash
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm run scrape
npm run validate
npm run summary
```

Useful environment variables are documented in `.env.example`.

To test against a saved rendered HTML file instead of the live page:

```bash
HTML_FIXTURE_PATH=/absolute/path/to/widget-all.html \
MIN_INITIAL_DELAY_MS=0 \
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
npm run scrape
```

## GitHub Actions

The workflow already has a schedule and its manual `publish` input defaults to true. For review-only work, do not dispatch it with publishing enabled. Run locally with isolated output/diagnostics directories, or explicitly choose `publish: false` for an authorized shadow run. The added browser regression step must pass before scraping.

This change emits schema `1.1.0`. Review [docs/INTEGRATION_NOTES.md](docs/INTEGRATION_NOTES.md) before enabling it: the live calendar is outside this repository and must not keep treating the final listed date as the checked range. Existing generated JSON has deliberately not been rewritten or timestamped.
See [QUICKSTART.md](QUICKSTART.md) for the exact setup sequence, [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) for the launch checks, and [docs/INTEGRATION_NOTES.md](docs/INTEGRATION_NOTES.md) for the later calendar integration contract.
