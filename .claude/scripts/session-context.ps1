# Session Context Recovery Script
# Surfaces recent handoffs and wiki activity at conversation start.
# Called by SessionStart hook in .claude/settings.json.

$projectRoot = $PSScriptRoot | Split-Path | Split-Path
$handoffDir = Join-Path $projectRoot ".claude\handoffs"
$wikiLog = Join-Path $projectRoot "docs\wiki\log.md"

$cutoff = (Get-Date).AddHours(-48)
$output = @()

# --- Recent Handoffs (last 48h) ---
if (Test-Path $handoffDir) {
    $recent = Get-ChildItem "$handoffDir\*.md" -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $cutoff } |
        Sort-Object LastWriteTime -Descending

    if ($recent) {
        $output += "=== Recent Handoffs (last 48h) ==="
        foreach ($h in $recent) {
            $ts = Get-Date $h.LastWriteTime -Format "yyyy-MM-dd HH:mm"
            $output += "- $($h.Name) ($ts)"
            $lines = Get-Content $h.FullName -TotalCount 15 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($line -match "^##\s+(.+)") {
                    $output += "  Summary: $($Matches[1])"
                    break
                }
            }
        }
    } else {
        $output += "No handoffs in the last 48 hours."
    }
} else {
    $output += "No handoffs directory found."
}

$output += ""

# --- Recent Wiki Activity ---
if (Test-Path $wikiLog) {
    $logLines = Get-Content $wikiLog -ErrorAction SilentlyContinue
    $entries = @()
    $currentEntry = $null

    foreach ($line in $logLines) {
        if ($line -match "^## \[") {
            if ($currentEntry) { $entries += $currentEntry }
            $currentEntry = $line
        } elseif ($currentEntry -and $line.Trim()) {
            $currentEntry += " " + $line.Trim()
        }
    }
    if ($currentEntry) { $entries += $currentEntry }

    if ($entries.Count -gt 0) {
        $output += "=== Recent Wiki Activity ==="
        $show = if ($entries.Count -le 3) { $entries } else { $entries | Select-Object -First 3 }
        foreach ($e in $show) {
            $truncated = if ($e.Length -gt 200) { $e.Substring(0, 200) + "..." } else { $e }
            $output += $truncated
        }
        $output += "Wiki has $($entries.Count) total log entries."
    } else {
        $output += "Wiki log is empty."
    }
} else {
    $output += "No wiki log found at docs/wiki/log.md."
}

$output -join "`n"
