#!/usr/bin/env bash
# The only way to start a distill.yml run: preflight first, then dispatch through the REST API.
# Usage: tools/dispatch.sh <stage> [batch] [run_id]
set -euo pipefail
cd "$(dirname "$0")/.."
stage=$1; batch=${2:-}; run_id=${3:-}
python3 tools/preflight.py "$stage" "$run_id"
git diff --quiet HEAD -- .github distill || { echo "uncommitted changes in .github or distill: commit and push first"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse @{u})" ] || { echo "local commit not pushed: the run would use the old version"; exit 1; }
args=(-f ref=main -f "inputs[stage]=$stage")
[ -n "$batch" ] && args+=(-f "inputs[batch]=$batch")
[ -n "$run_id" ] && args+=(-f "inputs[run_id]=$run_id")
gh api -X POST repos/Pogaldock/line-lab/actions/workflows/distill.yml/dispatches "${args[@]}"
sleep 6; gh api 'repos/Pogaldock/line-lab/actions/runs?per_page=1' -q '.workflow_runs[0]|"started run \(.id) on \(.head_sha[0:7])"'
