# Working rules for compute jobs in this repo

These exist because time was wasted on avoidable job decisions (Nov 2026). Follow them before starting any job that takes more than ~5 minutes.

## Before starting a job
- Start every distill.yml run with `tools/dispatch.sh <stage> [batch] [run_id]`, never a direct dispatch. It runs `tools/preflight.py` (time limits vs planned minutes, memory per runner, the input artifact exists) and refuses to start if a check fails or the commit isn't pushed. When a new kind of mistake costs a run, add a check for it to preflight.py, not only a line here.
- Write the critical path in one line: what has to happen in order, what can run side by side, and the expected wall time. If two heavy steps are independent, they go in separate matrix jobs, never one after the other in one job.
- Check what already exists before computing anything: previous run artifacts (`gh api repos/Pogaldock/line-lab/actions/runs/<id>/artifacts`), files in `distill/night_results`, `distill/live/results`. Reuse features, scores and data instead of recomputing them.
- Every new or changed stage gets a smoke run first (tiny inputs, a few minutes) that goes all the way through, including the commit and push step, before the full run.
- Check every job's `timeout-minutes` against its planned run time (work minutes + setup + upload). A smoke run uses tiny minutes, so it cannot catch a time limit that is too short; this check must be done by reading the file.
- Validate the workflow file (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/distill.yml'))"`) and the scripts before pushing.
- Heavy or slow work runs on GitHub Actions, not in the session's own machine (2 cores, shared with everything else).

## While a job runs
- Watch it with a background check that reports on every ending (success, failure, cancelled), and read the result the moment it lands. Never leave a finished run unread.
- Scripts print progress as they go, never only at the end.
- If a step will clearly take far longer than planned, stop and re-plan rather than wait it out.

## Deciding what to run
- If an approach has failed twice for the same reason, stop and rethink the approach (and check with Rowan) instead of trying a third variant.
- Estimate the cost of each option (minutes of wall time) and say it before choosing.
- Commit steps use `git pull --rebase --autostash` so leftover files never block saving results.
