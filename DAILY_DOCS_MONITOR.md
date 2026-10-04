# Daily Help Scout date-publication monitoring

Implemented with the owner's authorisation on 4 October 2026.

## Scope

The fixed inventory is in `src/helpscout-daily-health.mjs`: seven date publishers and eighteen date-bearing Help Scout articles. It includes all eight course schedule articles and the beginner schedule plus its four maintained recommendation excerpts. Static explanatory articles are not daily date feeds and must not be overwritten merely to change their modification dates.

| Publisher | Scheduled local opportunities (Australia/Sydney) |
|---|---|
| Boat | 01:00, 01:37 |
| Courses | 02:30, 04:07 |
| Beginner | 03:30, 04:15 |
| Shore | 04:00, 04:37 |
| Calendar | 05:07, 05:37 |
| Avelo | 07:00, 07:05, 07:15; 07:30 watchdog |
| Travel | 08:00, 08:37 |

GitHub can delay scheduled starts. A successful immediate deployment run is not proof of the next overnight execution. The Beginner due check now allows a delayed catch-up rather than rejecting everything after 06:00; its normal due/excerpt checks still apply. Avelo does not rewrite an unchanged static knowledge pack; intentional pack changes still encounter all manual-edit protection checks.

## Monitoring and reporting

`helpscout-daily-health.yml` runs at 11:17 and 12:17 Sydney time and after the seven production publishers complete. It independently GETs the actual published Docs articles. It does not PUT or POST to Help Scout. It verifies fixed identity, published state, no blocking draft, real check dates, excerpt expiry, retained departure URLs, and count consistency with the publication receipt. The course overview is a shortlist: full coverage is the deduplicated union across its grouped articles. It also reads active workflow state and daily schedule configuration and reports additional unmonitored scheduled `sync-helpscout-*` workflows.

The separate website `future-dives.json` check remains distinct from Docs. Its failure can keep the overall report red even while every Help Scout date source passes.

Results:
- `data/helpscout-daily-health.json`: public health metadata and heartbeat only, no article bodies or secrets.
- Actions run summary and thirty-day report artifacts.
- One open GitHub incident identified by `ABYSS_DAILY_DOCS_HEALTH_V1`. Changed failures and continued failures on a new Sydney day are reported; repeated unchanged messages are deduplicated. Recovery closes the incident only when every required check passes.
- A separately scheduled ChatGPT task, **Help Scout Daily Health**, reports to Peter each day around 13:00 Sydney time, starting 5 October. It checks the monitor heartbeat and the source receipts independently. A missing/inaccessible monitor is UNVERIFIED or failed, never all clear.

GitHub issue delivery is tested using a clearly labelled test issue: create, read back, close. This proves repository delivery, not receipt of email or a device notification. Notification receipt depends on the user's notification settings. The independent daily ChatGPT task reports even when no failures occur.

## Recovery safeguards

Do not remove identity, private-collection, draft, manual-edit, source consistency, large-count-drop or readback safeguards merely to make a job green. Inspect the affected article and reconcile human changes first. Never advance a successful-check timestamp after a failed scrape or failed readback. Failed/dry-run jobs cannot satisfy the daily requirement.

The monitor does not make bookings, alter website pages, change Agent Identity or create Improvements. PASS confirms the monitored date publication checks; it does not certify the AI's date selection, live seat availability, dive suitability or every booking URL's browser behaviour. Agent answer regression tests remain separate.
