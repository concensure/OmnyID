#!/usr/bin/env python3
"""
Audit the Phase 0 / SFT corpus so later collection can be targeted.

Outputs:
  - audit JSON with counts, imbalance, duplication, and trace-shape stats
  - recommendations section highlighting likely collection gaps
"""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


DEFAULT_INPUT = Path("/workspace/training_data/cot_sft.jsonl")
DEFAULT_OUTPUT = Path("/workspace/training_data/cleaned/cot_sft.audit.summary.json")


def word_count(row: dict) -> int:
    return sum(len(message.get("content", "").split()) for message in row.get("messages", []))


def total_chars(row: dict) -> int:
    return sum(len(message.get("content", "")) for message in row.get("messages", []))


def backend_family(backend: str) -> str:
    backend = backend or ""
    if backend == "solver":
        return "solver"
    if backend.startswith("claude-direct"):
        return "claude_direct"
    if backend.startswith("claude-or"):
        return "claude_openrouter"
    if backend.startswith("deepseek"):
        return "deepseek"
    if backend.startswith("glm"):
        return "glm"
    if backend.startswith("grok"):
        return "grok"
    if backend.startswith("nim"):
        return "nim"
    if backend.startswith("cerebras"):
        return "cerebras"
    return backend or "unknown"


def build_recommendations(summary: dict) -> list[str]:
    recs = []
    solver_share = summary["shares"]["solver_rows_pct"]
    retry_share = summary["shares"]["retry_rows_pct"]
    llm_rows = summary["counts"]["raw_rows"] - summary["counts"]["solver_rows"]
    multi_trace_ids = summary["counts"]["multi_trace_ids"]
    unique_ids = summary["counts"]["unique_ids"]

    if solver_share >= 70:
        recs.append(
            f"Corpus is solver-heavy ({solver_share:.1f}% solver rows). Prioritize new non-solver traces in weak categories before another broad retry pass."
        )
    if retry_share >= 3:
        recs.append(
            f"Retry-derived traces are non-trivial ({retry_share:.1f}% of rows). Downweight them in SFT selection unless they are the only correct trace for an id."
        )
    if multi_trace_ids >= unique_ids * 0.7:
        recs.append(
            "Most puzzle ids already have multiple traces. Additional collection should target under-covered categories, not blanket retries across all failures."
        )
    if llm_rows < 2000:
        recs.append(
            f"Only about {llm_rows} rows are non-solver. Improving LLM-supervised diversity is likely higher ROI than adding more solver-style variants."
        )

    by_type = summary["problem_types"]
    scarce_types = []
    for ptype, stats in by_type.items():
        if ptype in {"gravity", "unit_conversion", "roman_numeral"}:
            continue
        if stats["rows"] < 250:
            scarce_types.append(ptype)
    if scarce_types:
        recs.append(
            "Under-covered categories need targeted Phase 0 collection: " + ", ".join(sorted(scarce_types))
        )

    long_types = []
    for ptype, stats in by_type.items():
        if stats["avg_words"] >= 600:
            long_types.append(ptype)
    if long_types:
        recs.append(
            "Some categories have very long traces and should be filtered or restyled before SFT: "
            + ", ".join(sorted(long_types))
        )

    return recs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"[ERROR] Input corpus not found: {args.input}")

    rows = []
    with args.input.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))

    by_id: dict[str, list[dict]] = defaultdict(list)
    by_type_words: dict[str, list[int]] = defaultdict(list)
    by_type_chars: dict[str, list[int]] = defaultdict(list)
    by_type_backend: dict[str, Counter] = defaultdict(Counter)
    backend_counter = Counter()
    backend_family_counter = Counter()
    quality_steps = Counter()
    rounds = Counter()

    solver_rows = 0
    retry_rows = 0

    for row in rows:
        row_id = row.get("id", "")
        by_id[row_id].append(row)

        backend = row.get("backend", "")
        ptype = row.get("problem_type", "") or "unknown"
        wc = word_count(row)
        cc = total_chars(row)

        backend_counter[backend] += 1
        backend_family_counter[backend_family(backend)] += 1
        rounds[row.get("collection_round", 1)] += 1
        by_type_words[ptype].append(wc)
        by_type_chars[ptype].append(cc)
        by_type_backend[ptype][backend_family(backend)] += 1

        for step in row.get("quality_steps", []):
            quality_steps[step] += 1

        if backend == "solver":
            solver_rows += 1
        if backend.endswith("+retry"):
            retry_rows += 1

    unique_ids = sum(1 for key in by_id if key)
    duplicate_rows = sum(len(group) - 1 for group in by_id.values() if len(group) > 1)
    multi_trace_ids = sum(1 for group in by_id.values() if len(group) > 1)

    problem_types = {}
    for ptype in sorted(by_type_words):
        words = by_type_words[ptype]
        chars = by_type_chars[ptype]
        problem_types[ptype] = {
            "rows": len(words),
            "avg_words": round(sum(words) / len(words), 1),
            "avg_chars": round(sum(chars) / len(chars), 1),
            "backend_family_mix": dict(by_type_backend[ptype].most_common()),
        }

    summary = {
        "input": str(args.input),
        "counts": {
            "raw_rows": len(rows),
            "unique_ids": unique_ids,
            "duplicate_rows": duplicate_rows,
            "multi_trace_ids": multi_trace_ids,
            "solver_rows": solver_rows,
            "retry_rows": retry_rows,
        },
        "shares": {
            "solver_rows_pct": round((solver_rows / len(rows)) * 100, 1) if rows else 0.0,
            "retry_rows_pct": round((retry_rows / len(rows)) * 100, 1) if rows else 0.0,
            "multi_trace_ids_pct": round((multi_trace_ids / unique_ids) * 100, 1) if unique_ids else 0.0,
        },
        "backend_rows": dict(backend_counter.most_common()),
        "backend_family_rows": dict(backend_family_counter.most_common()),
        "quality_steps": dict(quality_steps.most_common()),
        "collection_rounds": dict(rounds.most_common()),
        "problem_types": problem_types,
    }
    summary["recommendations"] = build_recommendations(summary)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"Input rows    : {summary['counts']['raw_rows']}")
    print(f"Unique ids    : {summary['counts']['unique_ids']}")
    print(f"Solver rows   : {summary['counts']['solver_rows']} ({summary['shares']['solver_rows_pct']}%)")
    print(f"Retry rows    : {summary['counts']['retry_rows']} ({summary['shares']['retry_rows_pct']}%)")
    print(f"Output audit  : {args.output}")
    print("Recommendations:")
    for rec in summary["recommendations"]:
        print(f"  - {rec}")


if __name__ == "__main__":
    main()
