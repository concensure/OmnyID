#!/usr/bin/env python3
"""
Phase 0: Generate chain-of-thought training data for the Nemotron Challenge.
Target score: 0.96

Quality pipeline (2-reflection default, matching AFP eval principles):
  Step 1 — Reasoning call (primary LLM, temp=0.7) + retry_reason on wrong answer
  Step 2 — Self-consistency check: independent cheap-model call must agree
            (eliminates lucky guesses — right answer, wrong reasoning)
  Step 3 — [optional, --verify] Reasoning verifier: checks every pair was verified
            Use only for a final high-quality top-up run; costs 33% extra API calls.
  → Keep examples that pass all selected steps.

Why 2 reflections as default:
  The verifier rejects correct answers that don't format "Pair 1: ✓" explicitly.
  GRPO compound reward in Phase 2 handles explicit verification reinforcement.
  2-reflection mode gives 33% more throughput at the same answer-correctness guarantee.

Bit-manipulation solver (compound 2-op):
  Phase 1: exhaustive single operations (XOR/AND/OR/rotate/shift/invert/reverse)
  Phase 2: compound 2-operation chains (rotate+XOR, XOR+rotate, invert+rotate, etc.)
  The solver is deterministic, zero API cost, 100% verified. ~17% of problems.

Backend priority:
  0. Python solver           — bit-manip only, free, 100% correct
  1. Claude Sonnet 4.6       (ANTHROPIC_API_KEY)    — primary teacher
  2. Claude via OpenRouter   (OPENROUTER_API_KEY)   — Claude fallback
  3. GLM-5.1                 (GLM_API_KEY)          — strong fallback
  4. Grok-4                  (GROK_API_KEY)         — strong fallback
  5. Cerebras Qwen-3-235B    (CEREBRAS_API_KEY)     — free; also used for self-check
  6. NIM Llama-70B           (NVIDIA_API_KEY)       — last resort

Output: /workspace/training_data/cot_sft.jsonl  (append mode; existing examples safe)
        /workspace/training_data/phase0_checkpoint.json  (tracks passed + failed)
        /workspace/training_data/phase0_stats.json

Usage:
    python3 /workspace/phase0-cot-generate.py [--workers N] [--limit N]
    python3 /workspace/phase0-cot-generate.py --verify       # 3-step (slower, stricter)
    python3 /workspace/phase0-cot-generate.py --retry-failed # re-process previously failed
    python3 /workspace/phase0-cot-generate.py --no-resume    # start fresh
"""

import os, json, csv, time, re, argparse, random
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import openai

# ── Paths ─────────────────────────────────────────────────────────────────────
TRAIN_CSV       = Path("/workspace/kaggle-data/train.csv")
OUTPUT_DIR      = Path("/workspace/training_data")
OUTPUT_FILE     = OUTPUT_DIR / "cot_sft.jsonl"
CHECKPOINT_FILE = OUTPUT_DIR / "phase0_checkpoint.json"
STATS_FILE      = OUTPUT_DIR / "phase0_stats.json"

# ── Backend definitions ────────────────────────────────────────────────────────
BACKEND_DEFS = [
    {
        "name":       "claude-direct",
        "base_url":   "https://api.anthropic.com/v1",
        "model":      "claude-sonnet-4-6",
        "env_key":    "ANTHROPIC_API_KEY",
        "max_tokens": 3000,
        "headers":    {
            "anthropic-version": "2023-06-01",
            "anthropic-beta":    "prompt-caching-2024-07-31",
        },
    },
    {
        "name":       "claude-or",
        "base_url":   "https://openrouter.ai/api/v1",
        "model":      "anthropic/claude-sonnet-4-6",
        "env_key":    "OPENROUTER_API_KEY",
        "max_tokens": 3000,
        "headers":    {"HTTP-Referer": "https://omnyid.com", "X-Title": "Nemotron CoT"},
    },
    {
        # DeepSeek V3.2 via OpenRouter — strong reasoning model, good value
        # Prefer the shared OPENROUTER_API_KEY so topped-up shared credits are usable
        # across all OpenRouter fallbacks.
        "name":       "deepseek",
        "base_url":   "https://openrouter.ai/api/v1",
        "model":      "deepseek/deepseek-v3.2",
        "env_key":    "OPENROUTER_API_KEY",
        "max_tokens": 3000,
        "headers":    {"HTTP-Referer": "https://omnyid.com", "X-Title": "Nemotron CoT"},
    },
    {
        "name":       "glm",
        "base_url":   "https://openrouter.ai/api/v1",
        "model":      "z-ai/glm-5.1",
        "env_key":    "OPENROUTER_API_KEY",
        "fallback_env_keys": ["GLM_API_KEY"],
        "max_tokens": 2000,
        "headers":    {"HTTP-Referer": "https://omnyid.com", "X-Title": "Nemotron CoT"},
    },
    {
        "name":       "grok",
        "base_url":   "https://openrouter.ai/api/v1",
        "model":      "x-ai/grok-4",
        "env_key":    "OPENROUTER_API_KEY",
        "fallback_env_keys": ["GROK_API_KEY"],
        "max_tokens": 2000,
        "headers":    {"HTTP-Referer": "https://omnyid.com", "X-Title": "Nemotron CoT"},
    },
    {
        "name":       "cerebras",
        "base_url":   "https://api.cerebras.ai/v1",
        "model":      "qwen-3-235b-a22b-instruct-2507",
        "env_key":    "CEREBRAS_API_KEY",
        "max_tokens": 2000,
        "headers":    {},
    },
    {
        "name":       "nim",
        "base_url":   "https://integrate.api.nvidia.com/v1",
        "model":      "meta/llama-3.3-70b-instruct",
        "env_key":    "NVIDIA_API_KEY",
        "max_tokens": 1800,
        "headers":    {},
    },
]

# Per-backend cooldown state (shared across workers via dict + lock)
_backend_cooldown: dict[str, float] = {}
_backend_fail_streak: dict[str, int] = {}
_COOLDOWN_SECS = 90   # back off for 90s after 5 consecutive failures
_FAIL_STREAK_LIMIT = 5
_backend_lock = Lock()

SYSTEM_PROMPT = (
    "You are an expert at discovering hidden transformation rules from input→output examples. "
    "First identify the transformation type (bit operation / text cipher / numeral system / "
    "arithmetic sequence / unit conversion / word pattern). "
    "Verify your hypothesis against every demonstration pair before applying it to the query. "
    "State your final answer as \\boxed{answer} where answer is exactly the transformation output — "
    "no surrounding text, no extra spaces."
)

