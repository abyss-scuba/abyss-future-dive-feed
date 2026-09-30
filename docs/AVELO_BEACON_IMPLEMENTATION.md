# Avelo Beacon implementation

The dedicated Avelo site is 6abd977b7cdaed3f1efa58af, with private collection 6abd97aa535b0034271deb9a. Beacon e162d2d2-efb8-4f1e-be74-917150b8ca79 is being configured. Website installation remains subject to launch checks.

Fourteen articles are defined in data/helpscout-avelo-knowledge.json. Two reference the canonical course records in the Sydney course knowledge pack. Both sites publish these same maintained source records; the existing Sydney article IDs remain intact. The shared booking guide contains a scoped Avelo freshness exception.

The worker reads /avelo-course-beacon, verifies widget 4869 and groups 40518,40519, extracts every page, and validates the selected event URL, date and price without submitting a cart. Unknown packages fail closed; missing availability stays unknown.

The primary cron is 07:00 Australia/Sydney, with retries at 07:05 and 07:15 and watchdog at 07:30. GitHub supports timezone-aware cron, but jobs can be delayed. The watchdog is a separate scheduled run on the same scheduler; it does not guarantee a hard deadline during a GitHub outage. Snapshots expire at 07:30 the next Sydney calendar day, including daylight-saving changes.

Publication uses the existing Help Scout Docs integration and reads the article back. Same-day retries verify without duplicate updates. Expired failures publish live-page links without old date rows. Last-good revisions remain in private Help Scout history; extracts and backups are retained as workflow artifacts for 30 days. Only small verification status files are committed. This public repository must not contain credentials or customer conversation records.

Agent uptake requires the dedicated Agent's internal Test tab. No undocumented AI testing API is used. An operator must verify retrieval after daily publication until a supported automated interface is available.

Source review on 1 October 2026: the local recreational course now says minimum age 13, matching current Essentials. Training depth is distinguished from later diving privileges. The local instructor page still describes an older programme, so professional intakes require confirmation. Odyssey itinerary and rental availability remain enquiry based. Raw equipment and rental pages are excluded from Agent sources.

Launch gates: final internal QA, stale fallback, two consecutive daily refreshes, mobile and link checks, and an explicitly authorised staff test enquiry. Keep the Beacon off public pages until the gates pass. For a material answer error, disconnect the affected source or Answers while retaining instructor contact.
