#!/usr/bin/env python3
"""
Prepare a cleaned, deduplicated SFT corpus from Phase 0 outputs.

This script is intentionally conservative:
  - Re-extracts the final boxed answer from assistant traces
  - Re-verifies correctness against the stored ground truth
  - Re-derives problem type when metadata is missing
  - Scores competing traces for the same puzzle id
  - Keeps the single highest-quality canonical trace per puzzle
  - Emits a train-ready JSONL plus an audit report
"""

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


DEFAULT_INPUT = Path("/workspace/training_data/cot_sft.jsonl")
DEFAULT_OUTPUT_DIR = Path("/workspace/training_data/cleaned")


def extract_boxed_answer(text: str | None) -> str:
    if not text:
        return ""
    matches = re.findall(r"\\?boxed\{([^}]*)\}", text)
    return matches[-1].strip() if matches else ""


def normalize_answer(text: str | None) -> str:
    if not text:
        return ""
    text = text.strip()
    text = text.replace("\\$", "$").replace("\\;", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip().strip("`").strip()


def answers_match(predicted: str, ground_truth: str) -> bool:
    pred = normalize_answer(predicted)
    gt = normalize_answer(ground_truth)
    if pred == gt or pred.lower() == gt.lower():
        return True
    try:
        pf, gf = float(pred), float(gt)
        if gf == 0:
            return abs(pf) < 0.01
        return abs(pf - gf) / abs(gf) < 0.01
    except (ValueError, ZeroDivisionError):
        return False


def detect_problem_type(prompt: str) -> str:
    prompt_l = prompt.lower()
    if re.search(r"\b[01]{4,}\b", prompt):
        return "bit_manipulation"
    if "decrypt" in prompt_l or "secret encryption rules" in prompt_l:
        return "cipher"
    if "roman numeral" in prompt_l or "wonderland numeral system" in prompt_l:
        return "numeral"
    if "unit" in prompt_l:
        return "unit_conversion"
    if "gravity" in prompt_l:
        return "gravity"
    if "transformation" in prompt_l or "secretly converted" in prompt_l:
        return "transformation"
    if re.search(r"\b\d+\.\d+\b", prompt):
        return "decimal_float"
    return "word_pattern"


def explicit_pair_checks(text: str) -> int:
    return len(re.findall(r"\bPair\s+\d+\b", text, flags=re.I))


def score_trace(example: dict, assistant_text: str, prompt: str, predicted: str, expected: str) -> tuple[int, dict]:
    backend = example.get("backend", "")
    steps = example.get("quality_steps") or []
    word_count = len(assistant_text.split())
    pair_checks = explicit_pair_checks(assistant_text)

    score = 0
    reasons = []

    if answers_match(predicted, expected):
        score += 1000
        reasons.append("correct")
    else:
        score -= 1000
        reasons.append("incorrect")

    if "\\boxed{" in assistant_text or "boxed{" in assistant_text:
        score += 40
        reasons.append("boxed")
    if backend == "solver":
        score += 120
        reasons.append("solver")
    elif backend.endswith("+retry"):
        score -= 25
        reasons.append("retry_penalty")
    elif backend:
        score += 20
        reasons.append("direct_backend")
    if "self_consistent" in steps:
        score += 35
        reasons.append("self_consistent")
    if "reasoning_verified" in steps:
        score += 50
        reasons.append("reasoning_verified")
    if pair_checks >= 3:
        score += min(pair_checks, 8) * 8
        reasons.append("explicit_pair_checks")
    if "IDENTIFY:" in assistant_text:
        score += 10
        reasons.append("structured_trace")
    if "VERIFY:" in assistant_text:
        score += 10
        reasons.append("verify_section")
    if 40 <= word_count <= 260:
        score += 20
        reasons.append("good_length")
    elif word_count < 15:
        score -= 20
        reasons.append("too_short")
    elif word_count > 450:
        score -= 25
        reasons.append("too_long")
    if not example.get("problem_type"):
        score -= 5
        reasons.append("missing_problem_type")
    if not example.get("quality_steps"):
        score -= 5
        reasons.append("missing_quality_steps")

    metadata = {
        "backend": backend,
        "quality_steps": steps,
        "word_count": word_count,
        "pair_checks": pair_checks,
        "score": score,
        "reasons": reasons,
        "derived_problem_type": detect_problem_type(prompt),
    }
    return score, metadata


def choose_best_trace(examples: list[dict]) -> tuple[dict, list[dict]]:
    ranked = []
    for ex in examples:
        messages = ex.get("messages") or []
        user_msg = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
        assistant = next((m.get("content", "") for m in messages if m.get("role") == "assistant"), "")
        expected = normalize_answer(ex.get("expected_answer", ""))
        predicted = normalize_answer(extract_boxed_answer(assistant) or ex.get("predicted_answer", ""))
        score, metadata = score_trace(ex, assistant, user_msg, predicted, expected)
        ranked.append(
            {
                "example": ex,
                "assistant": assistant,
                "prompt": user_msg,
                "predicted": predicted,
                "expected": expected,
                "score": score,
                "metadata": metadata,
            }
        )

    ranked.sort(
        key=lambda item: (
            item["score"],
            item["metadata"]["pair_checks"],
            not item["metadata"]["backend"].endswith("+retry"),
            -item["metadata"]["word_count"],
        ),
        reverse=True,
    )
    return ranked[0], ranked


def clean_example(best: dict) -> dict:
    ex = dict(best["example"])
    ex["messages"] = [dict(message) for message in ex["messages"]]
    ex["predicted_answer"] = best["predicted"]
    ex["expected_answer"] = best["expected"]
    ex["problem_type"] = ex.get("problem_type") or best["metadata"]["derived_problem_type"]
    ex["quality_steps"] = ex.get("quality_steps") or []
    ex["cleaning_score"] = best["score"]
    ex["cleaning_notes"] = best["metadata"]["reasons"]
    ex["word_count"] = best["metadata"]["word_count"]
    ex["pair_checks"] = best["metadata"]["pair_checks"]
    return ex


def choose_top_traces(examples: list[dict], max_per_id: int) -> list[dict]:
    best, ranked = choose_best_trace(examples)
    if max_per_id <= 1:
        return [best]

    selected = []
    seen_styles = set()
    for item in ranked:
        ex = item["example"]
        style = ex.get("trace_style") or ex.get("backend") or "default"
        if style in seen_styles:
            continue
        if item["score"] < 0 or not answers_match(item["predicted"], item["expected"]):
            continue
        selected.append(item)
        seen_styles.add(style)
        if len(selected) >= max_per_id:
            break
    return selected or [best]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--max-per-id", type=int, default=1)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"[ERROR] Input corpus not found: {args.input}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    output_jsonl = args.output_dir / "cot_sft.cleaned.jsonl"
    audit_json = args.output_dir / "cot_sft.audit.json"

    raw_rows = []
    with args.input.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                raw_rows.append(json.loads(line))

    by_id = defaultdict(list)
    invalid_rows = []
    for row in raw_rows:
        row_id = row.get("id", "").strip()
        if not row_id or not row.get("messages"):
            invalid_rows.append(row)
            continue
        by_id[row_id].append(row)

    cleaned_rows = []
    duplicate_ids = 0
    backend_counter = Counter()
    problem_type_counter = Counter()
    chosen_from_retry = 0
    rejected_incorrect = 0

    for _, group in by_id.items():
        if len(group) > 1:
            duplicate_ids += 1
        selected = choose_top_traces(group, max(1, args.max_per_id))
        kept_any = False
        for item in selected:
            if item["score"] < 0 or not answers_match(item["predicted"], item["expected"]):
                continue
            cleaned = clean_example(item)
            cleaned_rows.append(cleaned)
            backend_counter[cleaned.get("backend", "")] += 1
            problem_type_counter[cleaned.get("problem_type", "")] += 1
            if cleaned.get("backend", "").endswith("+retry"):
                chosen_from_retry += 1
            kept_any = True
        if not kept_any:
            rejected_incorrect += 1

    cleaned_rows.sort(key=lambda row: row["id"])
    with output_jsonl.open("w", encoding="utf-8") as out:
        for row in cleaned_rows:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")

    audit = {
        "input_file": str(args.input),
        "output_file": str(output_jsonl),
        "raw_rows": len(raw_rows),
        "invalid_rows": len(invalid_rows),
        "unique_ids_seen": len(by_id),
        "duplicate_ids": duplicate_ids,
        "max_per_id": max(1, args.max_per_id),
        "clean_rows": len(cleaned_rows),
        "rejected_incorrect": rejected_incorrect,
        "chosen_from_retry": chosen_from_retry,
        "backend_counts": dict(backend_counter),
        "problem_type_counts": dict(problem_type_counter),
    }
    with audit_json.open("w", encoding="utf-8") as f:
        json.dump(audit, f, indent=2)

    print(f"Raw rows        : {len(raw_rows)}")
    print(f"Unique ids      : {len(by_id)}")
    print(f"Duplicate ids   : {duplicate_ids}")
    print(f"Clean rows      : {len(cleaned_rows)}")
    print(f"Audit report    : {audit_json}")
    print(f"Cleaned corpus  : {output_jsonl}")


if __name__ == "__main__":
    main()
