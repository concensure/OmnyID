Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("personalos-readiness-audit-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "[personalos-readiness-audit-pwsh-selftest] $Message (expected=$Expected actual=$Actual)"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $planPath = Join-Path $tmpRoot "plan.md"
    $outDir = Join-Path $tmpRoot "out"

    @'
# PersonalOS Implementation Task Plan

## Phase 0. Example Phase

### Tasks

1. Align terminology.
2. Normalize docs.

### Acceptance criteria

- one

## Phase 1. Partial Phase

### Tasks

3. Build substrate.
4. Wire UI.
5. Add tests.

### Acceptance criteria

- two

### Current implementation progress

- Task 3 is implemented:
- Task 4 is partially implemented:

## Phase 2. Implemented Phase

### Tasks

6. Finish rollout.
7. Validate results.

### Acceptance criteria

- three

### Current implementation progress

- Tasks 6-7 are implemented:

## Phase 3. Inline Progress Phase

### Tasks

8. Improve retrieval.
Current progress:
- topology freshness is live
- object-linked continuity is live
9. Add trust labels.
Current progress:
- remaining work is compact renderer cleanup

### Acceptance criteria

- four

### Current implementation posture

- Phase 3 is materially implemented for current plan purposes:
- remaining work is compact renderer cleanup

## Phase 4. Historical Not Yet Phase

### Tasks

10. Preserve review fallback.

### Acceptance criteria

- five

### Current implementation progress

- Task 10 is implemented:
- review fallback now lands on a concrete artifact even when earlier results did not yet surface `action_message_id` explicitly

## Phase 5. Nonblocking Refinement Phase

### Tasks

11. Consolidate retrieval renderers.

### Acceptance criteria

- six

### Current implementation progress

- Task 11 is implemented:

### Current implementation posture

- Phase 5 is materially implemented for current plan purposes:
- remaining work is edge-case refinement and consolidation around renderer/export consumers rather than core substrate absence
'@ | Set-Content -Path $planPath -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "personalos-readiness-audit.ps1") -PlanPath $planPath -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[personalos-readiness-audit-pwsh-selftest] audit script failed`n$output"
    }

    $report = Get-Content -Path (Join-Path $outDir "personalos-readiness-audit.json") -Raw | ConvertFrom-Json

    Assert-Equal -Actual $report.counts.total_phases -Expected 6 -Message "wrong phase count"
    Assert-Equal -Actual $report.counts.total_tasks -Expected 11 -Message "wrong total task count"
    Assert-Equal -Actual $report.counts.implemented_tasks -Expected 6 -Message "wrong implemented task count"
    Assert-Equal -Actual $report.counts.partial_tasks -Expected 2 -Message "wrong partial task count"
    Assert-Equal -Actual $report.counts.not_started_tasks -Expected 3 -Message "wrong not-started task count"
    Assert-Equal -Actual $report.counts.residual_open_items -Expected 0 -Message "wrong residual open item count"
    Assert-Equal -Actual $report.open_tasks.Count -Expected 5 -Message "wrong open task count"
    Assert-Equal -Actual $report.open_items.Count -Expected 5 -Message "wrong combined open item count"

    $phase1 = @($report.phases | Where-Object { $_.phase_number -eq 1 })[0]
    Assert-Equal -Actual $phase1.open_task_count -Expected 2 -Message "wrong phase 1 open task count"
    Assert-Equal -Actual $phase1.tasks[0].status -Expected "implemented" -Message "task 3 status mismatch"
    Assert-Equal -Actual $phase1.tasks[1].status -Expected "partial" -Message "task 4 status mismatch"
    Assert-Equal -Actual $phase1.tasks[2].status -Expected "not_started" -Message "task 5 status mismatch"

    $phase3 = @($report.phases | Where-Object { $_.phase_number -eq 3 })[0]
    Assert-Equal -Actual $phase3.status -Expected "partial" -Message "phase 3 status mismatch"
    Assert-Equal -Actual $phase3.tasks[0].status -Expected "implemented" -Message "task 8 status mismatch"
    Assert-Equal -Actual $phase3.tasks[1].status -Expected "partial" -Message "task 9 status mismatch"
    Assert-Equal -Actual $phase3.residual_open_item_count -Expected 0 -Message "phase 3 residual open item count mismatch"

    $openPhaseSummary = @($report.open_phase_summaries | Where-Object { $_.phase_number -eq 3 })[0]
    Assert-Equal -Actual $openPhaseSummary.total_open_item_count -Expected 1 -Message "phase 3 total open item count mismatch"

    $phase4 = @($report.phases | Where-Object { $_.phase_number -eq 4 })[0]
    Assert-Equal -Actual $phase4.status -Expected "implemented" -Message "phase 4 status mismatch"
    Assert-Equal -Actual $phase4.residual_open_item_count -Expected 0 -Message "phase 4 residual note should be ignored"

    $phase5 = @($report.phases | Where-Object { $_.phase_number -eq 5 })[0]
    Assert-Equal -Actual $phase5.status -Expected "implemented" -Message "phase 5 status mismatch"
    Assert-Equal -Actual $phase5.residual_open_item_count -Expected 0 -Message "phase 5 nonblocking refinement note should be ignored"

    $markdown = Get-Content -Path (Join-Path $outDir "personalos-readiness-audit.md") -Raw
    if (-not $markdown.Contains("Phase 1 / Task 4 [partial]: Wire UI.")) {
        throw "[personalos-readiness-audit-pwsh-selftest] markdown missing open-task detail"
    }
    if (-not $markdown.Contains("## Open Phase Summary")) {
        throw "[personalos-readiness-audit-pwsh-selftest] markdown missing open phase summary section"
    }
    if ($markdown.Contains("Phase 4 / Residual [partial]:")) {
        throw "[personalos-readiness-audit-pwsh-selftest] markdown should not emit residual detail for historical not-yet progress text"
    }
    if ($markdown.Contains("Phase 5 / Residual [partial]:")) {
        throw "[personalos-readiness-audit-pwsh-selftest] markdown should not emit residual detail for nonblocking refinement note"
    }

    Write-Output "[personalos-readiness-audit-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
