#!/usr/bin/env bash
# Verify a deploy revision is a full SHA and an ancestor of origin/main.
set -euo pipefail

SHA="${1:-}"
if [[ ! "$SHA" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  echo "A full 40-character Git SHA is required (got: '${SHA:-empty}')."
  exit 1
fi

git fetch --quiet origin main
if ! git merge-base --is-ancestor "$SHA" origin/main; then
  echo "Revision $SHA is not an ancestor of origin/main."
  exit 1
fi

echo "Revision $SHA is on main."
