#!/usr/bin/env python3
"""
Rank LoRA checkpoints on a deterministic held-out split of Kaggle train.csv.

This is intended for fast checkpoint selection after SFT / GRPO runs.
It scores exact-match accuracy on a fixed subset so we can compare
checkpoint-100/200/... against the final adapter instead of assuming the last
checkpoint is best.
"""

import argparse
import csv
import gc
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


DEFAULT_BASE_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16"
DEFAULT_ROOT = Path("/workspace/lora_runs/round100_fit768/grpo_fit768")
DEFAULT_TRAIN_CSV = Path("/workspace/kaggle-data/train.csv")
DEFAULT_OUTPUT = "heldout_eval.json"
DEFAULT_MAX_SEQ_LEN = 768
DEFAULT_MAX_PROMPT_LEN = 512
DEFAULT_MAX_COMPLETION_LEN = 32

SYSTEM_PROMPT = (
    "You solve transformation puzzles from examples. "
    "Do not restate the prompt. Keep the completion concise and end with boxed{answer}."
)
RL_SUFFIX = "\n\nRespond briefly. Final line must be boxed{answer}."


def normalize_answer(text: str | None) -> str:
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"<\|.*?\|>", " ", text)
    text = re.sub(r"^answer\s*:\s*", "", text, flags=re.I)
    text = re.sub(r"^\s*final\s+answer\s*:\s*", "", text, flags=re.I)
    return text.strip().strip("`").strip()


def extract_boxed_answer(text: str | None) -> str:
    if not text:
        return ""
    matches = re.findall(r"boxed\{([^}]*)\}", text)
    return matches[-1].strip() if matches else ""


def infer_answer_type(ground_truth: str) -> str:
    if re.fullmatch(r"[01]+", ground_truth):
        return "binary"
    if re.fullmatch(r"-?\d+(?:\.\d+)?", ground_truth):
        return "number"
    if re.fullmatch(r"[IVXLCDM]+", ground_truth, flags=re.I):
        return "roman"
    if re.fullmatch(r"[A-Za-z ]+", ground_truth):
        return "text"
    return "generic"


def extract_candidate_answer(text: str | None, ground_truth: str) -> str:
    text = normalize_answer(text)
    if not text:
        return ""

    boxed = normalize_answer(extract_boxed_answer(text))
    if boxed:
        return boxed

    answer_type = infer_answer_type(ground_truth)
    if answer_type == "binary":
        matches = re.findall(rf"\b[01]{{{max(1, len(ground_truth))},}}\b", text)
        if matches:
            return matches[-1]
    elif answer_type == "number":
        matches = re.findall(r"-?\d+(?:\.\d+)?", text)
        if matches:
            return matches[-1]
    elif answer_type == "roman":
        matches = re.findall(r"\b[IVXLCDM]+\b", text, flags=re.I)
        if matches:
            return matches[-1]

    lines = [normalize_answer(line) for line in text.splitlines() if normalize_answer(line)]
    return lines[-1].strip(" .") if lines else text.strip(" .")


def exact_match(pred: str, gt: str) -> bool:
    pred = normalize_answer(pred)
    gt = normalize_answer(gt)
    if pred == gt or pred.lower() == gt.lower():
        return True
    try:
        pf, gf = float(pred), float(gt)
        if gf == 0:
            return abs(pf) < 0.01
        return abs(pf - gf) / abs(gf) < 0.01
    except (ValueError, ZeroDivisionError):
        return False


def load_rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def stable_hash_bucket(text: str, mod: int = 100) -> int:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % mod


def select_holdout(rows: list[dict], bucket_mod: int, bucket_value: int, limit: int) -> list[dict]:
    chosen = []
    for row in rows:
        row_key = row.get("id") or row.get("prompt", "")
        if stable_hash_bucket(row_key, bucket_mod) == bucket_value:
            chosen.append(row)
    if limit > 0:
        chosen = chosen[:limit]
    return chosen


def candidate_dirs(root: Path) -> list[Path]:
    candidates = []
    if (root / "adapter_model.safetensors").exists():
        candidates.append(root)
    candidates.extend(sorted(
        [path for path in root.glob("checkpoint-*") if (path / "adapter_model.safetensors").exists()],
        key=lambda p: int(p.name.split("-")[-1]),
    ))
    return candidates


