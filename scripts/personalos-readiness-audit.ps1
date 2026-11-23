param(
    [string]$PlanPath = "",
    [string]$OutDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PlanPath)) {
    $PlanPath = Join-Path $PSScriptRoot "..\Documents\personalOS\personalOS implementation task plan.md"
}

if (-not (Test-Path $PlanPath)) {
    throw "[personalos-readiness-audit] plan file not found: $PlanPath"
}

$phasePattern = '^## Phase\s+(?<number>\d+)\.\s+(?<title>.+)$'
$tasksPattern = '^### Tasks$'
$acceptancePattern = '^### Acceptance criteria$'
$progressPattern = '^### Current implementation progress$'
$posturePattern = '^### Current implementation posture$'
$taskPattern = '^- Task[s]?\s+.+?partially implemented:'
$unfinishedPattern = '(?i)\b(partially implemented|remaining work|still-open|still open)\b|(?i)\bnot yet\b(?=.*\b(implemented|complete|done|supported|available|live|wired|finished|working)\b)'
$taskLinePattern = '^\s*(?<number>\d+)\.\s+(?<text>.+?)\s*$'
$progressTaskStatusPattern = '^- Task[s]?\s+(?<refs>[\d,\-\sand]+?)\s+(?:is|are)\s+(?<status>now materially implemented|materially implemented|now implemented|implemented|now partially implemented|partially implemented)\b'
$inlineProgressPattern = '^Current progress:\s*$'

$lines = Get-Content -Path $PlanPath
$phases = New-Object System.Collections.Generic.List[object]
$current = $null
$section = ""
$currentTaskNumber = $null

function Expand-TaskReferenceList {
    param([string]$References)

    $expanded = New-Object System.Collections.Generic.List[int]
    $normalized = ($References -replace '\band\b', ',') -replace '\s+', ''
    foreach ($part in ($normalized -split ',')) {
        if ([string]::IsNullOrWhiteSpace($part)) {
            continue
        }
        if ($part -match '^(?<start>\d+)-(?<end>\d+)$') {
            $start = [int]$matches['start']
            $end = [int]$matches['end']
            if ($end -lt $start) {
                $tmp = $start
                $start = $end
                $end = $tmp
            }
            foreach ($value in $start..$end) {
                $expanded.Add([int]$value)
            }
            continue
        }
        if ($part -match '^\d+$') {
            $expanded.Add([int]$part)
        }
    }

    return @($expanded.ToArray() | Select-Object -Unique)
}

function Normalize-ResidualOpenNote {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    return (($Text -replace '^\s*-\s*', '').Trim())
}

function Test-IsBlockingResidualOpenNote {
    param([string]$Text)

    $normalized = Normalize-ResidualOpenNote -Text $Text
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return $false
    }

    if ($normalized -notmatch $unfinishedPattern) {
        return $false
    }

    $nonBlockingResidualPattern = '(?i)\b(remaining work|follow-on work)\b.*\b(edge[- ]case|presentation refinement|consolidation|renderer|export consumer|opportunistic)\b'
    if ($normalized -match $nonBlockingResidualPattern) {
        return $false
    }

    return $true
}

function New-PhaseRecord {
    param(
        [int]$Number,
        [string]$Title
    )

    return [ordered]@{
        phase_number = $Number
        title = $Title.Trim()
        tasks = New-Object System.Collections.Generic.List[object]
        acceptance_criteria = New-Object System.Collections.Generic.List[string]
        progress_lines = New-Object System.Collections.Generic.List[string]
        phase_posture_lines = New-Object System.Collections.Generic.List[string]
        task_status_map = @{}
        task_progress_map = @{}
        phase_open_notes = New-Object System.Collections.Generic.List[string]
        partial_markers = 0
        unfinished_markers = 0
        status = "not_started"
    }
}

