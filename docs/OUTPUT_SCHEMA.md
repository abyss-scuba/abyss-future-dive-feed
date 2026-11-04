# Public feed schema 1.1.0

The machine-readable schema is `schema/future-dives.schema.json`. The scraper and standalone CLI additionally validate timestamps, identities, complete pagination evidence and consistent window values.

- `publicHorizonDays`: 45, independent of the source page's old 90/100 settings.
- `window.startsOn`: the Sydney generation date plus `futureStartOffsetDays` (normally 21).
- `window.publicTargetThrough`: the Sydney generation date plus 45 calendar days.
- `window.publicSearchThrough`: earliest checked-through date across both required sources, capped by the target. This is not a last-event date.
- `window.latestListedDate`: latest retained public event date or null.
- `window.collectedThrough`: latest collected future listing or null; no completeness inference.
- `sources.guided-shore`: required core widget 4745.
- `sources.boat-seal`: required core widget 4746, including ordinary boats even when seals are absent.
- Each successful source has `checkedFrom`, `checkedThrough`, `lastSuccessfulAt`, `status` (`fresh` or `stale`), nullable `firstDate`/`lastDate`, and `extraction` evidence.
- `extraction`: `complete`, `sourceTotal`, `rowCount`, `totalPages`, `pagesCollected`, `pageSize`, `pageSizes`, `explicitEmpty`. Row/page totals must reconcile. A selector-free source must declare one page and exactly match the observed row count. `pageSize` then records that complete page size (1 for an empty page). Explicit zero is different from a failed source.
- `events`: exact DS360 booking information as before, plus `beyondReliableHorizon`. All later bookable listings are retained, with no day-45 or day-100 truncation.
- `collectionTargetDays`: retained legacy source metadata only. `coversCollectionTarget` is removed; collection now checks all pages.

Successful zero sources have null first/last dates and `explicitEmpty: true`. Failed supplementary sources have `status: failed`, `extraction.complete: false`, and no checked range. A failed core source can only use verified cached evidence within 48 hours, retaining its original timestamps and stale status.

`availabilitySnapshot` remains diagnostic only and is not live inventory. No new seasonal dates are inferred. The companion all-widget file retains every future row, including explicit contact/unavailable actions omitted from the bookable public feed.
