# Choose Your Next Step — goal guidance

Updated 1 October 2026, Australia/Sydney.

## Scope

Existing Sydney Dive Courses collection retained. Category: Choose Your Next Step (6abd693c7cdaed3f1efa5777). The existing course-selection article keeps its original ID and URL and is assigned to the new category. Eight new focused articles extend the managed knowledge pack from 42 to 50 evergreen articles; the six daily schedule articles remain separately maintained.

## Articles

- Which Sydney dive course should I choose?
- Feel more comfortable diving in Sydney
- Prepare for a dive holiday or liveaboard
- Explore deeper sites or wrecks
- Become a more capable dive buddy
- Return to diving after a break
- Enjoy marine life or underwater photography
- Work towards Master Scuba Diver
- When more diving is the best next step

## Editorial rules

- Start with the diving goal and the relevant experience, recency, site or trip constraints.
- Give one primary recommendation, with a useful alternative only where it changes suitability.
- Keep prerequisite thresholds, equivalences, age limits, certification requirements and package terms in the definitive course articles. Goal articles reference those exact article names.
- Do not duplicate prices or course dates. Use the daily snapshot and exact booking link when verified, otherwise the relevant live Abyss listing.
- Experience routes must be positive and bookable; guided diving is not a replacement for remedial training.
- Holiday advice establishes destination, operator requirements and departure before proposing a bundle.
- Wreck advice separates depth from outside/inside objectives and does not treat a card as unrestricted overhead permission.
- Master Scuba Diver advice checks existing qualifications and useful remaining gaps rather than prescribing a repeat package.
- All new customer-facing links stay on abyss.com.au.

## Verification

- Local test suite: 72 passed, including backup before publication, eight article creations and readback of the course-selection category move.
- All 15 distinct Abyss customer links returned HTTP 200. No new customer-facing link points outside abyss.com.au.
- Production run [36769926379](https://github.com/abyss-scuba/abyss-future-dive-feed/actions/runs/36769926379) succeeded. It backed up all 42 existing articles, published/read back 50 evergreen articles and verified the new category assignment. The Agent's Docs source shows 56 articles, including the six schedule articles.
- Existing course-selection ID retained: 6ab8b5107b6962906797d355. Category UI verified nine articles.

## Agent spot checks

| Scenario | Observed result |
| --- | --- |
| Current Open Water diver wants navigation confidence in Sydney, not depth | Retrieved the confidence guide and recommended the relevant Navigator pathway rather than a depth course. |
| Adult Open Water diver wants the outside of a wreck at 28 metres | Distinguished depth training from wreck skills, recommended the relevant Advanced pathway and did not insist on both Deep and Wreck specialties. |
| Current Advanced diver wants better buddy-response skills; practical EFR is 18 months old | Retrieved buddy, Rescue and first-aid articles; recommended Rescue without unnecessary EFR renewal, subject to currency at certification. |
| Six-dive Open Water diver returning after four years and unsure about equipment setup | Recommended refresher training rather than Advanced or a normal group guided dive. |
| Current, comfortable Advanced diver wants marine-life photography without another qualification | Offered marine-life and private guided diving with internal Abyss booking/information links. |
| Master Scuba Diver candidate already has Advanced, Rescue, five named PADI specialties and 43 dives | Identified seven remaining experience dives, linked the dive calendar and declined to recommend a repeat course package. |

The new goal guides were visibly retrieved as sources in these tests. These are targeted acceptance checks, not evidence that every possible answer or booking conversion has been validated.

## Holiday correction

The initial holiday follow-up recommended Advanced before establishing the departure date or an actual training gap. The Agent identity was updated to enforce goal-first order. The first retest asked for the date but still added an optional course pitch. A targeted Help Scout Improvement (73657) was then created to ask the missing question without appending a course pitch. The final natural-language retest visibly retrieved the new Improvement and the holiday guide, but still listed an optional Advanced course before obtaining the departure date and assumed too much about the reef itinerary. This is an unresolved Agent response-order issue for launch QA; the published article itself explicitly requires those details before recommending training. Do not claim the holiday conversation is fully compliant or connect a public Beacon on the strength of these checks alone.

Course prerequisites remain in the definitive course articles; the added improvement changes recommendation order, not qualification rules. Public Beacon connection was not changed.
