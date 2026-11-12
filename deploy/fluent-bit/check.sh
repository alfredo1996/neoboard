#!/bin/sh
# Static checks of the Fluent Bit kit in the pinned image, run by
# .github/workflows/log-shipping.yml. Usage: check.sh [image]
#  1. --dry-run: the config parses
#  2. start it for a few seconds: a misspelt parser or Lua function name only
#     shows at startup, as an [error] line
#  3. the Lua filter's behaviour on three records (a string err, an object err,
#     neither): severity, millisecond-exact time, err always an object
set -eu
IMAGE=${1:-fluent/fluent-bit:5.1.3}
DIR=$(cd "$(dirname "$0")" && pwd)
docker run --rm -e OPENSEARCH_HOST=127.0.0.1 -e OPENSEARCH_PORT=9200 -v "$DIR:/fluent-bit/etc:ro" "$IMAGE" /fluent-bit/bin/fluent-bit -c /fluent-bit/etc/fluent-bit.conf --dry-run

# The image has no shell or timeout: run detached, wait, read the log, remove.
run_for() { # run_for <config> -> the log after 5 s
  name=fb-check-$$
  docker run -d --name "$name" -e OPENSEARCH_HOST=127.0.0.1 -e OPENSEARCH_PORT=9200 -v "$DIR:/fluent-bit/etc:ro" "$IMAGE" /fluent-bit/bin/fluent-bit -c "/fluent-bit/etc/$1" >/dev/null
  sleep 5
  docker logs "$name" 2>&1
  docker rm -f "$name" >/dev/null
}

log=$(run_for fluent-bit.conf)
if echo "$log" | grep -q '\[error\]'; then
  echo "$log" | grep '\[error\]'
  echo "FAIL: Fluent Bit logged an error at startup" >&2
  exit 1
fi

out=$(run_for lua-check.conf)
for want in \
  '"severity":"error"' '"date":"2023-11-14T22:13:20.123' '"err":{"message":"boom"}' \
  '"severity":"warn"' '"date":"2023-11-14T22:13:20.456' '"message":"x"' '"type":"Error"' \
  '"severity":"info"'; do
  echo "$out" | grep -qF "$want" || { echo "$out"; echo "FAIL: missing $want" >&2; exit 1; }
done
echo "ok"
