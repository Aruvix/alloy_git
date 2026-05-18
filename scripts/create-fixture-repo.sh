#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/tmp/alloy-git-fixture}"
rm -rf "$ROOT"
mkdir -p "$ROOT"
cd "$ROOT"

git init -b main >/dev/null
git config user.name "Alloy Fixture"
git config user.email "fixture@alloy.local"

printf "hello\n" > README.md
git add README.md
git commit -m "Initial commit" >/dev/null

git checkout -b feature/demo >/dev/null
printf "feature\n" > feature.txt
git add feature.txt
git commit -m "Add feature file" >/dev/null

git checkout main >/dev/null
printf "local change\n" >> README.md
printf "untracked\n" > scratch.txt

echo "$ROOT"