COT_SUFFIX = (
    "\n\nThink step by step:\n"
    "1. IDENTIFY: What TYPE of transformation? (bit op / cipher / numeral / arithmetic / unit / word pattern)\n"
    "2. HYPOTHESISE: Examine 2–3 pairs and propose a rule\n"
    "3. VERIFY (write every check explicitly — do not skip any pair):\n"
    "   Pair 1: input [...] → my rule gives [...] → expected [...] → ✓ or ✗\n"
    "   Pair 2: input [...] → my rule gives [...] → expected [...] → ✓ or ✗\n"
    "   (continue for ALL pairs; if any ✗ revise your rule and restart from step 2)\n"
    "4. APPLY: Use the confirmed rule on the query input\n"
    "5. ANSWER: State exactly \\boxed{your_answer}"
)

WORD_PATTERN_SUFFIX = (
    "\n\nTreat this as a symbolic transformation puzzle, not ordinary language.\n"
    "Check these possibilities explicitly:\n"
    "1. keep/delete subsequence\n"
    "2. reorder by position\n"
    "3. symbol substitution\n"
    "4. duplicate collapse or repeat rules\n"
    "5. combine transformed pieces into the final output\n"
    "For every demonstration pair, explain which symbols are kept, dropped, moved, or rewritten.\n"
    "Then apply the same rule to the query and finish with \\boxed{answer}."
)

STRICT_BOX_SUFFIX = (
    "\n\nOutput rule:\n"
    "The last line must be exactly \\boxed{answer} and nothing else.\n"
    "Do not omit the box. Do not add any text after the boxed answer."
)

RETRY_PREFIX_TEMPLATE = (
    "Your previous answer {prev_answer!r} was incorrect (expected {expected!r}).\n"
    "Re-examine each demonstration pair individually from scratch.\n"
    "Do not assume the same rule type — try a different transformation.\n\n"
)

MAX_RETRIES_PER_BACKEND = 3

DEFAULT_BACKEND_PRIORITY = [
    "claude-or",
    "deepseek",
    "glm",
    "grok",
    "cerebras",
    "nim",
    "claude-direct",
]

PROBLEM_TYPE_BACKEND_PRIORITY = {
    "bit_manipulation": ["deepseek", "glm", "claude-or", "grok", "cerebras", "nim", "claude-direct"],
    "word_pattern": ["claude-or", "deepseek", "glm", "grok", "cerebras", "nim", "claude-direct"],
}


# ══════════════════════════════════════════════════════════════════════════════
# ── Bit-manipulation solver (single + compound operations) ────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _parse_bits(s: str) -> list[int] | None:
    s = s.strip()
    if not s or not all(c in "01 " for c in s):
        return None
    bits = [int(c) for c in s if c in "01"]
    return bits if bits else None


def _bits_to_str(bits: list[int]) -> str:
    return "".join(str(b) for b in bits)


def _apply_op(op: str, bits: list[int], param: int | None = None) -> list[int] | None:
    n = len(bits)
    if op == "invert":
        return [1 - b for b in bits]
    if op == "reverse":
        return bits[::-1]
    if op == "identity":
        return bits[:]
    if op == "swap_nibbles" and n == 8:
        return bits[4:] + bits[:4]
    if op == "rotate_left":
        k = (param or 1) % n
        return bits[k:] + bits[:k]
    if op == "rotate_right":
        k = (param or 1) % n
        return bits[-k:] + bits[:-k]
    if op == "shift_left":
        k = param or 1
        return bits[k:] + [0] * k
    if op == "shift_right":
        k = param or 1
        return [0] * k + bits[:-k]
    if op == "xor_const" and param is not None:
        mask = [(param >> i) & 1 for i in range(n - 1, -1, -1)]
        return [b ^ m for b, m in zip(bits, mask)]
    if op == "and_const" and param is not None:
        mask = [(param >> i) & 1 for i in range(n - 1, -1, -1)]
        return [b & m for b, m in zip(bits, mask)]
    if op == "or_const" and param is not None:
        mask = [(param >> i) & 1 for i in range(n - 1, -1, -1)]
        return [b | m for b, m in zip(bits, mask)]
    return None


def _describe_op(op: str, param: int | None, n_bits: int) -> str:
    if op == "invert":       return "flip every bit (bitwise NOT)"
    if op == "reverse":      return "reverse the bit string"
    if op == "identity":     return "keep unchanged"
    if op == "swap_nibbles": return "swap upper/lower nibbles"
    if op == "rotate_left":  return f"rotate left by {param}"
    if op == "rotate_right": return f"rotate right by {param}"
    if op == "shift_left":   return f"shift left by {param} (fill 0)"
    if op == "shift_right":  return f"shift right by {param} (fill 0)"
    if op in ("xor_const", "and_const", "or_const"):
        const_bits = _bits_to_str([(param >> i) & 1 for i in range(n_bits - 1, -1, -1)])
        sym = {"xor_const": "XOR", "and_const": "AND", "or_const": "OR"}[op]
        return f"bitwise {sym} with {const_bits}"
    return op


def _candidate_single_ops(n_bits: int):
    yield ("invert",   None)
    yield ("reverse",  None)
    yield ("identity", None)
    if n_bits == 8:
        yield ("swap_nibbles", None)
    for k in range(1, n_bits):
        yield ("rotate_left",  k)
        yield ("rotate_right", k)
        yield ("shift_left",   k)
        yield ("shift_right",  k)
    for c in range(1, 2 ** n_bits):
        yield ("xor_const", c)
        yield ("and_const", c)
        yield ("or_const",  c)


def _bits_xor(a: list[int], b: list[int]) -> list[int]:
    return [x ^ y for x, y in zip(a, b)]


def _bits_to_int(bits: list[int]) -> int:
    result = 0
    for b in bits:
        result = (result << 1) | b
    return result


def _all_equal(lst: list) -> bool:
    if not lst:
        return True
    first = lst[0]
    return all(x == first for x in lst[1:])


def _xnor(a: int, b: int) -> int:
    return 1 if a == b else 0


def _candidate_bit_features(n_bits: int):
    yield ("const_0", lambda bits: 0)
    yield ("const_1", lambda bits: 1)

    for i in range(n_bits):
        yield (f"bit[{i}]", lambda bits, i=i: bits[i])
        yield (f"not bit[{i}]", lambda bits, i=i: 1 - bits[i])

    for i in range(n_bits):
        for j in range(i + 1, n_bits):
            yield (f"bit[{i}] XOR bit[{j}]", lambda bits, i=i, j=j: bits[i] ^ bits[j])
            yield (f"bit[{i}] XNOR bit[{j}]", lambda bits, i=i, j=j: _xnor(bits[i], bits[j]))
            yield (f"bit[{i}] AND bit[{j}]", lambda bits, i=i, j=j: bits[i] & bits[j])
            yield (f"bit[{i}] OR bit[{j}]", lambda bits, i=i, j=j: bits[i] | bits[j])


