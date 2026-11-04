# First-feed review checklist

A run is ready for shadow testing only when all checks below pass.

## Source health

- [ ] Widget 4745 (`guided-shore`) loaded.
- [ ] Widget 4746 (`boat-seal`) loaded.
- [ ] Widget 4747 (`marine-special`) loaded, or is clearly recorded as a non-blocking supplementary warning.
- [ ] Both core sources have complete, reconciled page/count evidence, even if their last event is before day 45.
- [ ] The reliable checked range is 45 Sydney calendar days from each original successful check; stale fallback never extends it.
- [ ] Missing, loading, partial or failed sources are not classified as empty. A zero source has explicit empty-state and zero-count evidence.
- [ ] Both required source timestamps and the feed timestamp are within 48 hours and are not in the future.
- [ ] The generated file is not older than the workflow run.

## Required event data

- [ ] Every public event has a valid `startDate`.
- [ ] Exact start times match the expanded widget details.
- [ ] `$0.00` shore events are retained as price `0`.
- [ ] Paid events have the correct AUD price.
- [ ] Every public event has an exact `bookingUrl` containing `?q=`.
- [ ] Every public event has a stored `bookingCode`.
- [ ] Most or all events have a decoded `openCartId`.
- [ ] `productPath` matches the booking URL.

## Spot checks

Open representative links from the actual supplied listings (up to ten when available), including:

- [ ] a free Guided Shore Dive;
- [ ] a normal Boat Dive;
- [ ] a Seal Diving event, if actually listed;
- [ ] a Single Seal Dive, if actually listed;
- [ ] a Marine Marvels or special event, if actually listed;
- [ ] an event displaying zero places in the widget;
- [ ] two separate events on the same date.

Each link must select the intended DS360 event.

## Deduplication and classification

- [ ] Duplicate events from widgets 4746 and 4747 appear only once.
- [ ] Separate sessions on the same day are not collapsed.
- [ ] Normal boat events are not incorrectly tagged as seals.
- [ ] Seal events include `boat`, `seal` and `marine-life` tags.
- [ ] Shore events remain classified as `shore`.

## Safety

- [ ] `validation-report.json` says `"valid": true`.
- [ ] No unverified empty or malformed file replaced a previous good feed. A verified zero result is allowed.
- [ ] Later explicit listings remain in the feed and are marked beyond the reliable horizon.
- [ ] The live consumer distinguishes last listed date, checked coverage and stale/failed status.
- [ ] `npm test` and `npm run test:browser` both pass; live metadata and pagination were tested in a separate read-only shadow run.
- [ ] Capacity inconsistencies are warnings only, not customer-facing claims.
