# Calendar integration contract: schema 1.1.0

This review patch does not modify `/sydney-dive-calendar` or any Help Scout article. Validate consumer compatibility and a live read-only shadow scrape before deployment.

## Windows and listed dates

- Day 0 through day 20: existing live calendar data.
- From day 21: merge live data and `future-dives.json`; live data wins.
- `publicHorizonDays` is 45. `window.publicTargetThrough` is the generation date in Sydney plus 45 calendar days.
- `window.publicSearchThrough` is the minimum verified `checkedThrough` for both required core sources, capped at that target. A recent stale fallback may shorten this by a day or two. It is independent of the last event date.
- `window.latestListedDate` is the latest retained public event or null. It can fall before or after the checked window.
- `window.collectedThrough` is the latest collected future listing or null, not a completeness promise.
- All listed future events are retained, including seasonal dates after day 100. Do not truncate the array at day 45. Flag `beyondReliableHorizon` dates as later listings requiring reconfirmation.
- `collectionTargetDays` is retained as legacy source-page metadata only; it neither limits collection nor asserts reliability. The old `coversCollectionTarget` flag is removed.

No-match wording within the checked window: “No matching bookable dives were listed when these sources were checked. Confirm with the dive team.” This is not a guarantee that no dives will operate. Before `startsOn`, consult the live calendar. Beyond `publicSearchThrough`, show any explicit listings, but do not infer no dives from an empty result. Say that later schedules can change or may not yet be listed.

The combined `boat-seal` source stays required for ordinary boat dives. An absent seal category does not constitute a failed source. Do not invent a June 2027 departure or apply a hard-coded reopening date.

## Extraction and freshness

Both core sources must have the expected widget identity, a complete extraction, reconciled total and per-page row counts, and an original successful-check timestamp. A source without page controls must declare exactly one page and have an observed row count equal to its independent declared total. Zero results need explicit empty-state and zero-count evidence. Missing/failed/loading/partial results are not zero.

`status: stale` means a current attempt failed but a verified check within 48 hours was retained. Keep its original timestamps and checked range. Do not relabel it as a current zero result. After 48 hours, or if timestamps/evidence are invalid, suppress date/price claims from the snapshot and link the live source/contact route. A new `generatedAt` does not renew source evidence.

A failed supplementary source may be omitted without hiding fresh core results. Retained supplementary data is also subject to the 48-hour limit. The daily website health check uses the stricter existing 30-hour operational threshold.

## Booking and UI

Filter the retained events by inclusive `startDate` and group by day. Deduplicate live/future results by `openCartId`, then `bookingUrl`. Use the exact booking URL, never reconstruct its `q` value.

Primary action: **Check live availability & book**. Secondary action: **View dive details**, using `productPath`.

Prices are snapshots, including valid $0.00 prices. Say “final price confirmed when booking.” Do not show cached capacity as authoritative live inventory.

## Release checklist

1. Run deterministic and offline browser tests.
2. In an isolated output directory, run the live scraper with no publishing. Verify actual charter count/page metadata, 20-row reset completion, every source page, and zero-source evidence where available. Fail closed if metadata differs; do not weaken it to a one-page assumption.
3. Validate candidate JSON with the shared CLI and JSON schema. Inspect source totals, warnings, timestamps, sparse schedules, later dates and stale fallback.
4. Verify the deployed calendar consumer accepts schema 1.1.0, retains later events, separates no-match from unavailable/stale data, and uses actual checked-through dates.
5. Review the health-monitor transition and only enable publication with separate authorization. Existing 1.0 snapshots/cache are intentionally not upgraded by changing timestamps.