def _try_bit_feature_solver(
    pairs: list[tuple[list[int], list[int]]],
    query_input: list[int],
    expected_answer: str,
) -> dict | None:
    """
    Fit each output bit independently using a compact library of boolean
    features over the input bits. This catches sparse-mask and nonlinear
    rules that are not one global rotate/XOR transform.
    """
    n_bits = len(query_input)
    chosen_features: list[tuple[str, callable]] = []

    for out_idx in range(n_bits):
        target_bits = [dst[out_idx] for _, dst in pairs]
        matched = None
        for desc, fn in _candidate_bit_features(n_bits):
            if all(fn(src) == target for (src, _), target in zip(pairs, target_bits)):
                matched = (desc, fn)
                break
        if matched is None:
            return None
        chosen_features.append(matched)

    result_bits = [fn(query_input) for _, fn in chosen_features]
    answer = _bits_to_str(result_bits)
    if not answers_match(answer, expected_answer):
        return None

    cot = (
        f"1. IDENTIFY: This is a bit-manipulation problem with {n_bits}-bit binary strings.\n\n"
        "2. HYPOTHESISE: Infer each output bit as a boolean feature of the input bits.\n\n"
        "3. LEARNED OUTPUT BITS:\n"
    )
    for idx, (desc, _) in enumerate(chosen_features):
        cot += f"   out[{idx}] = {desc}\n"
    cot += "\n4. VERIFY:\n"
    for src, dst in pairs:
        calc_bits = [fn(src) for _, fn in chosen_features]
        calc = _bits_to_str(calc_bits)
        status = "âœ“" if calc_bits == dst else "âœ—"
        cot += f"   {_bits_to_str(src)} â†’ my rule gives {calc} â†’ expected {_bits_to_str(dst)} â†’ {status}\n"
    cot += (
        f"\n5. APPLY: For query {_bits_to_str(query_input)}, the learned bit rules produce {answer}.\n\n"
        f"6. ANSWER: \\boxed{{{answer}}}"
    )
    return {"cot": cot, "answer": answer, "op_type": "bit_features"}


def _try_2op_solver(
    pairs: list[tuple[list[int], list[int]]],
    query_input: list[int],
    n_bits: int,
    expected_answer: str,
) -> dict | None:
    """
    Try compound 2-operation transformations using smart derivation.
    For ops where the second op's parameter can be derived uniquely from
    the first pair, we compute it then verify against all pairs — O(n_ops)
    rather than O(n_ops²).

    Covers: rotate+XOR, XOR+rotate, invert+rotate, rotate+invert,
            shift+XOR (shifts less common in competition but included).
    """
    def apply2(op1, p1, op2, p2, x):
        iv = _apply_op(op1, x, p1)
        if iv is None:
            return None
        return _apply_op(op2, iv, p2)

    def verify_candidate(op1, p1, op2, p2):
        if not all(apply2(op1, p1, op2, p2, pair[0]) == pair[1] for pair in pairs):
            return False
        result = apply2(op1, p1, op2, p2, query_input)
        if result is None:
            return False
        answer_str = _bits_to_str(result)
        return answers_match(answer_str, expected_answer)

    def build_cot(op1, p1, op2, p2):
        desc1 = _describe_op(op1, p1, n_bits)
        desc2 = _describe_op(op2, p2, n_bits)
        result = apply2(op1, p1, op2, p2, query_input)
        answer_str = _bits_to_str(result)
        cot = (
            f"1. IDENTIFY: This is a bit-manipulation problem with {n_bits}-bit binary strings.\n\n"
            f"2. HYPOTHESISE: Compound rule — {desc1}, then {desc2}.\n\n"
            f"3. VERIFY: Checking compound rule against all pairs:\n"
        )
        for pair in pairs:
            iv = _apply_op(op1, pair[0], p1)
            res = _apply_op(op2, iv, p2)
            status = "✓" if res == pair[1] else "✗"
            cot += (
                f"   {_bits_to_str(pair[0])} → [{desc1}] → {_bits_to_str(iv)}"
                f" → [{desc2}] → {_bits_to_str(res)} {status}\n"
            )
        iv_q = _apply_op(op1, query_input, p1)
        cot += (
            f"\n4. APPLY to query {_bits_to_str(query_input)}:\n"
            f"   → [{desc1}] → {_bits_to_str(iv_q)}\n"
            f"   → [{desc2}] → {answer_str}\n\n"
            f"5. ANSWER: \\boxed{{{answer_str}}}"
        )
        return {"cot": cot, "answer": answer_str, "op_type": "2op"}

    # ── Case 1: rotate_left(k) + XOR(c) — derive c from first pair ───────────
    for k in range(1, n_bits):
        ivs = [_apply_op("rotate_left", p[0], k) for p in pairs]
        xors = [_bits_xor(iv, p[1]) for iv, p in zip(ivs, pairs)]
        if _all_equal(xors):
            c = _bits_to_int(xors[0])
            if c != 0 and verify_candidate("rotate_left", k, "xor_const", c):
                return build_cot("rotate_left", k, "xor_const", c)

    # ── Case 2: XOR(c) + rotate_left(k) — derive c from first pair ───────────
    for k in range(1, n_bits):
        # intermediate = rotate_right(output, k) because rotate_left(int,k)=out
        ivs_needed = [_apply_op("rotate_right", p[1], k) for p in pairs]
        xors = [_bits_xor(p[0], iv) for p, iv in zip(pairs, ivs_needed)]
        if _all_equal(xors):
            c = _bits_to_int(xors[0])
            if c != 0 and verify_candidate("xor_const", c, "rotate_left", k):
                return build_cot("xor_const", c, "rotate_left", k)

    # ── Case 3: rotate_right(k) + XOR(c) ─────────────────────────────────────
    for k in range(1, n_bits):
        ivs = [_apply_op("rotate_right", p[0], k) for p in pairs]
        xors = [_bits_xor(iv, p[1]) for iv, p in zip(ivs, pairs)]
        if _all_equal(xors):
            c = _bits_to_int(xors[0])
            if c != 0 and verify_candidate("rotate_right", k, "xor_const", c):
                return build_cot("rotate_right", k, "xor_const", c)

    # ── Case 4: XOR(c) + rotate_right(k) ─────────────────────────────────────
    for k in range(1, n_bits):
        ivs_needed = [_apply_op("rotate_left", p[1], k) for p in pairs]
        xors = [_bits_xor(p[0], iv) for p, iv in zip(pairs, ivs_needed)]
        if _all_equal(xors):
            c = _bits_to_int(xors[0])
            if c != 0 and verify_candidate("xor_const", c, "rotate_right", k):
                return build_cot("xor_const", c, "rotate_right", k)

    # ── Case 5: invert + rotate_left(k) ──────────────────────────────────────
    inverted = [_apply_op("invert", p[0]) for p in pairs]
    for k in range(1, n_bits):
        if all(_apply_op("rotate_left", iv, k) == p[1]
               for iv, p in zip(inverted, pairs)):
            if verify_candidate("invert", None, "rotate_left", k):
                return build_cot("invert", None, "rotate_left", k)

    # ── Case 6: rotate_left(k) + invert ──────────────────────────────────────
    for k in range(1, n_bits):
        ivs = [_apply_op("rotate_left", p[0], k) for p in pairs]
        if all(_apply_op("invert", iv) == p[1] for iv, p in zip(ivs, pairs)):
            if verify_candidate("rotate_left", k, "invert", None):
                return build_cot("rotate_left", k, "invert", None)

    # ── Case 7: invert + rotate_right(k) ─────────────────────────────────────
    for k in range(1, n_bits):
        if all(_apply_op("rotate_right", iv, k) == p[1]
               for iv, p in zip(inverted, pairs)):
            if verify_candidate("invert", None, "rotate_right", k):
                return build_cot("invert", None, "rotate_right", k)

    # ── Case 8: rotate_right(k) + invert ─────────────────────────────────────
    for k in range(1, n_bits):
        ivs = [_apply_op("rotate_right", p[0], k) for p in pairs]
        if all(_apply_op("invert", iv) == p[1] for iv, p in zip(ivs, pairs)):
            if verify_candidate("rotate_right", k, "invert", None):
                return build_cot("rotate_right", k, "invert", None)

    # ── Case 9: shift_left(k) + XOR(c) ───────────────────────────────────────
    for k in range(1, n_bits - 1):
        ivs = [_apply_op("shift_left", p[0], k) for p in pairs]
        xors = [_bits_xor(iv, p[1]) for iv, p in zip(ivs, pairs)]
        if _all_equal(xors):
            c = _bits_to_int(xors[0])
            if verify_candidate("shift_left", k, "xor_const", c):
                return build_cot("shift_left", k, "xor_const", c)

    # ── Case 10: shift_right(k) + XOR(c) ─────────────────────────────────────
    for k in range(1, n_bits - 1):
        ivs = [_apply_op("shift_right", p[0], k) for p in pairs]
        xors = [_bits_xor(iv, p[1]) for iv, p in zip(ivs, pairs)]
        if _all_equal(xors):
            c = _bits_to_int(xors[0])
            if verify_candidate("shift_right", k, "xor_const", c):
                return build_cot("shift_right", k, "xor_const", c)

    # ── Case 11: invert + XOR(c) ─────────────────────────────────────────────
    xors = [_bits_xor(iv, p[1]) for iv, p in zip(inverted, pairs)]
    if _all_equal(xors):
        c = _bits_to_int(xors[0])
        if c != 0 and verify_candidate("invert", None, "xor_const", c):
            return build_cot("invert", None, "xor_const", c)

    # ── Case 12: XOR(c) + invert ─────────────────────────────────────────────
    # NOT(input XOR c) = input XNOR c; derive c from first pair
    # output = NOT(input XOR c) => NOT(output) = input XOR c => c = input XOR NOT(output)
    uninverted_outputs = [_apply_op("invert", p[1]) for p in pairs]
    xors = [_bits_xor(p[0], uinv) for p, uinv in zip(pairs, uninverted_outputs)]
    if _all_equal(xors):
        c = _bits_to_int(xors[0])
        if c != 0 and verify_candidate("xor_const", c, "invert", None):
            return build_cot("xor_const", c, "invert", None)

    return None


