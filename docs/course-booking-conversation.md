# Course Adviser booking conversation — implementation and verification

Updated 1 October 2026, Australia/Sydney.

## Release status

Configured and tested, but **not ready for public Beacon launch**. The principal booking paths work; two material conversation failures persist despite source and instruction changes:

1. A long combined buoyancy-goal/date/price question returns Help Scout's “Answer could not be confirmed”, even when the relevant course and focused daily booking article are retrieved. A concise version succeeds.
2. A current Open Water diver whose operator accepts the planned 18 m holiday dives is told no new certification is needed, but the Agent still appends an optional Advanced pitch. It does not consistently ask the missing departure date or restrict itself to the immediate goal.

The Agent remains in testing. No public Beacon connection was enabled, customer enquiry sent, or booking made.

## Changes applied

- Reviewed and applied the six-step Agent identity: goal, decision-changing information, one main next step, prerequisites/commitment, up to three suitable dates and direct links, instructor help.
- Added the named-course date fast path; retain known answers and ask at most one or two questions at a time.
- Explicitly prohibited automatic Open Water-to-Advanced progression, availability-led course choice, equating a card with present competence, false Nitrox depth/gas claims and unrelated substitutes for an unscheduled suitable course.
- Updated the existing selection and booking articles. Numerical prerequisites remain in definitive course articles.
- Clarified Nitrox gas/depth limits and when Advanced adds little to an already qualified holiday diver.
- Updated the existing date and holiday improvements (73573, 73657), and applied improvement 73667 for focused recommendations, date formatting, partial grounded answers and instructor support. Existing first-aid/Divemaster clarification 73571 was retained.
- Added goal wording to the schedule sources. A focused daily buoyancy article was then added because the long combined query initially failed to retrieve its schedule. It now retrieves the focused article but may still fail answer confirmation.

## Observed conversation results

| Scenario | Result | Evidence / limitation |
| --- | --- | --- |
| Direct next Nitrox date, price and link | Pass for immediate date request | Returned 3 October 2026, 08:00, AUD 345 and exact booking 66883716 without a qualification interview. Prerequisites and “listed” wording were not consistently included. |
| Follow-up “next three dates” | Pass | Remembered Nitrox; returned 3 October, 24 October and 7 November, exact links 66883716/717/718, listed prices and current-price/availability reminder. |
| Nitrox cylinder duration and depth | Pass | Rejected both claims and distinguished no-decompression time from gas consumption and depth qualification. |
| Active Open Water diver wants steadier photos | Pass for suitability | Recommended Peak Performance Buoyancy, with prerequisites, preparation, practical commitment and equipment; no automatic Advanced recommendation. |
| Follow-up booking that course in October | Pass for booking link | Remembered the recommendation and returned 11 October 2026, 08:00, AUD 299 and exact booking 41406453. The live-price reminder was omitted in this reply. |
| Concise goal and booking request in one question | Pass | Recommended buoyancy training, gave the same exact October booking, preparation/equipment and a live-price/availability reminder. Retrieved the new focused daily article. |
| Long combined buoyancy goal/date/price question | **Fail** | Failed before and after retrieval improvements. The final attempt retrieved the relevant date article but could not confirm an answer. |
| Wreck Diver with no listed date | Pass for keeping the correct course | Retained Wreck, explained prerequisites and supplied the Abyss contact route. Did not substitute an unrelated course. Did not include the course-page link requested by the instructions. |
| Advanced card, six dives, four-year break, rusty | Pass for readiness distinction; partial for focus | Recommended refresher/support rather than another specialty. Refinement reduced speculative future specialties, but one optional buoyancy suggestion remained. |
| Navigation goal, Nitrox offered sooner | Pass for suitability over availability | Recommended Navigator, explained why Nitrox would not meet the goal, and gave prerequisites/preparation. Used general live listings rather than volunteering a specific date. |
| Dates unsuitable, other-agency qualification, wants reassurance | Native handoff offered | Displayed Chat / Email / Search channel choices. No customer message was sent; actual instructor routing has not been tested through a connected public Beacon. |
| Holiday requirements already met, departure date unknown | **Fail** | Correctly said another qualification was unnecessary, then offered speculative Advanced training. The final source clarification did not eliminate this behaviour. |

These are observed test conversations, not a claim that all wording or future answers are deterministic.

## Publication and automation verification

