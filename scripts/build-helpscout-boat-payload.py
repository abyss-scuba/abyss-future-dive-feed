#!/usr/bin/env python3
"""Compile the reviewed Boat Diving Docs pack into exact API article payloads.

Requires pandoc for Markdown-to-HTML conversion. The checked-in JSON is used by
the Action; CI checks the source checksum so edits cannot silently drift.
"""

import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/Boat_Diving_Help_Scout_Docs_2026-09-29.md"
OUTPUT = ROOT / "data/helpscout-boat-articles.json"
ARTICLE = re.compile(r"^## Article ([1-7]) — (.+)$", re.MULTILINE)


def main():
    source_bytes = SOURCE.read_bytes()
    source = source_bytes.decode("utf-8")
    headings = list(ARTICLE.finditer(source))
    if [int(match.group(1)) for match in headings] != list(range(1, 8)):
        raise ValueError("Expected exactly seven numbered articles in order")
    articles = []
    for index, heading in enumerate(headings):
        end = headings[index + 1].start() if index < 6 else source.index("# Implementation notes — do not publish")
        section = source[heading.end():end].strip()
        section = re.sub(r"\n---\s*$", "", section).strip()
        match = re.fullmatch(
            r"\s*\*\*Slug:\*\* `([a-z0-9-]+)`\s+"
            r"\*\*Keywords:\*\*\s+```text\n(.*?)\n```\s+(.*)",
            section,
            re.DOTALL,
        )
        if not match:
            raise ValueError(f"Missing slug, keywords or body in article {index + 1}")
        slug, keyword_text, markdown = match.groups()
        keywords = [line.strip() for line in keyword_text.splitlines() if line.strip()]
        if len(keywords) < 10 or len(set(keywords)) != len(keywords):
            raise ValueError(f"Insufficient or repeated keywords in article {index + 1}")
        if index == 1:
            # The reviewed source includes a dated example. Publishing it after
            # that date would suggest stale inventory. The first publication is
            # a useful fallback until the verified 1 am updater takes ownership.
            schedule_heading = "### Upcoming Sydney boat dives — schedule snapshot"
            if markdown.count(schedule_heading) != 1:
                raise ValueError("Could not identify the dated schedule section")
            introduction = markdown.split(schedule_heading, 1)[0].strip()
            markdown = introduction + "\n\n" + schedule_heading + "\n\n" + (
                "The schedule is being refreshed. To see current departure dates, "
                "destinations, prices and remaining places, [check the live Sydney "
                "boat-diving charters](https://www.abyss.com.au/sydney-boat-diving-charters) "
                "or [boat-dive bookings](https://www.abyss.com.au/charters/boat-dives). "
                "The individual event and your confirmation are the authority for "
                "the meeting point, requirements and inclusions. Ask the Abyss team "
                "if you need help finding a departure for your qualification.\n\n"
                "The dated schedule will appear here after its first verified "
                "refresh. This page cannot confirm a place until you open the "
                "specific booking.\n\n"
                "<!-- ABYSS_BOAT_SNAPSHOT_V1 -->\n"
                "Source: https://www.abyss.com.au/boat-diving-beacon"
            )
        result = subprocess.run(
            ["pandoc", "--from=gfm+raw_html", "--to=html", "--wrap=none", "--shift-heading-level-by=-1"],
            input=markdown,
            text=True,
            capture_output=True,
            check=True,
        )
        html = result.stdout.strip()
        if not html or "# Implementation notes" in html:
            raise ValueError(f"Invalid article body {index + 1}")
        if index == 1 and "ABYSS_BOAT_SNAPSHOT_V1" not in html:
            raise ValueError("Schedule marker missing")
        articles.append({
            "name": heading.group(2).strip(),
            "slug": slug,
            "keywords": keywords,
            "text": html,
        })
    if len({a["slug"] for a in articles}) != 7:
        raise ValueError("Duplicate article slug")
    payload = {
        "sourceSha256": hashlib.sha256(source_bytes).hexdigest(),
        "articles": articles,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(articles)} articles to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