foreach ($line in $lines) {
    $phaseMatch = [regex]::Match($line, $phasePattern)
    if ($phaseMatch.Success) {
        if ($null -ne $current) {
            $phases.Add([pscustomobject]$current)
        }
        $current = New-PhaseRecord -Number ([int]$phaseMatch.Groups["number"].Value) -Title $phaseMatch.Groups["title"].Value
        $section = ""
        continue
    }

    if ($null -eq $current) {
        continue
    }

    $trimmed = $line.Trim()
    $globalProgressTaskMatch = $null
    if (
        $section -eq "" -and
        -not [string]::IsNullOrWhiteSpace($trimmed)
    ) {
        $globalProgressTaskMatch = [regex]::Match(
            $trimmed,
            $progressTaskStatusPattern,
            [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
        )
        if ($globalProgressTaskMatch.Success) {
            $current.progress_lines.Add($trimmed)
            if ($trimmed -match $taskPattern) {
                $current.partial_markers++
            }
            if ($trimmed -match $unfinishedPattern) {
                $current.unfinished_markers++
            }

            $normalizedStatus = if ($globalProgressTaskMatch.Groups["status"].Value -match 'partial') {
                "partial"
            } else {
                "implemented"
            }
            foreach ($taskNumber in (Expand-TaskReferenceList -References $globalProgressTaskMatch.Groups["refs"].Value)) {
                $current.task_status_map["$taskNumber"] = $normalizedStatus
            }
            continue
        }
    }

    if ($line -match $tasksPattern) {
        $section = "tasks"
        $currentTaskNumber = $null
        continue
    }
    if ($line -match $acceptancePattern) {
        $section = "acceptance"
        $currentTaskNumber = $null
        continue
    }
    if ($line -match $progressPattern) {
        $section = "progress"
        $currentTaskNumber = $null
        continue
    }
    if ($line -match $posturePattern) {
        $section = "phase_posture"
        $currentTaskNumber = $null
        continue
    }
    if ($line -match '^## ' -or $line -match '^### ') {
        $section = ""
        $currentTaskNumber = $null
        continue
    }

    switch ($section) {
        "tasks" {
            $taskMatch = [regex]::Match($line, $taskLinePattern)
            if ($taskMatch.Success) {
                $currentTaskNumber = [int]$taskMatch.Groups["number"].Value
                $current.tasks.Add([pscustomobject]@{
                    task_number = $currentTaskNumber
                    text = $taskMatch.Groups["text"].Value.Trim()
                })
                continue
            }

            if ($line -match $inlineProgressPattern -and $null -ne $currentTaskNumber) {
                $section = "task_inline_progress"
            }
        }
        "acceptance" {
            if ($line -match '^\s*-\s+') {
                $current.acceptance_criteria.Add(($line -replace '^\s*-\s+', '').Trim())
            }
        }
        "progress" {
            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed)) {
                continue
            }
            $current.progress_lines.Add($trimmed)
            if ($trimmed -match $taskPattern) {
                $current.partial_markers++
            }
            if ($trimmed -match $unfinishedPattern) {
                $current.unfinished_markers++
            }

            $progressTaskMatch = [regex]::Match($trimmed, $progressTaskStatusPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if ($progressTaskMatch.Success) {
                $normalizedStatus = if ($progressTaskMatch.Groups["status"].Value -match 'partial') { "partial" } else { "implemented" }
                foreach ($taskNumber in (Expand-TaskReferenceList -References $progressTaskMatch.Groups["refs"].Value)) {
                    $current.task_status_map["$taskNumber"] = $normalizedStatus
                }
            } elseif (Test-IsBlockingResidualOpenNote -Text $trimmed) {
                $current.phase_open_notes.Add((Normalize-ResidualOpenNote -Text $trimmed))
            }
        }
        "phase_posture" {
            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed)) {
                continue
            }
            $current.phase_posture_lines.Add($trimmed)
            $current.progress_lines.Add($trimmed)
            if ($trimmed -match $taskPattern) {
                $current.partial_markers++
            }
            if ($trimmed -match $unfinishedPattern) {
                $current.unfinished_markers++
                if (Test-IsBlockingResidualOpenNote -Text $trimmed) {
                    $current.phase_open_notes.Add((Normalize-ResidualOpenNote -Text $trimmed))
                }
            }
        }
        "task_inline_progress" {
            $taskMatch = [regex]::Match($line, $taskLinePattern)
            if ($taskMatch.Success) {
                $currentTaskNumber = [int]$taskMatch.Groups["number"].Value
                $current.tasks.Add([pscustomobject]@{
                    task_number = $currentTaskNumber
                    text = $taskMatch.Groups["text"].Value.Trim()
                })
                $section = "tasks"
                continue
            }

            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed)) {
                continue
            }
            if ($null -eq $currentTaskNumber) {
                continue
            }

            if (-not $current.task_progress_map.ContainsKey("$currentTaskNumber")) {
                $current.task_progress_map["$currentTaskNumber"] = New-Object System.Collections.Generic.List[string]
            }
            $current.task_progress_map["$currentTaskNumber"].Add($trimmed)
            $current.progress_lines.Add(("Task {0}: {1}" -f $currentTaskNumber, $trimmed))

            if ($trimmed -match $unfinishedPattern) {
                $current.unfinished_markers++
                $current.task_status_map["$currentTaskNumber"] = "partial"
            } elseif (-not $current.task_status_map.ContainsKey("$currentTaskNumber")) {
                $current.task_status_map["$currentTaskNumber"] = "implemented"
            }
        }
    }
}

