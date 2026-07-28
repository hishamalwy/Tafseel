#!/usr/bin/env bash
# Wait until every required Staging check-run for a commit has succeeded.
# Fails immediately on failure/cancelled/timed_out/startup_failure/action_required.
# Retries while checks are missing, queued, waiting, pending, or in_progress.
set -euo pipefail

SHA="${1:-}"
GATES_FILE="${2:-scripts/ci/required-staging-gates.txt}"
TIMEOUT_SECONDS="${3:-2700}"
POLL_SECONDS="${4:-20}"

if [[ ! "$SHA" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  echo "A full 40-character Git SHA is required."
  exit 1
fi

if [[ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required."
  exit 1
fi
export GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"

if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
  echo "GITHUB_REPOSITORY is required."
  exit 1
fi

if [[ ! -f "$GATES_FILE" ]]; then
  echo "Required gates file not found: $GATES_FILE"
  exit 1
fi

mapfile -t REQUIRED < <(grep -vE '^\s*(#|$)' "$GATES_FILE")
if [[ ${#REQUIRED[@]} -eq 0 ]]; then
  echo "No required gates listed in $GATES_FILE"
  exit 1
fi

DEADLINE=$((SECONDS + TIMEOUT_SECONDS))
TERMINAL_FAILURE='^(failure|cancelled|timed_out|startup_failure|action_required)$'

echo "Waiting up to ${TIMEOUT_SECONDS}s for ${#REQUIRED[@]} required checks on $SHA"

while (( SECONDS < DEADLINE )); do
  checks_json="$(
    gh api --paginate \
      "repos/$GITHUB_REPOSITORY/commits/$SHA/check-runs?per_page=100" \
      --jq '.check_runs[]' \
      | jq -s '{check_runs: .}'
  )"

  pending=()
  failed=()

  for name in "${REQUIRED[@]}"; do
    # Prefer the newest matching check-run by started_at.
    row="$(jq -c --arg n "$name" '
      [.check_runs[] | select(.name == $n)]
      | sort_by(.started_at // .completed_at // "")
      | reverse
      | .[0] // empty
    ' <<<"$checks_json")"

    if [[ -z "$row" ]]; then
      pending+=("$name (missing)")
      continue
    fi

    status="$(jq -r '.status // "unknown"' <<<"$row")"
    conclusion="$(jq -r '.conclusion // empty' <<<"$row")"

    if [[ "$status" != "completed" ]]; then
      pending+=("$name ($status)")
      continue
    fi

    if [[ "$conclusion" == "success" ]]; then
      continue
    fi

    if [[ "$conclusion" =~ $TERMINAL_FAILURE ]]; then
      failed+=("$name (conclusion=$conclusion)")
      continue
    fi

    failed+=("$name (conclusion=${conclusion:-empty})")
  done

  if [[ ${#failed[@]} -gt 0 ]]; then
    echo "Required check(s) failed for $SHA:"
    printf '  - %s\n' "${failed[@]}"
    exit 1
  fi

  if [[ ${#pending[@]} -eq 0 ]]; then
    echo "All required checks succeeded for $SHA."
    printf '  - %s\n' "${REQUIRED[@]}"
    exit 0
  fi

  echo "Still waiting (${#pending[@]} pending):"
  printf '  - %s\n' "${pending[@]}"
  sleep "$POLL_SECONDS"
done

echo "Timed out after ${TIMEOUT_SECONDS}s waiting for required checks on $SHA."
exit 1
