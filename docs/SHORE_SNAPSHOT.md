# Automatic Shore Diving snapshot

The `Shore Diving Help Scout snapshot` workflow refreshes the existing private Shore Diving article every day at **04:00 Australia/Sydney**, including daylight saving. It runs on GitHub's servers; no desktop app or local browser is needed. GitHub can delay scheduled starts.

Source: https://www.abyss.com.au/shore-dive-beacon-data (widget 4861).
Destination: **Upcoming Shore dive dates — schedule snapshot**, article `6abb494803648d35ccabcf5d`, Shore Diving collection `6abb22ad5c1e572f6ed8ba47`.

The next three calendar months of supplied dates are read afresh, including both Guided Shore Dives and Marine Marvels Dives. Marine Marvels are shore dives confirmed by Abyss. The article states the actual first/last supplied dates; it does not invent missing later events, cache places or promise Marine Marvels is free. Weekend summaries are recalculated in Sydney time each run.

The workflow reuses the existing repository secret `HELP_SCOUT_DOCS_API_KEY`. No new credential is needed. Its destination is fixed in the shore module, so the mixed-calendar article secret is never used. Only article text is updated; keywords, title, collection privacy and published status are preserved. A published-content readback is required before success is reported.

Invalid/conflicting rows, boat/unknown categories, wrong target identity, an unpublished draft, empty source data or a count drop below 60% of the last good snapshot stop the update. GitHub shows a failed run and saves a diagnostic summary; the previous article is retained when validation fails. Beacon should not quote it as current after 36 hours.

For a one-off verification, run this workflow on `main`. Leave Publish unchecked for a read-only target validation; check it for an immediate refresh. Inspect the run summary for the verified event count and Marine Marvels count. Tests on pull requests do not receive the Help Scout secret and cannot publish. The scheduled job publishes automatically.

This workflow is separate from the original Sydney Dive Calendar workflow and the future-dive JSON feed. Their scheduling and content are unchanged.

Each verified live refresh commits only `data/helpscout-shore-sync-status.json` with its check time and public event counts. This gives a persistent audit trail and keeps the repository active, avoiding GitHub's 60-day inactivity cutoff for public scheduled workflows. Only the main-branch publishing job has repository write permission. Failure notifications follow the repository owner's GitHub Actions notification settings.