if ($null -ne $current) {
    $phases.Add([pscustomobject]$current)
}

$normalized = foreach ($phase in $phases) {
    $normalizedTasks = foreach ($task in $phase.tasks) {
        $taskStatus = if ($phase.task_status_map.ContainsKey("$($task.task_number)")) {
            [string]$phase.task_status_map["$($task.task_number)"]
        } elseif ($phase.task_progress_map.ContainsKey("$($task.task_number)")) {
            $taskProgressLines = @($phase.task_progress_map["$($task.task_number)"])
            if (@($taskProgressLines | Where-Object { $_ -match $unfinishedPattern }).Count -gt 0) {
                "partial"
            } else {
                "implemented"
            }
        } elseif ($phase.progress_lines.Count -eq 0 -and $phase.phase_posture_lines.Count -eq 0) {
            "not_started"
        } else {
            "not_started"
        }

        [pscustomobject]@{
            task_number = [int]$task.task_number
            text = [string]$task.text
            status = $taskStatus
        }
    }

    $taskCounts = [pscustomobject]@{
        total = @($normalizedTasks).Count
        implemented = @($normalizedTasks | Where-Object { $_.status -eq "implemented" }).Count
        partial = @($normalizedTasks | Where-Object { $_.status -eq "partial" }).Count
        not_started = @($normalizedTasks | Where-Object { $_.status -eq "not_started" }).Count
    }
    $openTasks = @($normalizedTasks | Where-Object { $_.status -ne "implemented" })
    $residualOpenItems = @($phase.phase_open_notes | Select-Object -Unique)
    $hasProgressSignals = $phase.progress_lines.Count -gt 0 -or $phase.phase_posture_lines.Count -gt 0
    $status =
        if (-not $hasProgressSignals) {
            "not_started"
        } elseif (@($openTasks).Count -eq 0 -and @($residualOpenItems).Count -eq 0) {
            "implemented"
        } else {
            "partial"
        }

    [pscustomobject]@{
        phase_number = $phase.phase_number
        title = $phase.title
        status = $status
        task_counts = $taskCounts
        acceptance_count = $phase.acceptance_criteria.Count
        progress_line_count = $phase.progress_lines.Count
        partial_markers = $phase.partial_markers
        unfinished_markers = $phase.unfinished_markers
        acceptance_criteria = @($phase.acceptance_criteria)
        notable_progress = @($phase.progress_lines | Select-Object -First 6)
        open_task_count = @($openTasks).Count
        residual_open_item_count = @($residualOpenItems).Count
        residual_open_items = @($residualOpenItems | Select-Object -First 10)
        open_tasks = @($openTasks | Select-Object -First 10)
        tasks = @($normalizedTasks)
    }
}