def evaluate_checkpoint(model_dir: Path, rows: list[dict], max_seq_len: int, max_prompt_len: int, max_completion_len: int) -> dict:
    from unsloth import FastLanguageModel
    from unsloth.chat_templates import get_chat_template
    import torch

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=str(model_dir),
        max_seq_length=max_seq_len,
        dtype=torch.bfloat16,
        load_in_4bit=True,
    )
    FastLanguageModel.for_inference(model)
    tokenizer = get_chat_template(tokenizer, chat_template="chatml")

    num_correct = 0
    examples = []

    for idx, row in enumerate(rows, start=1):
        prompt = row["prompt"].strip() + RL_SUFFIX
        gt = normalize_answer(row["answer"])
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=max_prompt_len).to(model.device)

        with torch.no_grad():
            output = model.generate(
                **inputs,
                max_new_tokens=max_completion_len,
                do_sample=False,
                temperature=None,
                use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
            )

        new_tokens = output[0][inputs["input_ids"].shape[1]:]
        completion = tokenizer.decode(new_tokens, skip_special_tokens=True)
        pred = extract_candidate_answer(completion, gt)
        ok = exact_match(pred, gt)
        if ok:
            num_correct += 1

        if idx <= 8:
            examples.append(
                {
                    "id": row.get("id", ""),
                    "ground_truth": gt,
                    "prediction": pred,
                    "correct": ok,
                    "completion": completion.strip(),
                }
            )

    accuracy = num_correct / len(rows) if rows else 0.0
    result = {
        "checkpoint": model_dir.name,
        "path": str(model_dir),
        "num_examples": len(rows),
        "num_correct": num_correct,
        "accuracy": accuracy,
        "sample_predictions": examples,
    }
    del model
    del tokenizer
    gc.collect()
    torch.cuda.empty_cache()
    return result


def run_single_checkpoint(args: argparse.Namespace, holdout: list[dict]) -> dict:
    return evaluate_checkpoint(
        args.checkpoint,
        holdout,
        max_seq_len=args.max_seq_len,
        max_prompt_len=args.max_prompt_len,
        max_completion_len=args.max_completion_len,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--train-csv", type=Path, default=DEFAULT_TRAIN_CSV)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--bucket-mod", type=int, default=20)
    parser.add_argument("--bucket-value", type=int, default=0)
    parser.add_argument("--max-seq-len", type=int, default=DEFAULT_MAX_SEQ_LEN)
    parser.add_argument("--max-prompt-len", type=int, default=DEFAULT_MAX_PROMPT_LEN)
    parser.add_argument("--max-completion-len", type=int, default=DEFAULT_MAX_COMPLETION_LEN)
    parser.add_argument("--output-name", default=DEFAULT_OUTPUT)
    parser.add_argument("--checkpoint", type=Path, help="Evaluate exactly one checkpoint path.")
    args = parser.parse_args()

    rows = load_rows(args.train_csv)
    holdout = select_holdout(rows, args.bucket_mod, args.bucket_value, args.limit)
    if not holdout:
        raise SystemExit("[ERROR] Hold-out selection is empty.")

    checkpoints = [args.checkpoint] if args.checkpoint else candidate_dirs(args.root)
    if not checkpoints:
        raise SystemExit(f"[ERROR] No checkpoints found under {args.root}")

    if args.checkpoint:
        result = run_single_checkpoint(args, holdout)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    results = {
        "root": str(args.root),
        "train_csv": str(args.train_csv),
        "num_total_rows": len(rows),
        "num_holdout_rows": len(holdout),
        "bucket_mod": args.bucket_mod,
        "bucket_value": args.bucket_value,
        "results": [],
    }

    for checkpoint in checkpoints:
        print(f"Evaluating {checkpoint} on {len(holdout)} held-out rows...")
        cmd = [
            sys.executable,
            str(Path(__file__)),
            "--root", str(args.root),
            "--train-csv", str(args.train_csv),
            "--limit", str(args.limit),
            "--bucket-mod", str(args.bucket_mod),
            "--bucket-value", str(args.bucket_value),
            "--max-seq-len", str(args.max_seq_len),
            "--max-prompt-len", str(args.max_prompt_len),
            "--max-completion-len", str(args.max_completion_len),
            "--checkpoint", str(checkpoint),
        ]
        completed = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
        )
        stdout = completed.stdout.strip()
        json_start = stdout.find("{")
        if json_start < 0:
            raise RuntimeError(f"No JSON result found in subprocess output for {checkpoint}.\n{stdout}")
        result = json.loads(stdout[json_start:])
        results["results"].append(result)
        print(f"  accuracy={result['accuracy']:.4f} ({result['num_correct']}/{result['num_examples']})")

        output_path = args.root / args.output_name
        with output_path.open("w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

    results["results"].sort(key=lambda item: item["accuracy"], reverse=True)
    best = results["results"][0]
    print("")
    print(f"Best checkpoint: {best['checkpoint']}")
    print(f"Accuracy       : {best['accuracy']:.4f}")
    print(f"Output file    : {args.root / args.output_name}")


if __name__ == "__main__":
    main()
