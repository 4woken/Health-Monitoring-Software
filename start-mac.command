#!/bin/zsh
set -eu

# Finder does not always load the Homebrew path.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")"

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'Node.js 24 or newer is needed to start the project.'
  read -r '?Press Enter to close.'
  exit 1
fi

printf '%s\n' 'Pulsar: http://127.0.0.1:5174' 'To stop: Ctrl+C in this window.'
exec ./node_modules/.bin/vite --host 127.0.0.1 --port 5174
