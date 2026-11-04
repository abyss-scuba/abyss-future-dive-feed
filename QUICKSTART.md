# Review and shadow-test quick start

Requirements: Node.js 22+ and a supported Chromium runtime.

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

This repository is already scheduled, and the manual workflow's `publish` input defaults to true. Preparing a patch or reviewing a candidate does not authorize publishing. Do not dispatch a publishing run as part of review.

## Isolated, read-only source check

Run the scraper in a new local output directory so it cannot replace saved production JSON:

```sh
OUTPUT_DIR=/tmp/abyss-feed-shadow \
DIAGNOSTICS_DIR=/tmp/abyss-feed-shadow-diagnostics \
npm run scrape

node scripts/validate-feed.mjs /tmp/abyss-feed-shadow/future-dives.json
node scripts/summarise-feed.mjs /tmp/abyss-feed-shadow/future-dives.json
```

Inspect every required source's pagination evidence, total rows, last successful timestamp and checked-through date. Confirm the actual charter widgets provide the expected metadata. Do not accept a one-page assumption if metadata is missing.

Check sparse and verified-zero schedules, preserved later dates, exact booking links and schema 1.1.0 compatibility using [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) and [docs/INTEGRATION_NOTES.md](docs/INTEGRATION_NOTES.md).

Old 1.0 JSON/cache deliberately fails the new evidence requirement. Do not change its timestamp or fabricate extraction evidence. A fresh successful scrape is required.

## Publication

Only after review, successful browser/live shadow tests and separate publication approval, coordinate the feed and live calendar consumer rollout. The consumer lives outside this repository. An authorized GitHub shadow run must explicitly set `publish: false`; scheduled runs and publishing-enabled manual runs commit generated data.