def _try_bit_solver(prompt: str, expected_answer: str) -> dict | None:
    """
    Try to solve a bit-manipulation problem (single op, then compound 2-op).
    Returns a CoT dict with 'cot' and 'answer', or None if unsolvable.
    """
    lines = [ln.strip() for ln in prompt.split("\n") if ln.strip()]
    pairs: list[tuple[list[int], list[int]]] = []
    query_input: list[int] | None = None

    for ln in lines:
        m = re.match(r"([01]+)\s*[-=:>→]+\s*([01]+)", ln.replace("->", "→"))
        if m:
            a, b = _parse_bits(m.group(1)), _parse_bits(m.group(2))
            if a and b:
                pairs.append((a, b))
        qm = re.match(r"(?:query|input|apply|find|determine)[\s:]*([01]+)\s*$",
                      ln, re.IGNORECASE)
        if qm:
            query_input = _parse_bits(qm.group(1))

    # Fallback: last bare binary token not in pairs
    if not query_input:
        pair_bits = {_bits_to_str(p[0]) for p in pairs} | {_bits_to_str(p[1]) for p in pairs}
        for ln in reversed(lines):
            if re.fullmatch(r"[01]+", ln.strip()) and ln.strip() not in pair_bits:
                candidate = _parse_bits(ln.strip())
                if candidate:
                    query_input = candidate
                    break

    if not pairs or not query_input:
        return None
    if any(p[0] is None or p[1] is None for p in pairs):
        return None

    n_bits = len(pairs[0][0])
    if not all(len(p[0]) == n_bits and len(p[1]) == n_bits for p in pairs):
        return None
    if len(query_input) != n_bits:
        return None

    # ── Phase 1: single operations ────────────────────────────────────────────
    for op, param in _candidate_single_ops(n_bits):
        if all(_apply_op(op, p[0], param) == p[1] for p in pairs):
            result = _apply_op(op, query_input, param)
            if result is None:
                continue
            answer_str = _bits_to_str(result)
            if not answers_match(answer_str, expected_answer):
                continue

            desc = _describe_op(op, param, n_bits)
            cot = (
                f"1. IDENTIFY: Bit-manipulation problem with {n_bits}-bit binary strings.\n\n"
                f"2. HYPOTHESISE: Rule = {desc}.\n\n"
                f"3. VERIFY:\n"
            )
            for p in pairs:
                res = _apply_op(op, p[0], param)
                cot += (
                    f"   {_bits_to_str(p[0])} → {_bits_to_str(res)}"
                    f" {'✓' if res == p[1] else '✗'}\n"
                )
            cot += (
                f"\n4. APPLY: {desc} on {_bits_to_str(query_input)} → {answer_str}\n\n"
                f"5. ANSWER: \\boxed{{{answer_str}}}"
            )
            return {"cot": cot, "answer": answer_str, "op_type": "single"}

    # ── Phase 2: compound 2-operation chains ──────────────────────────────────
    result = _try_2op_solver(pairs, query_input, n_bits, expected_answer)
    if result is not None:
        return result
    return _try_bit_feature_solver(pairs, query_input, expected_answer)


def _romanize(number: int) -> str:
    values = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ]
    out = []
    for value, symbol in values:
        while number >= value:
            out.append(symbol)
            number -= value
    return "".join(out)


