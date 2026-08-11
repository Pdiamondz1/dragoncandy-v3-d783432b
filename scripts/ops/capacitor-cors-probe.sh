#!/usr/bin/env bash
# Probe edge functions for Capacitor-origin CORS acceptance.
#
# corsHeaders() runs INSIDE the handler, so a computed per-bundle
# Access-Control-Allow-Origin proves the module graph loaded AND our code ran.
# A boot failure returns 5xx, never a 200 with a correct origin echo. This is
# therefore the only check in the sweep that proves a worker booted.
#
# Deliberately sends NO auth header: the anon key is a valid JWT and would
# sail past the gateway, inverting the expected result on verify_jwt=true
# functions. verify_jwt does not gate OPTIONS, so this works for all of them.
#
# Usage: bash scripts/ops/capacitor-cors-probe.sh <outfile> [slug...]
#        no slugs => probe every function directory
set -uo pipefail
PROJECT_REF="zocahiffooqdybdhguqv"
BASE="https://${PROJECT_REF}.supabase.co/functions/v1"
OUT="${1:?usage: capacitor-cors-probe.sh <outfile> [slug...]}"; shift

if [ "$#" -gt 0 ]; then
  SLUGS="$*"
else
  SLUGS=$(ls -d supabase/functions/*/ | sed 's|supabase/functions/||;s|/$||' \
          | grep -v '^_shared$' | sort)
fi

: > "$OUT"
for fn in $SLUGS; do
  r=$(curl -s -o /dev/null -w "%{http_code}|%header{Access-Control-Allow-Origin}" \
        -X OPTIONS "$BASE/$fn" \
        -H "Origin: capacitor://localhost" \
        -H "Access-Control-Request-Method: POST" \
        --max-time 20)
  echo "$fn|$r" >> "$OUT"
done

# Every count below is gated on $2=="200". Without that gate a transport
# failure (curl timeout => "slug|000|") lands silently in "other" and the run
# still exits 0 — a probe that reached nothing would report a clean fleet.
# Non-200s are counted separately and made loud, because they mean the probe
# failed, NOT that the function is unfixed. The two are not the same finding.
# FOUR outcomes, deliberately kept apart — conflating any two is how a probe lies:
#   200      -> answered the preflight; $3 is the real verdict
#   4xx      -> answered, but refuses OPTIONS (webhooks 405, ingest 401).
#              Legitimate and expected. NOT a failure.
#   5xx      -> WORKER FAILURE. A function that cannot boot returns 500/503/546
#              here, and that is the single failure mode this probe exists to
#              catch. Loud, exit 1.
#   000      -> curl got no reply at all. The probe failed, so this function's
#              state is UNKNOWN — which is not the same as "unfixed". Loud, exit 1.
#
# Both narrower groupings were live in this file and both were wrong:
#   v1 gated on $3 alone, so a timeout ("slug|000|") fell into "other" and the run
#      exited 0 — a probe that reached NOTHING would have reported a clean fleet.
#   v2 over-corrected to "any non-200 is a failure", which flagged 11 by-design
#      webhook 405s as breakage.
#   v3 over-corrected back, folding 5xx in with the benign 4xx refusals — hiding
#      a dead worker behind "refuses OPTIONS by design". Caught by Codex review.
# 4xx and 5xx are different findings and must never share a bucket.
unreachable=$(awk -F'|' '$2=="000" || $2==""' "$OUT" | wc -l)
worker_fail=$(awk -F'|' '$2 ~ /^5[0-9][0-9]$/' "$OUT" | wc -l)

echo "probed $(wc -l < "$OUT") functions -> $OUT"
echo "  fixed  (echoes capacitor): $(awk -F'|' '$2=="200" && $3=="capacitor://localhost"' "$OUT" | wc -l)"
echo "  stale  (.io fallback):     $(awk -F'|' '$2=="200" && $3=="https://dragoncandy.io"' "$OUT" | wc -l)"
echo "  stale  (.com fallback):    $(awk -F'|' '$2=="200" && $3=="https://dragoncandy.com"' "$OUT" | wc -l)"
echo "  other  (no shared helper): $(awk -F'|' '$2=="200" && $3!="capacitor://localhost" && $3!="https://dragoncandy.io" && $3!="https://dragoncandy.com"' "$OUT" | wc -l)"
echo "  no preflight (4xx):        $(awk -F'|' '$2 ~ /^4[0-9][0-9]$/' "$OUT" | wc -l)   (webhooks/ingest refuse OPTIONS by design)"

fail=0
if [ "$worker_fail" -gt 0 ]; then
  echo "  !! WORKER FAILURE (5xx):    $worker_fail  <-- these functions did NOT boot"
  awk -F'|' '$2 ~ /^5[0-9][0-9]$/ {print "       " $1 " -> HTTP " $2}' "$OUT"
  fail=1
fi
if [ "$unreachable" -gt 0 ]; then
  echo "  !! UNREACHABLE:             $unreachable  <-- counts above are INCOMPLETE"
  awk -F'|' '$2=="000" || $2=="" {print "       " $1}' "$OUT"
  fail=1
fi
exit "$fail"
