#!/bin/sh
# Copy the canonical studio into an app repository: ./sync.sh ~/path/to/app [--check]
# The app keeps its own store-listing/{studio.json,profiles.json,theme.css,theme.js,<locale>/}.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
target="${1:?usage: sync.sh <app-repo> [--check]}/store-listing/studio"
if [ "${2:-}" = "--check" ]; then
  diff -r -x __pycache__ -x '*.pyc' -x .DS_Store "$here/studio" "$target" && echo "Studio in $target is current (v$(cat "$here/studio/VERSION"))."
else
  mkdir -p "$target"
  rsync -a --delete --exclude=__pycache__/ --exclude='*.pyc' --exclude=.DS_Store "$here/studio/" "$target/"
  echo "Synced studio v$(cat "$here/studio/VERSION") into $target"
fi