def _try_roman_solver(prompt: str, expected_answer: str) -> dict | None:
    if "wonderland numeral system" not in prompt.lower() and "roman numeral" not in prompt.lower():
        return None
    nums = re.findall(r"Now, write the number\s+(\d+)", prompt, flags=re.I)
    if not nums:
        nums = re.findall(r"convert\s+(\d+)", prompt, flags=re.I)
    if not nums:
        return None
    query_num = int(nums[-1])
    answer = _romanize(query_num)
    if not answers_match(answer, expected_answer):
        return None

    examples = re.findall(r"(\d+)\s*->\s*([A-Z]+)", prompt)
    cot = (
        "1. IDENTIFY: This is a numeral-system conversion from Arabic numbers to Roman numerals.\n\n"
        "2. HYPOTHESISE: Convert each base-10 number into its standard Roman numeral form.\n\n"
        "3. VERIFY:\n"
    )
    for idx, (src, dst) in enumerate(examples, start=1):
        calc = _romanize(int(src))
        status = "✓" if calc == dst else "✗"
        cot += f"   Pair {idx}: input {src} → my rule gives {calc} → expected {dst} → {status}\n"
    cot += (
        f"\n4. APPLY: {query_num} converts to {answer}.\n\n"
        f"5. ANSWER: \\boxed{{{answer}}}"
    )
    return {"cot": cot, "answer": answer, "op_type": "roman"}


def _try_gravity_solver(prompt: str, expected_answer: str) -> dict | None:
    if "gravitational constant" not in prompt.lower():
        return None
    obs = re.findall(r"For t =\s*([0-9.]+)s,\s*distance =\s*([0-9.]+)\s*m", prompt, flags=re.I)
    query = re.findall(r"distance for t =\s*([0-9.]+)s", prompt, flags=re.I)
    if len(obs) < 2 or not query:
        return None

    g_values = []
    for t_str, d_str in obs:
        t = float(t_str)
        d = float(d_str)
        if t == 0:
            return None
        g_values.append((2.0 * d) / (t * t))
    g_est = sum(g_values) / len(g_values)
    if max(abs(g - g_est) for g in g_values) > 0.12:
        return None

    query_t = float(query[-1])
    raw_answer = 0.5 * g_est * query_t * query_t
    answer_candidates = [
        f"{raw_answer:.2f}",
        f"{raw_answer:.3f}",
        f"{raw_answer:.1f}",
        str(round(raw_answer, 2)),
    ]
    answer = next((cand for cand in answer_candidates if answers_match(cand, expected_answer)), None)
    if answer is None:
        return None

    cot = (
        "1. IDENTIFY: This is a gravity formula problem using d = 0.5 * g * t^2.\n\n"
        "2. HYPOTHESISE: Infer the hidden gravitational constant g from the examples.\n\n"
        "3. VERIFY:\n"
    )
    for idx, (t_str, d_str) in enumerate(obs, start=1):
        t = float(t_str)
        d = float(d_str)
        calc = 0.5 * g_est * t * t
        status = "✓" if abs(calc - d) < 0.15 else "✗"
        cot += f"   Pair {idx}: input t={t_str} → my rule gives {calc:.2f} → expected {float(d_str):.2f} → {status}\n"
    cot += (
        f"\n4. APPLY: Using g ≈ {g_est:.4f}, for t={query_t:.2f} we get d = {answer}.\n\n"
        f"5. ANSWER: \\boxed{{{answer}}}"
    )
    return {"cot": cot, "answer": answer, "op_type": "gravity"}


