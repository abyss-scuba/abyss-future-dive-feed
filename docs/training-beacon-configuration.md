# Training Advice Beacon configuration

Updated 1 October 2026, Australia/Sydney.

## Status

Configured and saved in Help Scout; **not installed on the public training hub**. The four suggested openings now pass focused-conversation tests after refining two existing Agent improvements. A complex combined goal/date query still fails answer confirmation, and date-answer formatting needs further consistency before launch. This report supersedes the previous conversation report's statement that no Beacon connection exists.

- Beacon: Training Advice — `eac1c7e7-ab8a-432a-aae8-53bc18e58b68`.
- Agent: Abyss Training Advice Agent — `27358`.
- Settings: https://secure.helpscout.net/settings/beacons/eac1c7e7-ab8a-432a-aae8-53bc18e58b68/customize
- Knowledge: existing Sydney Dive Courses Docs source, 50 evergreen articles and seven maintained date articles. Four existing improvements retained; no extra website or unrelated shared source added.

## Saved visitor experience

| Element | Saved value |
| --- | --- |
| Launcher | Ask about your next course |
| Welcome title | What diving would you like to do next? |
| Welcome description | Tell us your diving goal and experience. We’ll help you choose a suitable next step and find upcoming dates. |
| AI option | Find your next diving step |
| AI identity | Abyss Training Advice AI |
| Human contact | Ask an instructor |
| Message prompt | Tell us what you’d like to do and when you hope to dive. |
| Appearance | Existing Abyss colour #c2410c; Icon & Text; right position; English; Help Scout branding off |
| Mode | Neutral: advice and instructor contact available together |
| Docs browsing | Off; connected Agent still uses the course Docs knowledge |
| Email before AI advice | Off |

All four original suggested questions are saved and were read back after a reload:

1. I’m Open Water certified—what should I do next?
2. Which course will help me prepare for a dive trip?
3. What training do I need for deeper dives or wrecks?
4. I haven’t dived for a while—where should I start?

These remain test candidates, not conversion-proven winners.

## Instructor contact and continuity

- Connected inbox: **Abyss Scuba Diving**, matching the existing Open Water Beacon. Destination selection was read back.
- Contact form on; name and subject off. Preview shows only email address and message, with optional attachment.
- Human chat on. Help Scout shows live chat only when a connected-inbox user is present, Available and below their chat limit; email is the fallback. This is availability gating, **not fixed office-hours scheduling**.
- Email required before connecting to a human chat; chat email transcript on.
- Basic same-browser conversation history retained; cross-device history off. Cross-device history needs a separate secure implementation and is not claimed here.
- Follow-up labels encourage replying in the conversation or by email.
- Instructor handoff was observed in the internal Agent test. No customer enquiry was submitted, so inbox receipt, staff assignment and full transcript delivery have not been tested end to end.
- Custom AI fallback/human-request messages point to email or the course team. Customer booking/contact links in the Agent instructions and configured fallback copy stay within abyss.com.au. Staff-only retrieval/source links in the test panel are not customer recommendations.

## Follow-up refinements and current test results

The repeated configuration request was used to verify the saved setup and address the opening-answer failures. Improvements 73667 and 73657 were updated in place, preserving their course-selection, eligibility and booking safeguards. No extra knowledge source was connected.

- Added short opening examples for the four suggested questions, with one or two questions per reply and no speculative course catalogue.
- Explicitly separated named-course dates/price/booking requests from course-selection discovery. Giving booking information does not confirm eligibility.
- Strengthened the holiday rule against optional Advanced or specialty pitches when the stated goal is already covered.
- Changed the saved clarification message to: “I couldn’t confirm that detail. Type ‘ask an instructor’ and our course team can check your goal, prerequisites or suitable dates.”
- Rechecked the dedicated Agent connection, four saved questions, minimal contact form, Abyss Scuba Diving inbox, Neutral mode, transcript/follow-up labels and unchanged branding.

