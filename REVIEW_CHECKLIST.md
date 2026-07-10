# First-feed review checklist

A run is ready for shadow testing only when all checks below pass.

## Source health

- [ ] Widget 4745 (`guided-shore`) loaded.
- [ ] Widget 4746 (`boat-seal`) loaded.
- [ ] Widget 4747 (`marine-special`) loaded, or is clearly recorded as a non-blocking supplementary warning.
- [ ] Both core sources cover at least the 90-day public horizon.
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

Open at least ten links, including:

- [ ] a free Guided Shore Dive;
- [ ] a normal Boat Dive;
- [ ] a Seal Diving event;
- [ ] a Single Seal Dive;
- [ ] a Marine Marvels or special event;
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
- [ ] No empty or malformed file replaced a previous good feed.
- [ ] Capacity inconsistencies are warnings only, not customer-facing claims.
