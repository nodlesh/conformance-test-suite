#!/bin/sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <log-file> <command> [args...]" >&2
  exit 64
fi

log_file="$1"
shift

mkdir -p "$(dirname "$log_file")"

fifo="/tmp/log-runner.$$.$(date +%s).fifo"

cleanup() {
  rm -f "$fifo"
}

trap cleanup EXIT INT TERM

mkfifo "$fifo"
tee -a "$log_file" <"$fifo" &
tee_pid=$!

set +e
"$@" >"$fifo" 2>&1
cmd_status=$?
set -e

wait "$tee_pid" || true

exit "$cmd_status"
