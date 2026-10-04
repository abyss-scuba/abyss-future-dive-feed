#!/usr/bin/env bash
# Called only after the workflow has committed its explicit status-file allowlist.
# Another publisher or the health monitor may advance main between pull and push.
# Retry that race, but never force-push, choose a side in a content conflict, or
# change a publication receipt merely to get a green result.
set -euo pipefail
if [[ "$(git symbolic-ref --quiet --short HEAD)" != "main" ]]; then
  echo 'Refusing to publish records from a branch other than main.' >&2
  exit 1
fi
for attempt in 1 2 3 4 5 6; do
  if ! git pull --rebase origin main; then
    echo 'Status-record rebase failed; preserve the evidence and inspect the conflict.' >&2
    exit 1
  fi
  if git push origin HEAD:main; then
    echo "Publication record saved (attempt ${attempt})."
    exit 0
  fi
  echo "Record push did not complete; retrying against current main (${attempt}/6)." >&2
  if [[ "$attempt" -lt 6 ]]; then sleep "$((attempt * 2))"; fi
done
echo 'Could not save the publication record after six attempts; report failure.' >&2
exit 1
