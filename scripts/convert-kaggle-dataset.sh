#!/usr/bin/env bash
# convert-kaggle-dataset.sh
#
# Converts the NVIDIA Nemotron Reasoning Challenge Kaggle dataset
# (train.csv / test.csv) into the JSONL format expected by OmnyID's eval harness.
#
# Kaggle dataset fields (from competition description):
#   - id: problem identifier
#   - problem: the reasoning problem text
#   - answer: expected answer
#   - category: "bit_manipulation" | "algebraic_equations"
#   - difficulty: float 0.0-1.0
#
# Output JSONL format (EvalProblem struct):
#   { "id": "...", "prompt": "...", "expected_answer": "...",
#     "difficulty": 0.5, "category": "..." }
#
# Usage:
#   ./scripts/convert-kaggle-dataset.sh [input.csv] [output.jsonl]
#   ./scripts/convert-kaggle-dataset.sh                    # uses defaults

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

INPUT_CSV="${1:-$PROJECT_DIR/benchmarks/kaggle-raw/train.csv}"
OUTPUT_JSONL="${2:-$PROJECT_DIR/benchmarks/nemotron_challenge.jsonl}"

if [[ ! -f "$INPUT_CSV" ]]; then
  echo "ERROR: Input CSV not found: $INPUT_CSV"
  echo ""
  echo "Download the Kaggle dataset first:"
  echo "  pip install kaggle"
  echo "  kaggle competitions download -c nvidia-nemotron-model-reasoning-challenge -p $PROJECT_DIR/benchmarks/kaggle-raw/"
  echo "  cd $PROJECT_DIR/benchmarks/kaggle-raw && unzip *.zip"
  exit 1
fi

echo "==> Converting $INPUT_CSV → $OUTPUT_JSONL"

# Use Python for robust CSV→JSONL conversion
python3 - "$INPUT_CSV" "$OUTPUT_JSONL" <<'PYEOF'
import csv
import json
import sys

input_path, output_path = sys.argv[1], sys.argv[2]

# Map Kaggle column names → EvalProblem fields
# Competition uses: problem_id, problem_statement, answer, category, difficulty
# (column names vary — handle both formats)
FIELD_MAPS = {
    'id':         ['id', 'problem_id', 'ID'],
    'prompt':     ['problem', 'problem_statement', 'question', 'prompt'],
    'expected_answer': ['answer', 'solution', 'expected_answer'],
    'category':   ['category', 'type', 'problem_type'],
    'difficulty': ['difficulty', 'difficulty_score'],
}

def find_field(row, candidates):
    for c in candidates:
        if c in row:
            return row[c]
    return None

count = 0
with open(input_path, 'r', encoding='utf-8') as fin, \
     open(output_path, 'w', encoding='utf-8') as fout:
    reader = csv.DictReader(fin)
    for i, row in enumerate(reader):
        problem_id   = find_field(row, FIELD_MAPS['id']) or f"prob_{i:05d}"
        prompt       = find_field(row, FIELD_MAPS['prompt']) or ''
        answer       = find_field(row, FIELD_MAPS['expected_answer']) or ''
        category     = find_field(row, FIELD_MAPS['category']) or 'unknown'
        raw_diff     = find_field(row, FIELD_MAPS['difficulty']) or '0.5'

        if not prompt or not answer:
            continue  # skip malformed rows

        try:
            difficulty = float(raw_diff)
        except (ValueError, TypeError):
            difficulty = 0.5

        rec = {
            'id': str(problem_id).strip(),
            'prompt': str(prompt).strip(),
            'expected_answer': str(answer).strip(),
            'difficulty': round(difficulty, 4),
            'category': str(category).strip(),
        }
        fout.write(json.dumps(rec) + '\n')
        count += 1

print(f"Converted {count} problems → {output_path}")
PYEOF

echo "Done. Output: $OUTPUT_JSONL"
echo ""
echo "Problem count: $(wc -l < "$OUTPUT_JSONL")"
echo ""
echo "Sample entries:"
head -3 "$OUTPUT_JSONL" | python3 -m json.tool --no-ensure-ascii 2>/dev/null || head -3 "$OUTPUT_JSONL"