| Scenario | Latest observation |
| --- | --- |
| Open Water next step | **Pass:** reassures that another course is not automatically needed, then asks the goal and last dive. No course catalogue. |
| Prepare for a trip | **Pass:** asks destination and departure only, without proposing training. |
| Deeper dives or wrecks | **Pass:** distinguishes depth and outside/inside wreck goals, then asks current certification and intended diving. No premature course pitch. |
| Return after a break | **Pass:** asks recency and confidence; refresher or supported return remain conditional options. |
| Follow-up from Open Water opening to buoyancy/photos and October booking | **Pass for recommendation and booking:** retained the supplied experience and gave Peak Performance Buoyancy, 11 October 2026 at 08:00, AUD 299 and the exact Abyss booking link, with current-price/availability reminder. Prerequisites/commitment were not included in that reply. |
| Already-qualified Cairns holiday, departure supplied | **Pass for avoiding unnecessary training:** no extra course needed; suggested preparation/local diving. |
| Original Cairns holiday case, departure not supplied | **Pass for avoiding the previous Advanced upsell:** no extra course pitch. It did not ask the missing departure date, but no training recommendation or date offer depended on that date. |
| Direct next Nitrox date, price and booking link | Initially failed answer confirmation in both Demo and Training Advice test contexts. After making the booking-information exception explicit, returned 3 October 2026 at 08:00, AUD 345 and exact booking 66883716. **Partial pass:** appended three additional dates (four total), exceeding the intended maximum of three. |
| Original long combined buoyancy goal/date/price/link question | **Still fails:** relevant course and focused schedule sources are retrieved, but the internal test reports “Answer could not be confirmed”. |
| Ask an instructor after uncertainty | **Pass for handoff recognition:** offered native channel choices. No enquiry was sent. |

The four opening tests were run after adding their specific patterns. The subsequent booking exception changes only the named-course information path; it leaves those patterns intact. These are observed conversations, not a guarantee of identical future responses.

The internal Test still displayed its generic clarification even when Training Advice context was selected. The customised Beacon fallback is saved, but its actual rendered failure/handoff behaviour must be checked on the installed Beacon. Do not treat saved wording as proof of end-to-end delivery.

## Initial starting-question tests, before the follow-up refinements

| Question | Initial test | After focused guidance publication |
| --- | --- | --- |
| Open Water next step | Long course catalogue, Advanced first | Improved ordering, but still lists several options before learning the goal. **Needs tuning.** |
| Prepare for a trip | Relevant information requested, too many questions at once | Still requests destination/date, operator requirements and certification/recency in one reply. **Needs tuning.** |
| Deeper dives or wrecks | Answer could not be confirmed | Gives useful Deep/Wreck guidance, relevant Abyss links and a wreck-penetration limit; asks for certification and goal. Still presents courses before qualification is established. **Partial pass.** |
| Return after a break | Asks recency/confidence; distinguishes refresher from guided diving | Same useful distinction; no automatic new certification. **Pass for opening suitability.** |
| Ask an instructor after advice | — | Native channel choices offered. No message sent. |

## Knowledge publication evidence

Four existing goal articles received focused opening answers and continuation guidance. Course prerequisites and the number of articles were unchanged.

- Commit: `d5380eb37f14db1e9cc565967aa27e4b3c52481c`.
- Successful test/publication run: https://github.com/abyss-scuba/abyss-future-dive-feed/actions/runs/36777240074
- Evergreen publication recorded at 2026-09-30T21:07:10.645Z.
- Publication backed up originals and read back articles. Daily date publication was correctly skipped as already published for the Sydney day.
- Existing daily schedule remains 02:30 Australia/Sydney. Latest recorded schedule check: 1 October 2026, 06:40 Sydney; 95 rows across two pages. This manual implementation-day run does not change the recurring schedule.

## Before public installation

1. Resolve the long combined goal/date confirmation failure, or verify that the installed Beacon provides a useful instructor route with the saved fallback wording.
2. Keep all dates in a reply within the maximum of three; make listed-price wording, relevant prerequisites/commitment and live-price/places reminders consistent.
3. Verify a controlled instructor enquiry reaches the responsible staff with conversation context, and confirm chat availability behaviour with that team.
4. Test the actual installed desktop/mobile Beacon, customer-visible source links, booking URLs and conversion tracking.

See [course-booking-conversation.md](course-booking-conversation.md) for the earlier suitability and booking tests. No claim is made that all generated answers are deterministic or that these starting questions maximise bookings without live conversion evidence.
