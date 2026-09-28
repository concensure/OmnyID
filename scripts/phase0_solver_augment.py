#!/usr/bin/env python3
"""
Add a second concise trace style for deterministic solver-solvable puzzles.

This augmentation deliberately does not touch the passed/failed checkpoint,
because it does not solve new puzzle ids. It only adds additional high-quality
training traces for already-solved deterministic categories.
"""

import csv
import importlib.util
import json
from pathlib import Path


WORKSPACE = Path("/workspace")
TRAIN_CSV = WORKSPACE / "kaggle-data" / "train.csv"
OUTPUT_JSONL = WORKSPACE / "training_data" / "cot_sft.jsonl"
PHASE0_SCRIPT = WORKSPACE / "phase0-cot-generate.py"


def load_phase0_module():
    spec = importlib.util.spec_from_file_location("phase0_module", PHASE0_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def already_augmented_ids() -> set[str]:
    augmented = set()
    if not OUTPUT_JSONL.exists():
        return augmented
    with OUTPUT_JSONL.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            if row.get("trace_style") == "solver_concise":
                augmented.add(row.get("id", ""))
    return augmented


def concise_trace(problem_type: str, answer: str) -> str:
    if problem_type == "roman_numeral":
        return (
            "1. IDENTIFY: Roman numeral conversion.\n"
            "2. VERIFY: The examples match standard Roman numeral rules.\n"
            f"3. APPLY: Convert the query value directly.\n"
            f"4. ANSWER: \\boxed{{{answer}}}"
        )
    if problem_type == "gravity":
        return (
            "1. IDENTIFY: Gravity formula d = 0.5 * g * t^2.\n"
            "2. VERIFY: Infer one consistent g from the examples.\n"
            "3. APPLY: Use that g on the query time.\n"
            f"4. ANSWER: \\boxed{{{answer}}}"
        )
    if problem_type in ("unit_conversion", "decimal_float"):
        return (
            "1. IDENTIFY: Linear unit conversion.\n"
            "2. VERIFY: Fit one linear rule that matches the examples.\n"
            "3. APPLY: Evaluate that rule on the query measurement.\n"
            f"4. ANSWER: \\boxed{{{answer}}}"
        )
    if problem_type == "bit_manipulation":
        return (
            "1. IDENTIFY: Bit manipulation rule.\n"
            "2. VERIFY: Apply the same deterministic transformation to each example.\n"
            "3. APPLY: Transform the query bits.\n"
            f"4. ANSWER: \\boxed{{{answer}}}"
        )
    return f"\\boxed{{{answer}}}"


def main() -> None:
    phase0 = load_phase0_module()
    augmented_ids = already_augmented_ids()

    rows = list(csv.DictReader(TRAIN_CSV.open(newline="", encoding="utf-8")))
    added = 0

    with OUTPUT_JSONL.open("a", encoding="utf-8") as out:
        for row in rows:
            row_id = row["id"]
            if row_id in augmented_ids:
                continue

            prompt = row["prompt"].strip()
            expected = row["answer"].strip()
            prob_type = phase0._detect_problem_type(prompt)
            solver_result = None

            if prob_type == "bit_manipulation":
                solver_result = phase0._try_bit_solver(prompt, expected)
            elif prob_type == "roman_numeral":
                solver_result = phase0._try_roman_solver(prompt, expected)
            elif prob_type == "gravity":
                solver_result = phase0._try_gravity_solver(prompt, expected)
            elif prob_type in ("unit_conversion", "decimal_float"):
                solver_result = phase0._try_linear_unit_solver(prompt, expected)

            if solver_result is None:
                continue

            answer = solver_result["answer"]
            user_msg = prompt + phase0.COT_SUFFIX
            ex = phase0._make_example(
                row_id,
                user_msg,
                concise_trace(prob_type, answer),
                answer,
                expected,
                "solver",
                prob_type,
                ["solver", "augmented"],
                102,
            )
            ex["trace_style"] = "solver_concise"
            out.write(json.dumps(ex, ensure_ascii=False) + "\n")
            out.flush()
            added += 1

    print(f"Added concise solver variants: {added}")


if __name__ == "__main__":
    main()
