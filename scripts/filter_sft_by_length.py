#!/usr/bin/env python3
"""
Create a length-safe SFT corpus view for Nemotron training.

Default policy:
  - Keep all rows from scarce/non-solver categories
  - For broader categories, keep rows under both word and char thresholds
"""

import argparse
import json
from pathlib import Path


DEFAULT_INPUT = Path("/workspace/training_data/cleaned/cot_sft.cleaned.jsonl")
DEFAULT_OUTPUT = Path("/workspace/training_data/cleaned/cot_sft.fit1024.jsonl")
ALWAYS_KEEP_TYPES = {"bit_manipulation", "cipher", "word_pattern", "decimal_float", "numeral"}


def total_chars(row: dict) -> int:
    return sum(len(message.get("content", "")) for message in row.get("messages", []))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-words", type=int, default=350)
    parser.add_argument("--max-chars", type=int, default=2600)
    args = parser.parse_args()

    rows = []
    with args.input.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))

    kept = []
    for row in rows:
        row_type = row.get("problem_type", "")
        words = int(row.get("word_count", 0))
        chars = total_chars(row)
        if row_type in ALWAYS_KEEP_TYPES or (words <= args.max_words and chars <= args.max_chars):
            kept.append(row)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as out:
        for row in kept:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"Input rows  : {len(rows)}")
    print(f"Output rows : {len(kept)}")
    print(f"Output file : {args.output}")


if __name__ == "__main__":
    main()
