# Calendar integration contract

This scraper package deliberately does not modify `/sydney-dive-calendar`. Integrate only after the feed has passed the shadow test.

## Recommended source split

- Day 0 through day 20: existing live calendar data.
- Day 21 through the live-calendar endpoint: merge live data and JSON; live data wins.
- Later dates through `window.publicSearchThrough`: use `future-dives.json`.
- Dates after `window.publicSearchThrough`: explain that the schedule has not yet been published.

Deduplicate live and future records by `openCartId`, then `bookingUrl`.

## Search interface

Ask for an inclusive arrival and departure date. Filter the JSON by `startDate` and group matching records by day.

Primary button:

`Check live availability & book`

Use `bookingUrl` without changing or rebuilding the `q` value.

Secondary button:

`View dive details`

Use `productPath` without the `q` parameter.

## Price and availability wording

Display the snapshot price with a qualification:

`$130 — final price confirmed when booking`

Do not display `availabilitySnapshot.placesAvailable` as a reliable live seat count. DS360 remains authoritative when the booking page opens.

## Stale-feed handling

Compare the current time with `generatedAt`.

- Under 30 hours: normal future-schedule wording.
- 30–48 hours: show a subtle “last updated” warning.
- Over 48 hours: do not make strong availability claims; show product details and a contact path.

Also inspect each source's `status`. A `stale` supplementary source should not prevent shore and boat results from appearing.