$summary = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    plan_path = (Resolve-Path $PlanPath).Path
    counts = [pscustomobject]@{
        total_phases = @($normalized).Count
        implemented = @($normalized | Where-Object { $_.status -eq "implemented" }).Count
        partial = @($normalized | Where-Object { $_.status -eq "partial" }).Count
        not_started = @($normalized | Where-Object { $_.status -eq "not_started" }).Count
        total_tasks = @($normalized | ForEach-Object { $_.task_counts.total } | Measure-Object -Sum).Sum
        implemented_tasks = @($normalized | ForEach-Object { $_.task_counts.implemented } | Measure-Object -Sum).Sum
        partial_tasks = @($normalized | ForEach-Object { $_.task_counts.partial } | Measure-Object -Sum).Sum
        not_started_tasks = @($normalized | ForEach-Object { $_.task_counts.not_started } | Measure-Object -Sum).Sum
        residual_open_items = @($normalized | ForEach-Object { $_.residual_open_item_count } | Measure-Object -Sum).Sum
    }
    open_tasks = @(
        $normalized |
            ForEach-Object {
                $phase = $_
                foreach ($task in $phase.open_tasks) {
                    [pscustomobject]@{
                        phase_number = $phase.phase_number
                        phase_title = $phase.title
                        task_number = $task.task_number
                        status = $task.status
                        text = $task.text
                    }
                }
            }
    )
    open_items = @(
        $normalized |
            ForEach-Object {
                $phase = $_
                foreach ($task in $phase.open_tasks) {
                    [pscustomobject]@{
                        item_kind = "task"
                        phase_number = $phase.phase_number
                        phase_title = $phase.title
                        task_number = $task.task_number
                        status = $task.status
                        text = $task.text
                    }
                }
                foreach ($note in $phase.residual_open_items) {
                    [pscustomobject]@{
                        item_kind = "phase_note"
                        phase_number = $phase.phase_number
                        phase_title = $phase.title
                        task_number = $null
                        status = "partial"
                        text = [string]$note
                    }
                }
            }
    )
    open_phase_summaries = @(
        $normalized |
            Where-Object { $_.open_task_count -gt 0 -or $_.residual_open_item_count -gt 0 } |
            ForEach-Object {
                [pscustomobject]@{
                    phase_number = $_.phase_number
                    phase_title = $_.title
                    status = $_.status
                    open_task_count = $_.open_task_count
                    residual_open_item_count = $_.residual_open_item_count
                    total_open_item_count = ([int]$_.open_task_count + [int]$_.residual_open_item_count)
                }
            } |
            Sort-Object -Property @{ Expression = "total_open_item_count"; Descending = $true }, @{ Expression = "phase_number"; Descending = $false }
    )
    phases = @($normalized)
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $summary | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "personalos-readiness-audit.json")

    $markdown = New-Object System.Text.StringBuilder
    [void]$markdown.AppendLine("# personalOS Readiness Audit")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- generated_at: $($summary.generated_at)")
    [void]$markdown.AppendLine("- plan_path: $($summary.plan_path)")
    [void]$markdown.AppendLine("- total_phases: $($summary.counts.total_phases)")
    [void]$markdown.AppendLine("- implemented: $($summary.counts.implemented)")
    [void]$markdown.AppendLine("- partial: $($summary.counts.partial)")
    [void]$markdown.AppendLine("- not_started: $($summary.counts.not_started)")
    [void]$markdown.AppendLine("- total_tasks: $($summary.counts.total_tasks)")
    [void]$markdown.AppendLine("- implemented_tasks: $($summary.counts.implemented_tasks)")
    [void]$markdown.AppendLine("- partial_tasks: $($summary.counts.partial_tasks)")
    [void]$markdown.AppendLine("- not_started_tasks: $($summary.counts.not_started_tasks)")
    [void]$markdown.AppendLine("- residual_open_items: $($summary.counts.residual_open_items)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| phase | title | status | task_counts | open_task_count | residual_open_item_count | acceptance_count | partial_markers | unfinished_markers |")
    [void]$markdown.AppendLine("|---:|---|---|---|---:|---:|---:|---:|---:|")
    foreach ($phase in $summary.phases) {
        $taskSummary = "$($phase.task_counts.implemented)/$($phase.task_counts.partial)/$($phase.task_counts.not_started)"
        [void]$markdown.AppendLine("| $($phase.phase_number) | $($phase.title) | $($phase.status) | $taskSummary | $($phase.open_task_count) | $($phase.residual_open_item_count) | $($phase.acceptance_count) | $($phase.partial_markers) | $($phase.unfinished_markers) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Open Phase Summary")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| phase | title | status | open_task_count | residual_open_item_count | total_open_item_count |")
    [void]$markdown.AppendLine("|---:|---|---|---:|---:|---:|")
    foreach ($phase in $summary.open_phase_summaries) {
        [void]$markdown.AppendLine("| $($phase.phase_number) | $($phase.phase_title) | $($phase.status) | $($phase.open_task_count) | $($phase.residual_open_item_count) | $($phase.total_open_item_count) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Open Items")
    [void]$markdown.AppendLine()
    foreach ($item in $summary.open_items) {
        if ($item.item_kind -eq "phase_note") {
            [void]$markdown.AppendLine("- Phase $($item.phase_number) / Residual [$($item.status)]: $($item.text)")
            continue
        }
        [void]$markdown.AppendLine("- Phase $($item.phase_number) / Task $($item.task_number) [$($item.status)]: $($item.text)")
    }
    $markdown.ToString() | Set-Content (Join-Path $OutDir "personalos-readiness-audit.md")
}

Write-Output "[personalos-readiness-audit] phases=$($summary.counts.total_phases) implemented=$($summary.counts.implemented) partial=$($summary.counts.partial) not_started=$($summary.counts.not_started) total_tasks=$($summary.counts.total_tasks) open_tasks=$($summary.open_tasks.Count) residual_open_items=$($summary.counts.residual_open_items)"
