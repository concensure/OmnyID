#!/usr/bin/env python3
"""
Bulk-backfill deterministic Phase 0 examples for solver-recoverable failed items.

This script imports the existing Phase 0 helper logic so the generated examples
match the same JSONL schema and metadata conventions as the main collector.
It is designed to rapidly harvest solver-solvable problems from the failed
backlog without paying model API cost.
"""

import csv
import importlib.util
import json
from pathlib import Path


WORKSPACE = Path("/workspace")
TRAIN_CSV = WORKSPACE / "kaggle-data" / "train.csv"
OUTPUT_JSONL = WORKSPACE / "training_data" / "cot_sft.jsonl"
CHECKPOINT_JSON = WORKSPACE / "training_data" / "phase0_checkpoint.json"
PHASE0_SCRIPT = WORKSPACE / "phase0-cot-generate.py"


def load_phase0_module():
    spec = importlib.util.spec_from_file_location("phase0_module", PHASE0_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def load_checkpoint() -> dict[str, set[str]]:
    ckpt = {"passed": set(), "failed": set()}
    if CHECKPOINT_JSON.exists():
        raw = json.loads(CHECKPOINT_JSON.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            ckpt["passed"] = set(raw.get("passed", []))
            ckpt["failed"] = set(raw.get("failed", []))
    if OUTPUT_JSONL.exists():
        with OUTPUT_JSONL.open(encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                except Exception:
                    continue
                row_id = row.get("id")
                if row_id:
                    ckpt["passed"].add(row_id)
                    ckpt["failed"].discard(row_id)
    return ckpt


def save_checkpoint(ckpt: dict[str, set[str]]) -> None:
    CHECKPOINT_JSON.write_text(
        json.dumps(
            {
                "passed": sorted(ckpt["passed"]),
                "failed": sorted(ckpt["failed"]),
            }
        ),
        encoding="utf-8",
    )


def main() -> None:
    phase0 = load_phase0_module()
    ckpt = load_checkpoint()

    rows = list(csv.DictReader(TRAIN_CSV.open(newline="", encoding="utf-8")))
    added = 0
    solver_counts: dict[str, int] = {"roman": 0, "gravity": 0, "unit": 0, "bit": 0}

    with OUTPUT_JSONL.open("a", encoding="utf-8") as out:
        for row in rows:
            row_id = row["id"]
            if row_id in ckpt["passed"]:
                continue

            prompt = row["prompt"].strip()
            expected = row["answer"].strip()
            prob_type = phase0._detect_problem_type(prompt)
            solver_result = None
            solver_kind = None

            if prob_type == "bit_manipulation":
                solver_result = phase0._try_bit_solver(prompt, expected)
                solver_kind = "bit"
            elif prob_type == "roman_numeral":
                solver_result = phase0._try_roman_solver(prompt, expected)
                solver_kind = "roman"
            elif prob_type == "gravity":
                solver_result = phase0._try_gravity_solver(prompt, expected)
                solver_kind = "gravity"
            elif prob_type in ("unit_conversion", "decimal_float"):
                solver_result = phase0._try_linear_unit_solver(prompt, expected)
                solver_kind = "unit"

            if solver_result is None:
                continue

            user_msg = prompt + phase0.COT_SUFFIX
            ex = phase0._make_example(
                row_id,
                user_msg,
                solver_result["cot"],
                solver_result["answer"],
                expected,
                "solver",
                prob_type,
                ["solver"],
                101,
            )
            out.write(json.dumps(ex, ensure_ascii=False) + "\n")
            out.flush()
            ckpt["passed"].add(row_id)
            ckpt["failed"].discard(row_id)
            added += 1
            if solver_kind:
                solver_counts[solver_kind] += 1

    save_checkpoint(ckpt)

    print(f"Added solver examples: {added}")
    print(f"Breakdown: {solver_counts}")
    print(f"Total passed now: {len(ckpt['passed'])}")
    print(f"Remaining failed: {len(ckpt['failed'])}")


if __name__ == "__main__":
    main()