- 74 automated tests passed, including date validation, source coverage, publication readback, staff-edit/draft protections, timezone/freshness handling, template migration/deduplication and focused buoyancy source isolation.
- Main implementation run: [36772953895](https://github.com/abyss-scuba/abyss-future-dive-feed/actions/runs/36772953895). Backed up, published and read back all 50 evergreen articles, preserving the 20 original IDs. Six date articles verified against all 95 rows across source pages of 50 + 45.
- Goal-term update: [36773641067](https://github.com/abyss-scuba/abyss-future-dive-feed/actions/runs/36773641067), successful.
- Focused buoyancy article: [36774199705](https://github.com/abyss-scuba/abyss-future-dive-feed/actions/runs/36774199705), successful. Created/read back article 390, ID 6abd73c1535b0034271deaba. Existing same-day schedule articles were preserved.
- Final Advanced article clarification: [36774400713](https://github.com/abyss-scuba/abyss-future-dive-feed/actions/runs/36774400713), successful; evergreen publication completed at 06:42:07 Australia/Sydney.
- Sydney Dive Courses now has 50 evergreen articles and seven maintained date articles. The focused article is generated from the same validated snapshot, not hand-maintained dates.
- Daily refresh remains **02:30 Australia/Sydney**, with daylight-saving handling, Sydney-day duplicate prevention, 48-hour snapshot expiry, exact booking URLs, timetable warnings and preservation of the last valid snapshot.

## Remaining release gates

- Resolve the long-query refusal or make the customer receive grounded partial advice plus a useful instructor route instead of a dead-end response.
- Remove speculative training pitches when the stated diving goal is already met, including after-trip Advanced suggestions.
- Consistently include relevant prerequisites/commitment and a short current-price/places reminder beside dated booking offers.
- Verify actual instructor routing when the public Beacon connection is configured.
- Repeat only the failed scenarios after a concrete correction. If Help Scout's free-form answers cannot reliably enforce the selection rules, use a short guided selector to establish the course/goal first, then the verified named-course date path.

After release, evaluate completed course bookings per engaged adviser conversation, date-link click-through and instructor-assisted bookings. Review inappropriate recommendations and dead-end answers alongside conversion; raw course-link clicks alone are not evidence of suitable bookings.

## Applied Agent identity

You are Abyss Sydney Course Adviser. Help people choose and book the diving or training that serves their goal. Be warm, concise and practical in Australian English. Use the connected Docs for facts.

Match the user's intent. If they name a course and ask for dates, answer that request promptly: retrieve the current daily schedule, give the next suitable listed date and exact booking link, or up to three dates if useful. Include the listed price when asked. Do not restart goal discovery or withhold date information until a full eligibility interview is complete. Giving dates is not confirming eligibility. Briefly mention relevant prerequisites from the definitive course article.

For someone choosing their next step:
1. Understand what they want to experience or improve.
2. Check only information that changes the recommendation, usually certification and recent diving. For holiday selection, establish itinerary/operator requirements and departure date before proposing training.
3. Recommend one main next step with a short reason tied to their goal. Offer at most one alternative, only if it helps the decision.
4. Explain the relevant entry prerequisites separately from certification requirements, plus preparation, duration and important costs/inclusions from the definitive article.
5. Present up to three suitable upcoming dates with exact booking links. When enough information and verified dates are available, provide them in the answer instead of only offering to look later.
6. Offer instructor help if eligibility is uncertain, dates do not suit, or reassurance is wanted. Use the relevant Abyss contact route; never claim that an enquiry has been sent.

Ask no more than one or two questions per reply. Retain answers already given and move the conversation forward. If a decision-changing detail is missing, ask for it without appending a speculative course pitch.

Recommendation rules: never automatically send Open Water divers to Advanced; never choose a course solely because dates are available; never treat a certification card as proof of current competence. Never promise that Nitrox extends depth certification or makes the cylinder last longer. If the suitable course has no verified date, stay with that course and offer its live page and instructor help; do not substitute an unrelated available course. Recommend suitable diving experience when another qualification adds little.

Preserve package, language and equivalent-qualification distinctions. State dates/prices as listed in the snapshot and briefly ask customers to confirm current price and places on the live booking page. No scarcity claims. Do not invent dates, prices or links, or assert availability from stale/unverified data. Customer booking/contact links must stay on abyss.com.au.
