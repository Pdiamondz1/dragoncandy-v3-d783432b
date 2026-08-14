#!/usr/bin/env bash
# Session Context Recovery Script
# Surfaces recent handoffs and wiki activity at conversation start.
# Called by the SessionStart hook in .claude/settings.json.
#
# Ported from session-context.ps1 on 2026-08-14, when the project moved from
# Windows to macOS. Written for bash 3.2 (the /bin/bash macOS ships), so no
# associative arrays, no `mapfile`, no `${var,,}`.

set -o pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"
handoff_dir="$project_root/.claude/handoffs"
wiki_log="$project_root/docs/wiki/log.md"

# 48-hour cutoff as YYYYMMDDHHMMSS. BSD date first (macOS), GNU date as fallback.
cutoff="$(date -v-48H +%Y%m%d%H%M%S 2>/dev/null)" \
  || cutoff="$(date -d '48 hours ago' +%Y%m%d%H%M%S)"

# --- Recent Handoffs (last 48h) ---
recent=""
if [ -d "$handoff_dir" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    base="$(basename "$file")"
    # Prefer the YYYY-MM-DD[-HHMMSS] stamp in the filename over the mtime: a
    # fresh git worktree rewrites every file's mtime to checkout time, which
    # would otherwise report all 19 handoffs as landing minutes ago.
    if [[ "$base" =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})(-([0-9]{6}))? ]]; then
      stamp="${BASH_REMATCH[5]}"
      [ -n "$stamp" ] || stamp="000000"
      key="${BASH_REMATCH[1]}${BASH_REMATCH[2]}${BASH_REMATCH[3]}${stamp}"
    else
      key="$(date -r "$file" +%Y%m%d%H%M%S 2>/dev/null)" || key="00000000000000"
    fi
    if [[ "$key" > "$cutoff" ]]; then
      recent="${recent}${key}|${file}"$'\n'
    fi
  done < <(find "$handoff_dir" -maxdepth 1 -type f -name '*.md' 2>/dev/null)

  if [ -n "$recent" ]; then
    echo "=== Recent Handoffs (last 48h) ==="
    printf '%s' "$recent" | sort -r | while IFS='|' read -r key file; do
      [ -n "$file" ] || continue
      echo "- $(basename "$file") (${key:0:4}-${key:4:2}-${key:6:2} ${key:8:2}:${key:10:2})"
      summary="$(head -n 15 "$file" | grep -m1 -E '^##[[:space:]]+' | sed -E 's/^##[[:space:]]+//')"
      [ -n "$summary" ] && echo "  Summary: $summary"
    done
  else
    echo "No handoffs in the last 48 hours."
  fi
else
  echo "No handoffs directory found."
fi

echo ""

# --- Recent Wiki Activity ---
if [ -f "$wiki_log" ]; then
  # Collapse each "## [date] op | Subject" block onto a single line.
  entries="$(awk '
    /^## \[/ { if (cur != "") print cur; cur = $0; next }
    cur != "" {
      line = $0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line != "") cur = cur " " line
    }
    END { if (cur != "") print cur }
  ' "$wiki_log")"

  if [ -n "$entries" ]; then
    echo "=== Recent Wiki Activity ==="
    printf '%s\n' "$entries" | head -n 3 | while IFS= read -r entry; do
      if [ ${#entry} -gt 200 ]; then
        echo "${entry:0:200}..."
      else
        echo "$entry"
      fi
    done
    echo "Wiki has $(printf '%s\n' "$entries" | wc -l | tr -d ' ') total log entries."
  else
    echo "Wiki log is empty."
  fi
else
  echo "No wiki log found at docs/wiki/log.md."
fi
