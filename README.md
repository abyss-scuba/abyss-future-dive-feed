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
| `data/future-dives.json` | Public candidate feed, beginning 21 days from today and ending at the configured 90-day public horizon. |
| `data/all-widget-events.json` | Deduplicated diagnostic snapshot extending to the 100-day collection target. |
| `data/scrape-state.json` | Last-known-good per-source state used to survive a temporary widget failure. Do not expose this file publicly. |
| `data/validation-report.json` | Validation result and scrape diagnostics. |
| `diagnostics/` | Candidate files, screenshots and rendered HTML when a run fails. |

## Reliability behaviour

- Waits a minimum of 10 seconds for DS360 to initialise.
- Then waits until each widget's row text is stable for three consecutive checks.
- Reads hidden `.expand-row` details directly; it does not click every plus icon.
- Uses the stable outer wrappers and widget IDs, not generated inner calendar IDs.
- Collects page 2 only when page 1 does not reach the collection target, or when the rows are not date-sorted.
- Resets the DS360 rows-per-page control to 50 before pagination, so the widget's internal offset is correct.
- Deduplicates by `open_cart_id`, then exact booking URL, then fallback event identity.
- Prefers more specific `marine-special` metadata when the same event appears in a broad widget.
- Keeps up to 48 hours of last-known-good data if one source temporarily fails.
- Refuses to publish when a core source cannot cover the 90-day public horizon or a public event lacks price or an exact booking code.

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

The included workflow is manual-only at first. Run it from **Actions → Scrape future dives → Run workflow** with `publish` left off. Download the artifact and inspect the JSON.

After a successful shadow period, uncomment the `schedule` block in `.github/workflows/scrape-future-dives.yml`. The prepared cron runs twice daily at 01:17 and 13:17 UTC.

See [QUICKSTART.md](QUICKSTART.md) for the exact setup sequence, [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) for the launch checks, and [docs/INTEGRATION_NOTES.md](docs/INTEGRATION_NOTES.md) for the later calendar integration contract.