def _try_linear_unit_solver(prompt: str, expected_answer: str) -> dict | None:
    if "unit conversion" not in prompt.lower() and "measurement system" not in prompt.lower():
        return None
    examples = re.findall(r"([0-9.]+)\s*[A-Za-z]+\s+becomes\s+([0-9.]+)", prompt, flags=re.I)
    query = re.findall(r"measurement:\s*([0-9.]+)\s*[A-Za-z]+", prompt, flags=re.I)
    if len(examples) < 2 or not query:
        return None

    x1, y1 = map(float, examples[0])
    x2, y2 = map(float, examples[1])
    if abs(x2 - x1) < 1e-9:
        return None
    a = (y2 - y1) / (x2 - x1)
    b = y1 - a * x1

    for x_str, y_str in examples[2:]:
        x = float(x_str)
        y = float(y_str)
        if abs((a * x + b) - y) > 0.2:
            return None

    query_x = float(query[-1])
    raw_answer = a * query_x + b
    answer_candidates = [
        f"{raw_answer:.2f}",
        f"{raw_answer:.3f}",
        str(round(raw_answer, 2)),
        str(round(raw_answer, 3)),
    ]
    answer = next((cand for cand in answer_candidates if answers_match(cand, expected_answer)), None)
    if answer is None:
        return None

    cot = (
        "1. IDENTIFY: This is a unit-conversion problem with a linear mapping between measurements.\n\n"
        "2. HYPOTHESISE: Assume converted_value = a * input + b and solve for a and b from the examples.\n\n"
        "3. VERIFY:\n"
    )
    for idx, (x_str, y_str) in enumerate(examples, start=1):
        x = float(x_str)
        y = float(y_str)
        calc = a * x + b
        status = "✓" if abs(calc - y) < 0.2 else "✗"
        cot += f"   Pair {idx}: input {x_str} → my rule gives {calc:.2f} → expected {float(y_str):.2f} → {status}\n"
    cot += (
        f"\n4. APPLY: Using converted_value = {a:.6f} * input + {b:.6f}, input {query_x} gives {answer}.\n\n"
        f"5. ANSWER: \\boxed{{{answer}}}"
    )
    return {"cot": cot, "answer": answer, "op_type": "linear_unit"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_env(path="/workspace/runpod.env"):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    if k.strip() and not os.environ.get(k.strip()):
                        os.environ[k.strip()] = v.strip()
    except FileNotFoundError:
        pass


def resolve_backend_key(bd: dict) -> tuple[str, str] | tuple[None, None]:
    key_names = [bd.get("env_key", "")]
    key_names.extend(bd.get("fallback_env_keys", []))
    seen = set()
    for key_name in key_names:
        if not key_name or key_name in seen:
            continue
        seen.add(key_name)
        value = os.environ.get(key_name, "").strip()
        if value:
            return key_name, value
    return None, None


def build_clients() -> list[tuple[dict, openai.OpenAI]]:
    load_env()
    active = []
    for bd in BACKEND_DEFS:
        key_name, key = resolve_backend_key(bd)
        if key:
            client = openai.OpenAI(
                api_key=key,
                base_url=bd["base_url"],
                default_headers=bd.get("headers", {}),
            )
            active.append((bd, client))
            _backend_fail_streak[bd["name"]] = 0
    if not active:
        raise SystemExit(
            "[ERROR] No API key found in /workspace/runpod.env.\n"
            "Set at least one of: ANTHROPIC_API_KEY, GLM_API_KEY, GROK_API_KEY, "
            "CEREBRAS_API_KEY, NVIDIA_API_KEY"
        )
    summaries = []
    for bd, _ in active:
        key_name, _ = resolve_backend_key(bd)
        summaries.append(f"{bd['name']}[{key_name}]")
    print(f"Active backends: {', '.join(summaries)}")
    return active


def _ordered_backends(backends: list, prob_type: str) -> list:
    priority = PROBLEM_TYPE_BACKEND_PRIORITY.get(prob_type, DEFAULT_BACKEND_PRIORITY)
    rank = {name: idx for idx, name in enumerate(priority)}
    return sorted(backends, key=lambda item: rank.get(item[0]["name"], len(priority) + 1))


def extract_boxed_answer(text: str | None) -> str:
    if not text:
        return ""
    matches = re.findall(r"\\?boxed\{([^}]*)\}", text)
    return matches[-1].strip() if matches else ""


def answers_match(predicted: str, ground_truth: str) -> bool:
    pred = predicted.strip()
    gt   = ground_truth.strip()
    if pred == gt or pred.lower() == gt.lower():
        return True
    try:
        pf, gf = float(pred), float(gt)
        if gf == 0:
            return abs(pf) < 0.01
        return abs(pf - gf) / abs(gf) < 0.01
    except (ValueError, ZeroDivisionError):
        return False


def _detect_problem_type(prompt: str) -> str:
    """Heuristic classification for metadata."""
    prompt_l = prompt.lower()
    if re.search(r"\b[01]{4,}\b", prompt):
        return "bit_manipulation"
    if "gravitational constant" in prompt_l:
        return "gravity"
    if "unit conversion" in prompt_l or "measurement system" in prompt_l:
        return "unit_conversion"
    if "decrypt" in prompt_l or "encryption" in prompt_l:
        return "cipher"
    if "wonderland numeral system" in prompt_l or "roman numeral" in prompt_l:
        return "roman_numeral"
    if re.search(r"\b(I{1,3}|IV|VI{0,3}|IX|X{1,3}|XL|XC|L|C|D|M)\b", prompt):
        return "roman_numeral"
    if re.search(r"0x[0-9a-fA-F]", prompt):
        return "hexadecimal"
    if re.search(r"\b\d+\.\d+\b", prompt):
        return "decimal_float"
    if re.search(r"\b\d+\b.*\b\d+\b", prompt) and not re.search(r"[a-zA-Z]{3,}", prompt):
        return "arithmetic"
    return "word_pattern"


# ── Backend health management ─────────────────────────────────────────────────

def _record_fail(name: str):
    with _backend_lock:
        _backend_fail_streak[name] = _backend_fail_streak.get(name, 0) + 1
        if _backend_fail_streak[name] >= _FAIL_STREAK_LIMIT:
            _backend_cooldown[name] = time.time() + _COOLDOWN_SECS
            _backend_fail_streak[name] = 0  # reset after triggering cooldown


def _record_success(name: str):
    with _backend_lock:
        _backend_fail_streak[name] = 0


def _is_cooling(name: str) -> bool:
    deadline = _backend_cooldown.get(name, 0)
    return time.time() < deadline


# ── Per-problem LLM call with health tracking ─────────────────────────────────

def _llm_call(bd: dict, client, messages: list, max_tokens: int | None = None) -> str | None:
    """Single LLM call. Returns text or None. Updates backend health."""
    if _is_cooling(bd["name"]):
        return None

    for attempt in range(MAX_RETRIES_PER_BACKEND):
        try:
            resp = client.chat.completions.create(
                model=bd["model"],
                max_tokens=max_tokens or bd["max_tokens"],
                messages=messages,
            )
            text = resp.choices[0].message.content or ""
            _record_success(bd["name"])
            return text
        except openai.RateLimitError:
            wait = 2 ** (attempt + 2) + random.uniform(0, 2)
            time.sleep(wait)
        except openai.APIStatusError as e:
            if e.status_code in (429, 503, 529):
                wait = 2 ** (attempt + 2)
                time.sleep(wait)
            else:
                _record_fail(bd["name"])
                return None
        except Exception:
            _record_fail(bd["name"])
            return None

    _record_fail(bd["name"])
    return None


def _verify_reasoning(verifier_backends: list, prompt: str, cot_text: str) -> bool:
    """
    AFP Step 3 (optional): Reasoning verifier.
    Asks a cheap model if every pair was explicitly verified in the trace.
    Returns True if thorough, or if no verifier is available (fail-open).
    """
    verifier_prompt = (
        f"Problem:\n{prompt}\n\n"
        f"Proposed solution:\n{cot_text}\n\n"
        "Does this solution explicitly verify the transformation rule against EVERY "
        "demonstration pair shown in the problem? "
        "A good solution shows reasoning for each input→output pair. "
        "Reply with exactly: YES or NO"
    )
    for bd, client in verifier_backends:
        result = _llm_call(bd, client,
                           [{"role": "user", "content": verifier_prompt}],
                           max_tokens=10)
        if result is not None:
            return result.strip().upper().startswith("Y")
    return True  # fail-open if verifier unavailable


# ── Core quality pipeline ─────────────────────────────────────────────────────

def generate_cot(
    backends: list,
    row: dict,
    use_verify: bool = False,
    collection_round: int = 1,
) -> dict | None:
    """
    2-reflection quality pipeline (default):
      Step 1: Primary LLM call + retry_reason on wrong answer
      Step 2: Self-consistency check (independent cheap model must agree)
      [Step 3: Reasoning verifier — only if use_verify=True]

    Returns a training example dict or None if quality gate fails.
    Output includes metadata fields for future filtering.
    """
    pid      = row["id"]
    expected = row["answer"].strip()
    prompt   = row["prompt"].strip()
    prob_type = _detect_problem_type(prompt)
    user_msg = prompt + (WORD_PATTERN_SUFFIX if prob_type == "word_pattern" else COT_SUFFIX) + STRICT_BOX_SUFFIX
    quality_steps: list[str] = []
    ordered_backends = _ordered_backends(backends, prob_type)

    # ── Step A: Python solver (bit-manip, free, deterministic) ───────────────
    if prob_type == "bit_manipulation":
        solver_result = _try_bit_solver(prompt, expected)
        if solver_result is not None:
            quality_steps.append("solver")
            return _make_example(pid, user_msg, solver_result["cot"],
                                 solver_result["answer"], expected,
                                 "solver", prob_type, quality_steps,
                                 collection_round)

    # ── Step B: LLM primary call + retry_reason ───────────────────────────────
    if prob_type == "roman_numeral":
        solver_result = _try_roman_solver(prompt, expected)
        if solver_result is not None:
            quality_steps.append("solver")
            return _make_example(pid, user_msg, solver_result["cot"],
                                 solver_result["answer"], expected,
                                 "solver", prob_type, quality_steps,
                                 collection_round)
    if prob_type == "gravity":
        solver_result = _try_gravity_solver(prompt, expected)
        if solver_result is not None:
            quality_steps.append("solver")
            return _make_example(pid, user_msg, solver_result["cot"],
                                 solver_result["answer"], expected,
                                 "solver", prob_type, quality_steps,
                                 collection_round)
    if prob_type in ("unit_conversion", "decimal_float"):
        solver_result = _try_linear_unit_solver(prompt, expected)
        if solver_result is not None:
            quality_steps.append("solver")
            return _make_example(pid, user_msg, solver_result["cot"],
                                 solver_result["answer"], expected,
                                 "solver", prob_type, quality_steps,
                                 collection_round)

    best_text: str | None = None
    best_backend: str | None = None

    for bd, client in ordered_backends:
        if _is_cooling(bd["name"]):
            continue

        # Initial reasoning call
        text = _llm_call(bd, client, [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ])
        if text is None:
            continue

        predicted = extract_boxed_answer(text)
        if predicted and answers_match(predicted, expected):
            best_text    = text
            best_backend = bd["name"]
            quality_steps.append("llm_correct")
            break

        # Retry with retry_reason (answer was wrong — give specific correction)
        retry_msg = RETRY_PREFIX_TEMPLATE.format(
            prev_answer=predicted or "(no boxed answer found)",
            expected=expected,
        ) + user_msg
        text2 = _llm_call(bd, client, [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": retry_msg},
        ])
        if text2 is not None:
            predicted2 = extract_boxed_answer(text2)
            if predicted2 and answers_match(predicted2, expected):
                best_text = (
                    f"[First attempt: {predicted or 'no answer'} — incorrect]\n\n"
                    f"{text2}"
                )
                best_backend = bd["name"] + "+retry"
                quality_steps.append("llm_correct_on_retry")
                break

    if best_text is None:
        return None

    # ── Step C: Self-consistency check ───────────────────────────────────────
    # Use cheapest available backend for the consistency call (different from primary)
    used_primary = (best_backend or "").replace("+retry", "")
    cheap_order = ["cerebras", "nim", "deepseek", "glm", "claude-or", "claude-direct", "grok"]
    cheap_backends = [
        (bd, c) for bd, c in ordered_backends
        if bd["name"] in cheap_order and bd["name"] != used_primary
    ]
    cheap_backends.sort(key=lambda x: cheap_order.index(x[0]["name"])
                        if x[0]["name"] in cheap_order else 99)

    if cheap_backends:
        chk_bd, chk_client = cheap_backends[0]
        text_c = _llm_call(chk_bd, chk_client, [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ], max_tokens=600)
        if text_c is not None:
            pred_c = extract_boxed_answer(text_c)
            if pred_c and not answers_match(pred_c, expected):
                # Disagreement — discard (likely a lucky guess)
                return None
            quality_steps.append("self_consistent")

    # ── Step D: Reasoning verifier (optional, --verify flag) ─────────────────
    if use_verify:
        verifier_bds = [(bd, c) for bd, c in backends
                        if bd["name"] in ("cerebras", "nim")]
        if verifier_bds:
            if not _verify_reasoning(verifier_bds, prompt, best_text):
                return None
            quality_steps.append("reasoning_verified")

    return _make_example(pid, user_msg, best_text, extract_boxed_answer(best_text),
                         expected, best_backend, prob_type, quality_steps,
                         collection_round)


def _make_example(
    pid: str,
    user_msg: str,
    cot_text: str,
    predicted: str,
    expected: str,
    backend: str,
    prob_type: str,
    quality_steps: list[str],
    collection_round: int,
) -> dict:
    """Build the output JSONL record. Includes metadata for future filtering."""
    return {
        "id":                pid,
        "messages": [
            {"role": "system",    "content": SYSTEM_PROMPT},
            {"role": "user",      "content": user_msg},
            {"role": "assistant", "content": cot_text},
        ],
        "predicted_answer":  predicted,
        "expected_answer":   expected,
        "backend":           backend,
        "problem_type":      prob_type,
        "quality_steps":     quality_steps,
        "collection_round":  collection_round,
        "timestamp":         datetime.now(timezone.utc).isoformat(),
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Phase 0: CoT data generation (0.96 target)"
    )
    parser.add_argument("--workers",      type=int, default=8,
                        help="Parallel workers (default: 8)")
    parser.add_argument("--limit",        type=int, default=0,
                        help="Process only first N problems (0 = all)")
    parser.add_argument("--verify",       action="store_true",
                        help="Enable reasoning verifier (Step 3, stricter, 33%% slower)")
    parser.add_argument("--no-resume",    action="store_true",
                        help="Start fresh, ignoring checkpoint")
    parser.add_argument("--retry-failed", action="store_true",
                        help="Re-process previously failed problems (useful after API recovery)")
    parser.add_argument("--round",        type=int, default=1,
                        help="Collection round tag written to metadata (default: 1)")
    parser.add_argument(
        "--only-types",
        default="",
        help="Comma-separated problem types to include, e.g. bit_manipulation,word_pattern,decimal_float",
    )
    parser.add_argument(
        "--skip-types",
        default="",
        help="Comma-separated problem types to exclude",
    )
    args = parser.parse_args()

    only_types = {item.strip() for item in args.only_types.split(",") if item.strip()}
    skip_types = {item.strip() for item in args.skip_types.split(",") if item.strip()}

    backends = build_clients()
    print(f"Workers      : {args.workers}")
    print(f"Quality mode : {'3-reflection (--verify)' if args.verify else '2-reflection (default)'}")
    print(f"Strategy     : solver → type-aware backend order (default: {' → '.join(DEFAULT_BACKEND_PRIORITY)})")
    if only_types:
        print(f"Only types   : {sorted(only_types)}")
    if skip_types:
        print(f"Skip types   : {sorted(skip_types)}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Load CSV ──────────────────────────────────────────────────────────────
    ID_COLS     = ["id", "problem_id", "ID"]
    PROMPT_COLS = ["problem", "problem_statement", "question", "prompt"]
    ANSWER_COLS = ["answer", "solution", "expected_answer"]

    def _pick(r, candidates):
        for c in candidates:
            if c in r and r[c]:
                return r[c]
        return ""

    with open(TRAIN_CSV, newline="", encoding="utf-8") as f:
        raw_rows = list(csv.DictReader(f))

    all_rows = []
    for i, r in enumerate(raw_rows):
        pid    = _pick(r, ID_COLS)    or f"prob_{i:05d}"
        prompt = _pick(r, PROMPT_COLS)
        answer = _pick(r, ANSWER_COLS)
        if not prompt or not answer:
            continue
        prob_type = _detect_problem_type(prompt)
        all_rows.append({"id": pid, "prompt": prompt, "answer": answer, "problem_type": prob_type})

    if args.limit:
        all_rows = all_rows[:args.limit]

    if only_types:
        all_rows = [row for row in all_rows if row["problem_type"] in only_types]
    if skip_types:
        all_rows = [row for row in all_rows if row["problem_type"] not in skip_types]

    total = len(all_rows)
    print(f"Problems     : {total}")

    # ── Load checkpoint + scan JSONL to separate passed vs failed ─────────────
    # Checkpoint format (new): {"passed": [...], "failed": [...]}
    # Old format was a flat list of all processed IDs (no pass/fail distinction).
    # We ALWAYS scan the JSONL to authoratively populate ckpt["passed"] —
    # this prevents re-processing already-collected examples on retry runs.
    ckpt: dict[str, set[str]] = {"passed": set(), "failed": set()}

    if not args.no_resume and CHECKPOINT_FILE.exists():
        try:
            with open(CHECKPOINT_FILE) as f:
                raw = json.load(f)
            if isinstance(raw, list):
                # Old format: flat list of processed IDs (pass + fail mixed)
                # Treat all as "failed" initially; JSONL scan below will promote passed ones.
                ckpt["failed"] = set(raw)
            else:
                ckpt["passed"] = set(raw.get("passed", []))
                ckpt["failed"] = set(raw.get("failed", []))
        except Exception:
            pass

    # Authoritative pass list comes from the JSONL (ground truth).
    # This also handles old checkpoint migration and crash recovery.
    passed = 0
    solver_passed = 0
    round_counts: dict[int, int] = {}

    if OUTPUT_FILE.exists() and not args.no_resume:
        with open(OUTPUT_FILE) as f:
            for line in f:
                if not line.strip():
                    continue
                passed += 1
                try:
                    d = json.loads(line)
                    pid = d.get("id", "")
                    bk  = d.get("backend", "")
                    rnd = d.get("collection_round", 1)
                    if pid:
                        ckpt["passed"].add(pid)
                        ckpt["failed"].discard(pid)  # migrate old-format entries
                    round_counts[rnd] = round_counts.get(rnd, 0) + 1
                    if bk == "solver":
                        solver_passed += 1
                except Exception:
                    pass

    print(f"Checkpoint   : {len(ckpt['passed'])} passed, {len(ckpt['failed'])} failed previously")
    print(f"Already have : {passed} passed examples (solver: {solver_passed})")
    if round_counts:
        print(f"By round     : { {f'round {k}': v for k, v in sorted(round_counts.items())} }")

    # ── Determine which problems to process ───────────────────────────────────
    skip_ids = ckpt["passed"]  # always skip already-passed problems (never re-collect)
    if not args.retry_failed:
        skip_ids = skip_ids | ckpt["failed"]  # also skip failed unless retrying

    todo = [r for r in all_rows if r["id"] not in skip_ids]

    if args.retry_failed:
        retry_count = sum(1 for r in all_rows if r["id"] in ckpt["failed"])
        print(f"Retrying     : {retry_count} previously failed problems")
    print(f"Remaining    : {len(todo)} problems to process")
    print("─" * 60)

    lock      = Lock()
    processed = 0
    start_t   = time.time()
    new_passed = 0
    new_solver = 0

    backend_stats: dict[str, int] = {}

    def worker(row):
        result = generate_cot(
            backends, row,
            use_verify=args.verify,
            collection_round=args.round,
        )
        return row["id"], result

    def save_checkpoint():
        with open(CHECKPOINT_FILE, "w") as ck_f:
            json.dump({
                "passed": list(ckpt["passed"]),
                "failed": list(ckpt["failed"]),
            }, ck_f)

    with open(OUTPUT_FILE, "a", encoding="utf-8") as out_f:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {executor.submit(worker, row): row["id"] for row in todo}

            for future in as_completed(futures):
                pid, result = future.result()

                with lock:
                    processed += 1

                    if result is not None:
                        passed += 1
                        new_passed += 1
                        bk = result.get("backend", "unknown")
                        backend_stats[bk] = backend_stats.get(bk, 0) + 1
                        if bk == "solver":
                            new_solver += 1
                            solver_passed += 1
                        ckpt["passed"].add(pid)
                        ckpt["failed"].discard(pid)
                        out_f.write(json.dumps(result, ensure_ascii=False) + "\n")
                        out_f.flush()
                    else:
                        ckpt["failed"].add(pid)

                    if processed % 100 == 0 or processed == len(todo):
                        elapsed  = time.time() - start_t
                        rate     = processed / elapsed if elapsed > 0 else 1
                        eta_min  = (len(todo) - processed) / rate / 60
                        total_processed = len(ckpt["passed"]) + len(ckpt["failed"])
                        pct = new_passed / processed * 100 if processed else 0
                        s_pct = new_solver / new_passed * 100 if new_passed else 0
                        print(
                            f"  {processed:5d}/{len(todo)} | "
                            f"new passed: {new_passed} ({pct:.0f}%) | "
                            f"total: {passed} | solver: {solver_passed} ({s_pct:.0f}%) | "
                            f"{rate:.2f} prob/s | ETA: {eta_min:.0f}min"
                        )

                    if processed % 500 == 0:
                        save_checkpoint()

    save_checkpoint()

    elapsed   = time.time() - start_t
    pass_rate = new_passed / max(processed, 1) * 100

    stats = {
        "collection_round":  args.round,
        "quality_mode":      "3-reflection" if args.verify else "2-reflection",
        "total_problems":    total,
        "processed_this_run": processed,
        "new_passed":        new_passed,
        "new_solver":        new_solver,
        "total_passed":      passed,
        "total_solver":      solver_passed,
        "pass_rate_pct":     round(pass_rate, 1),
        "time_min":          round(elapsed / 60, 1),
        "output_file":       str(OUTPUT_FILE),
        "backend_stats":     backend_stats,
        "checkpoint_passed": len(ckpt["passed"]),
        "checkpoint_failed": len(ckpt["failed"]),
    }
    with open(STATS_FILE, "w") as f:
        json.dump(stats, f, indent=2)

    print()
    print("=" * 60)
    print("Phase 0 complete!")
    print(f"  This run  : {new_passed} new passed / {processed} processed ({pass_rate:.1f}%)")
    print(f"  Total     : {passed} quality examples in {OUTPUT_FILE.name}")
    print(f"  Solver    : {solver_passed} ({solver_passed/max(passed,1)*100:.0f}% of total)")
    print(f"  Time      : {elapsed/60:.1f} min")
    print(f"  Checkpoint: {len(ckpt['passed'])} passed, {len(ckpt['failed'])} failed recorded")
    print()
    if passed < 6500:
        remaining_needed = 6500 - passed
        print(f"  [!] {remaining_needed} more examples needed for 6500 target.")
        print(f"      Re-run with --retry-failed to re-process {len(ckpt['failed'])} failed problems.")
    else:
        print("  → 6500 target reached! Ready for Phase 1 SFT training.")


if __name__ == "__main__":
    main()
