#!/usr/bin/env python3
"""
Diagnostic probe for stalled Phase 0 retries.

This script reuses the production collector logic from phase0-cot-generate.py,
but limits execution to a small failed sample and records why each problem did
or did not convert:

- solver_now_passes
- llm_primary_correct
- llm_retry_correct
- no_backend_response
- no_boxed_answer
- wrong_answer
- self_consistency_reject
- verifier_reject

It is intended to answer "what is blocking yield?" before another large run.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import random
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


def _load_phase0_module(module_path: Path):
    spec = importlib.util.spec_from_file_location("phase0_cot_generate", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["phase0_cot_generate"] = module
    spec.loader.exec_module(module)
    return module


def _pick(row: dict, candidates: list[str]) -> str:
    for candidate in candidates:
        if candidate in row and row[candidate]:
            return row[candidate]
    return ""


def _load_rows(module, only_types: set[str], limit_per_type: int, seed: int) -> list[dict]:
    id_cols = ["id", "problem_id", "ID"]
    prompt_cols = ["problem", "problem_statement", "question", "prompt"]
    answer_cols = ["answer", "solution", "expected_answer"]

    with open(module.TRAIN_CSV, newline="", encoding="utf-8") as handle:
        raw_rows = list(csv.DictReader(handle))

    checkpoint = {"passed": set(), "failed": set()}
    if module.CHECKPOINT_FILE.exists():
        with open(module.CHECKPOINT_FILE, encoding="utf-8") as handle:
            raw = json.load(handle)
        if isinstance(raw, list):
            checkpoint["failed"] = set(raw)
        else:
            checkpoint["passed"] = set(raw.get("passed", []))
            checkpoint["failed"] = set(raw.get("failed", []))

    rows_by_type: dict[str, list[dict]] = defaultdict(list)
    for idx, raw in enumerate(raw_rows):
        problem_id = _pick(raw, id_cols) or f"prob_{idx:05d}"
        if problem_id in checkpoint["passed"] or problem_id not in checkpoint["failed"]:
            continue

        prompt = _pick(raw, prompt_cols)
        answer = _pick(raw, answer_cols)
        if not prompt or not answer:
            continue

        problem_type = module._detect_problem_type(prompt)
        if only_types and problem_type not in only_types:
            continue

        rows_by_type[problem_type].append(
            {
                "id": problem_id,
                "prompt": prompt,
                "answer": answer.strip(),
                "problem_type": problem_type,
            }
        )

    rng = random.Random(seed)
    sampled = []
    for problem_type in sorted(rows_by_type):
        pool = rows_by_type[problem_type][:]
        rng.shuffle(pool)
        sampled.extend(pool[:limit_per_type])
    return sampled


def _summarize_backend_attempt(backend_name: str, phase: str, text: str | None, predicted: str, expected: str) -> dict:
    if text is None:
        outcome = "no_response"
    elif not predicted:
        outcome = "no_boxed_answer"
    elif predicted and expected and predicted.strip() == expected.strip():
        outcome = "correct"
    elif predicted and expected and predicted.strip().lower() == expected.strip().lower():
        outcome = "correct"
    else:
        outcome = "wrong_answer"
    return {
        "backend": backend_name,
        "phase": phase,
        "predicted": predicted,
        "outcome": outcome,
    }


def _diagnose_row(module, backends: list, row: dict, use_verify: bool, disable_self_check: bool) -> dict:
    started = time.time()
    expected = row["answer"].strip()
    prompt = row["prompt"].strip()
    problem_type = row["problem_type"]
    user_msg = prompt + (module.WORD_PATTERN_SUFFIX if problem_type == "word_pattern" else module.COT_SUFFIX)

    attempts = []
    quality_steps = []
    final_status = "unresolved"
    best_backend = None
    best_text = None
    self_check = {"performed": False, "backend": None, "predicted": "", "result": "not_run"}
    verify_check = {"performed": False, "result": "not_run"}

    if problem_type == "bit_manipulation":
        solver_result = module._try_bit_solver(prompt, expected)
        if solver_result is not None:
            elapsed = time.time() - started
            return {
                "id": row["id"],
                "problem_type": problem_type,
                "expected": expected,
                "final_status": "solver_now_passes",
                "best_backend": "solver",
                "quality_steps": ["solver"],
                "attempts": attempts,
                "self_check": self_check,
                "verify_check": verify_check,
                "elapsed_sec": round(elapsed, 3),
            }

    for backend_def, client in backends:
        if module._is_cooling(backend_def["name"]):
            attempts.append(
                {
                    "backend": backend_def["name"],
                    "phase": "primary",
                    "predicted": "",
                    "outcome": "cooldown_skip",
                }
            )
            continue

        primary_text = module._llm_call(
            backend_def,
            client,
            [
                {"role": "system", "content": module.SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )
        primary_pred = module.extract_boxed_answer(primary_text)
        primary_attempt = _summarize_backend_attempt(
            backend_def["name"], "primary", primary_text, primary_pred, expected
        )
        attempts.append(primary_attempt)

        if primary_pred and module.answers_match(primary_pred, expected):
            best_text = primary_text
            best_backend = backend_def["name"]
            quality_steps.append("llm_correct")
            final_status = "llm_primary_correct"
            break

        retry_msg = module.RETRY_PREFIX_TEMPLATE.format(
            prev_answer=primary_pred or "(no boxed answer found)",
            expected=expected,
        ) + user_msg
        retry_text = module._llm_call(
            backend_def,
            client,
            [
                {"role": "system", "content": module.SYSTEM_PROMPT},
                {"role": "user", "content": retry_msg},
            ],
        )
        retry_pred = module.extract_boxed_answer(retry_text)
        retry_attempt = _summarize_backend_attempt(
            backend_def["name"], "retry", retry_text, retry_pred, expected
        )
        attempts.append(retry_attempt)

        if retry_pred and module.answers_match(retry_pred, expected):
            best_text = f"[First attempt: {primary_pred or 'no answer'} - incorrect]\n\n{retry_text}"
            best_backend = backend_def["name"] + "+retry"
            quality_steps.append("llm_correct_on_retry")
            final_status = "llm_retry_correct"
            break

    if best_text is None:
        non_skip = [attempt for attempt in attempts if attempt["outcome"] != "cooldown_skip"]
        if non_skip and all(attempt["outcome"] == "no_response" for attempt in non_skip):
            final_status = "no_backend_response"
        elif non_skip and all(attempt["outcome"] in ("no_response", "no_boxed_answer") for attempt in non_skip):
            final_status = "no_boxed_answer"
        elif any(attempt["outcome"] == "wrong_answer" for attempt in non_skip):
            final_status = "wrong_answer"
        else:
            final_status = "unresolved"
        elapsed = time.time() - started
        return {
            "id": row["id"],
            "problem_type": problem_type,
            "expected": expected,
            "final_status": final_status,
            "best_backend": best_backend,
            "quality_steps": quality_steps,
            "attempts": attempts,
            "self_check": self_check,
            "verify_check": verify_check,
            "elapsed_sec": round(elapsed, 3),
        }

    if disable_self_check:
        self_check["result"] = "disabled"
    else:
        used_primary = (best_backend or "").replace("+retry", "")
        cheap_order = ["cerebras", "nim", "deepseek", "glm", "claude-or", "claude-direct", "grok"]
        cheap_backends = [
            (backend_def, client)
            for backend_def, client in backends
            if backend_def["name"] in cheap_order and backend_def["name"] != used_primary
        ]
        cheap_backends.sort(key=lambda item: cheap_order.index(item[0]["name"]) if item[0]["name"] in cheap_order else 99)

        if cheap_backends:
            self_backend, self_client = cheap_backends[0]
            self_check["performed"] = True
            self_check["backend"] = self_backend["name"]
            self_text = module._llm_call(
                self_backend,
                self_client,
                [
                    {"role": "system", "content": module.SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                max_tokens=600,
            )
            self_pred = module.extract_boxed_answer(self_text)
            self_check["predicted"] = self_pred
            if self_text is None:
                self_check["result"] = "no_response_fail_open"
            elif self_pred and not module.answers_match(self_pred, expected):
                self_check["result"] = "disagree"
                final_status = "self_consistency_reject"
                elapsed = time.time() - started
                return {
                    "id": row["id"],
                    "problem_type": problem_type,
                    "expected": expected,
                    "final_status": final_status,
                    "best_backend": best_backend,
                    "quality_steps": quality_steps,
                    "attempts": attempts,
                    "self_check": self_check,
                    "verify_check": verify_check,
                    "elapsed_sec": round(elapsed, 3),
                }
            else:
                self_check["result"] = "agree_or_no_boxed"
                quality_steps.append("self_consistent")

    if use_verify:
        verify_check["performed"] = True
        verifier_bds = [(backend_def, client) for backend_def, client in backends if backend_def["name"] in ("cerebras", "nim")]
        if verifier_bds:
            verified = module._verify_reasoning(verifier_bds, prompt, best_text)
            verify_check["result"] = "pass" if verified else "reject"
            if not verified:
                final_status = "verifier_reject"
                elapsed = time.time() - started
                return {
                    "id": row["id"],
                    "problem_type": problem_type,
                    "expected": expected,
                    "final_status": final_status,
                    "best_backend": best_backend,
                    "quality_steps": quality_steps,
                    "attempts": attempts,
                    "self_check": self_check,
                    "verify_check": verify_check,
                    "elapsed_sec": round(elapsed, 3),
                }
            quality_steps.append("reasoning_verified")
        else:
            verify_check["result"] = "no_verifier_available"

    elapsed = time.time() - started
    return {
        "id": row["id"],
        "problem_type": problem_type,
        "expected": expected,
        "final_status": final_status,
        "best_backend": best_backend,
        "quality_steps": quality_steps,
        "attempts": attempts,
        "self_check": self_check,
        "verify_check": verify_check,
        "elapsed_sec": round(elapsed, 3),
    }


def main():
    parser = argparse.ArgumentParser(description="Diagnose Phase 0 failed-sample failure modes.")
    parser.add_argument("--module-path", default="/workspace/phase0-cot-generate.py")
    parser.add_argument("--only-types", default="bit_manipulation,word_pattern")
    parser.add_argument("--per-type", type=int, default=12)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--disable-self-check", action="store_true")
    parser.add_argument("--backend-names", default="")
    parser.add_argument("--max-retries-per-backend", type=int, default=1)
    parser.add_argument("--request-timeout-sec", type=float, default=45.0)
    parser.add_argument("--output-json", default="/workspace/logs/phase0_diagnostic_probe.json")
    parser.add_argument("--output-md", default="/workspace/logs/phase0_diagnostic_probe.md")
    args = parser.parse_args()

    module = _load_phase0_module(Path(args.module_path))
    only_types = {item.strip() for item in args.only_types.split(",") if item.strip()}
    sampled_rows = _load_rows(module, only_types, args.per_type, args.seed)
    if not sampled_rows:
        raise SystemExit("No failed rows found for the requested types.")

    backends = module.build_clients()
    if args.max_retries_per_backend > 0:
        module.MAX_RETRIES_PER_BACKEND = args.max_retries_per_backend
    backends = [
        (
            backend_def,
            client.with_options(timeout=args.request_timeout_sec)
            if hasattr(client, "with_options")
            else client,
        )
        for backend_def, client in backends
    ]
    if args.backend_names:
        allowed = {item.strip() for item in args.backend_names.split(",") if item.strip()}
        backends = [(backend_def, client) for backend_def, client in backends if backend_def["name"] in allowed]
        if not backends:
            raise SystemExit("No active backends remain after --backend-names filtering.")

    per_item = []
    final_status_counts = Counter()
    status_by_type: dict[str, Counter] = defaultdict(Counter)
    backend_phase_outcomes: dict[str, Counter] = defaultdict(Counter)

    for index, row in enumerate(sampled_rows, start=1):
        result = _diagnose_row(
            module,
            backends,
            row,
            use_verify=args.verify,
            disable_self_check=args.disable_self_check,
        )
        per_item.append(result)
        final_status_counts[result["final_status"]] += 1
        status_by_type[result["problem_type"]][result["final_status"]] += 1
        for attempt in result["attempts"]:
            backend_phase_outcomes[attempt["backend"]][f"{attempt['phase']}:{attempt['outcome']}"] += 1
        print(
            f"[{index}/{len(sampled_rows)}] {row['id']} {row['problem_type']} -> "
            f"{result['final_status']} ({result['elapsed_sec']}s)"
        )

    elapsed_values = [item["elapsed_sec"] for item in per_item]
    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sample_size": len(per_item),
        "types": sorted({item["problem_type"] for item in per_item}),
        "per_type_limit": args.per_type,
        "final_status_counts": dict(final_status_counts),
        "status_by_type": {problem_type: dict(counts) for problem_type, counts in status_by_type.items()},
        "backend_phase_outcomes": {backend: dict(counts) for backend, counts in backend_phase_outcomes.items()},
        "elapsed_sec": {
            "min": min(elapsed_values),
            "median": round(statistics.median(elapsed_values), 3),
            "max": max(elapsed_values),
            "mean": round(statistics.mean(elapsed_values), 3),
        },
        "items": per_item,
    }

    output_json = Path(args.output_json)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    lines = [
        "# Phase 0 Diagnostic Probe",
        "",
        f"- Generated: {summary['timestamp']}",
        f"- Sample size: {summary['sample_size']}",
        f"- Types: {', '.join(summary['types'])}",
        f"- Per-type limit: {args.per_type}",
        "",
        "## Final Status Counts",
    ]
    for status, count in final_status_counts.most_common():
        lines.append(f"- {status}: {count}")
    lines.extend(["", "## By Type"])
    for problem_type in sorted(status_by_type):
        lines.append(f"- {problem_type}: {dict(status_by_type[problem_type])}")
    lines.extend(["", "## Backend Attempt Outcomes"])
    for backend in sorted(backend_phase_outcomes):
        lines.append(f"- {backend}: {dict(backend_phase_outcomes[backend])}")
    lines.extend(["", "## Per Item"])
    for item in per_item:
        lines.append(
            f"- {item['id']} [{item['problem_type']}] -> {item['final_status']} "
            f"(backend={item['best_backend']}, elapsed={item['elapsed_sec']}s)"
        )

    output_md = Path(args.output_md)
    output_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {output_json}")
    print(f"Wrote {output_md}")


if __name__ == "__main__":
    main()
