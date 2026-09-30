# Training Advice Beacon configuration

Updated 1 October 2026, Australia/Sydney.

## Status

Configured and saved in Help Scout; **not installed on the public training hub**. The Beacon is connected to the dedicated Agent, but answer quality still requires tuning before launch. This report supersedes the previous conversation report's statement that no Beacon connection exists.

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

## Starting-question tests

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

1. Make broad opening questions consistently establish the goal before listing courses, with one or two questions per reply.
2. Resolve the prior holiday case where the stated requirements are already met but an optional Advanced pitch still appears.
3. Recheck the prior long combined goal/date question, using the new useful instructor fallback when answer confirmation fails.
4. Verify a controlled instructor enquiry reaches the responsible staff with conversation context, and confirm chat availability behaviour with that team.
5. Test the actual installed desktop/mobile Beacon, customer-visible source links, booking URLs and conversion tracking.

See [course-booking-conversation.md](course-booking-conversation.md) for the earlier suitability and booking tests. No claim is made that all generated answers are deterministic or that these starting questions maximise bookings without live conversion evidence.
