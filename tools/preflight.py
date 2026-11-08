#!/usr/bin/env python3
"""Preflight for .github/workflows/distill.yml. Run by tools/dispatch.sh before every run; a failure blocks the run.

Checks (each one is a mistake that already cost a run):
  - the workflow file parses
  - every job's timeout-minutes is at least its longest planned work time + MARGIN minutes
    (planned work = the largest number in a MIN=... line, or the minutes argument of a
    `node ... <minutes>` generator call listed in WORK_PATTERNS)
  - workers x model memory per machine fits a GitHub runner (16 GB, keep 3 GB spare)
  - a run_id input points to a run that still has the artifact the job downloads
Usage: python3 tools/preflight.py [stage] [run_id]
"""
import json, re, subprocess, sys, yaml

WF = '.github/workflows/distill.yml'
MARGIN = 20            # minutes for checkout, model download, npm install, upload
RUNNER_GB, SPARE_GB = 16, 3
MODEL_GB = {'live2': 3.5}   # GB per worker with the new big judge, as observed: 4 workers killed the runner, 2 run fine

stage = sys.argv[1] if len(sys.argv) > 1 else None
run_id = sys.argv[2] if len(sys.argv) > 2 else None
errors = []

wf = yaml.safe_load(open(WF))
jobs = wf['jobs']

def nums(s):
    return [int(x) for x in re.findall(r"'(\d+)'|\b(\d+)\b", s) for x in x if x]

for name, job in jobs.items():
    cond = str(job.get('if', ''))
    if stage and f"'{stage}'" not in cond:
        continue
    script = '\n'.join(str(s.get('run', '')) for s in job.get('steps', []))
    planned = 0
    for line in script.splitlines():
        if re.match(r'\s*MIN=', line):
            planned = max(planned, max(int(x) for x in re.findall(r"'(\d+)'", line) or ['0']))
    if not planned:
        continue
    t = job.get('timeout-minutes', 360)
    if isinstance(t, str):
        # expression: take the value that applies to this stage, else the smallest (worst case)
        m = re.search(rf"'{stage}'\s*&&\s*(\d+)", t) if stage else None
        t = int(m.group(1)) if m else min(int(x) for x in re.findall(r'\b(\d+)\b', t))
    if t < planned + MARGIN:
        errors.append(f'{name}: timeout-minutes {t} < planned work {planned} + {MARGIN} setup/upload')
    else:
        print(f'ok  {name}: timeout {t} >= work {planned} + {MARGIN}')

    m = re.search(r'NW=(\d+);\s*\[\s*"\$\{\{ inputs.stage \}\}"\s*=\s*(\w+)\s*\]\s*&&\s*NW=(\d+)', script)
    if m and stage in MODEL_GB:
        nw = int(m.group(3)) if stage == m.group(2) else int(m.group(1))
        need = nw * MODEL_GB[stage]
        if need > RUNNER_GB - SPARE_GB:
            errors.append(f'{name}: {nw} workers x {MODEL_GB[stage]} GB = {need:.1f} GB > {RUNNER_GB - SPARE_GB} GB usable')
        else:
            print(f'ok  {name}: memory {need:.1f} GB of {RUNNER_GB - SPARE_GB} GB usable')

if run_id:
    try:
        out = subprocess.run(['gh', 'api', f'repos/Pogaldock/line-lab/actions/runs/{run_id}/artifacts'],
                             capture_output=True, text=True, check=True).stdout
        arts = {a['name']: a['expired'] for a in json.loads(out)['artifacts']}
        if 'teacher2' in arts and not arts['teacher2']:
            print(f'ok  run {run_id} has artifact teacher2')
        elif stage == 'live2':
            errors.append(f'run {run_id} has no live teacher2 artifact ({sorted(arts)})')
    except Exception as e:
        errors.append(f'could not read artifacts of run {run_id}: {e}')

if errors:
    print('\nPREFLIGHT FAILED:'); [print('  ' + e) for e in errors]; sys.exit(1)
print('\npreflight passed')
