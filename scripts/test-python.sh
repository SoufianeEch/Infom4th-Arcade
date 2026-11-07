#!/usr/bin/env bash
# Runs the headless unittest suite of every Python game (games/<id>/tests/test_logic.py).
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
for t in games/*/tests/test_logic.py; do
  [ -f "$t" ] || continue
  echo "== $(basename "$(dirname "$(dirname "$t")")")"
  .venv/bin/python -m unittest discover -s "$(dirname "$t")" 2>&1 | grep -E "^(Ran|OK|FAILED|ERROR|FAIL)" || status=1
done
exit $status
