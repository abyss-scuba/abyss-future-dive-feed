# Quick start

## 1. Create the repository

Create a new private GitHub repository, for example:

`abyss-future-dive-feed`

Upload the entire contents of this package to the repository root. Do not upload the outer ZIP as a single file.

## 2. Run the first scrape manually

1. Open the repository's **Actions** tab.
2. Open **Scrape future dives**.
3. Select **Run workflow**.
4. Leave **Commit validated JSON files** switched off.
5. Start the run.

The first run installs Chromium, so it will take longer than later runs.

## 3. Download and review the artifact

Open the completed workflow run and download the `future-dive-scrape-*` artifact.

Review:

- `data/future-dives.json`;
- `data/all-widget-events.json`;
- `data/validation-report.json`;
- `diagnostics/candidate-future-dives.json`.

The workflow must be green before proceeding.

## 4. Run with publishing enabled

Run the workflow again with **Commit validated JSON files** switched on. A successful run will commit the generated `data/` files to the repository.

## 5. Shadow test for one week

Run manually twice per day, or temporarily use an external reminder. Check the review list in `REVIEW_CHECKLIST.md` after each run.

Do not change `/sydney-dive-calendar` during this stage.

## 6. Enable the twice-daily schedule

Edit `.github/workflows/scrape-future-dives.yml` and uncomment:

```yaml
schedule:
  - cron: "17 1,13 * * *"
```

Scheduled runs automatically publish validated changes.

## 7. Choose where the public JSON will live

The preferred final URL is same-origin, for example:

`https://www.abyss.com.au/data/future-dives.json`

Deployment depends on the website hosting access available. Until that is decided, the GitHub artifact and committed JSON are sufficient for shadow testing.
