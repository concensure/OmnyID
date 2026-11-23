#!/usr/bin/env python3
"""
Phase 2: GRPO reinforcement learning on top of the SFT checkpoint.

This version is tuned for single-H100 stability first, then for useful reward
signal. The key changes versus the original draft are:
  - Reuse an existing SFT LoRA adapter instead of attempting to attach LoRA twice
  - Use concise RL prompts so completions fit inside the rollout budget
  - Provide dense exact/partial/format reward so GRPO does not collapse into
    all-zero feedback while still optimizing the exact Kaggle metric
  - Work around TRL / Unsloth gradient-checkpointing calls that are invalid for
    NemotronH on this stack
"""

import os
import csv
import re
import json
import argparse
from difflib import SequenceMatcher
from pathlib import Path


DEFAULT_BASE_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16"
SFT_DIR = Path(os.environ.get("SFT_INPUT_DIR", "/workspace/lora_output/sft_v1"))
OUTPUT_DIR = Path(os.environ.get("GRPO_OUTPUT_DIR", "/workspace/lora_output/grpo_v1"))
TRAIN_CSV = Path("/workspace/kaggle-data/train.csv")

# Stable defaults validated on the current RunPod H100 80GB environment.
DEFAULT_MAX_SEQ_LEN = 768
DEFAULT_MAX_PROMPT_LEN = 512
DEFAULT_MAX_COMPLETION_LEN = 32
DEFAULT_STEPS = 400
DEFAULT_LR = 2e-6
DEFAULT_BETA = 0.02
DEFAULT_TEMPERATURE = 0.6

LORA_TARGETS = [
    "q_proj", "k_proj", "v_proj", "o_proj",
    "gate_proj", "up_proj", "down_proj",
]

RL_SUFFIX = "\n\nRespond briefly. Final line must be boxed{answer}."
SYSTEM_PROMPT = (
    "You solve transformation puzzles from examples. "
    "Do not restate the prompt. Keep the completion concise and end with boxed{answer}."
)


def load_workspace_env(path: Path = Path("/workspace/runpod.env")) -> None:
    if not path.exists():
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                if key.strip() and not os.environ.get(key.strip()):
                    os.environ[key.strip()] = value.strip()


def extract_boxed_answer(text: str | None) -> str:
    """Extract the final boxed answer when present."""
    if not text:
        return ""
    matches = re.findall(r"boxed\{([^}]*)\}", text)
    return matches[-1].strip() if matches else ""


def normalize_answer(text: str | None) -> str:
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"<\|.*?\|>", " ", text)
    text = re.sub(r"^answer\s*:\s*", "", text, flags=re.I)
    text = re.sub(r"^\s*final\s+answer\s*:\s*", "", text, flags=re.I)
    return text.strip().strip("`").strip()


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
    """
    Best-effort parser for final answers.

    The exact competition metric is still based on the final string, but this
    parser lets GRPO learn from outputs that are close to the correct answer even
    when the completion misses the exact boxed format.
    """
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
    if lines:
        return re.sub(r"^(therefore|thus|so)\s*,?\s*", "", lines[-1], flags=re.I).strip(" .")
    return text.strip(" .")


def exact_match_score(pred: str, gt: str) -> float:
    if not pred or not gt:
        return 0.0
    if pred == gt or pred.lower() == gt.lower():
        return 1.0
    try:
        pf, gf = float(pred), float(gt)
        if gf == 0:
            return 1.0 if abs(pf) < 0.01 else 0.0
        return 1.0 if abs(pf - gf) / abs(gf) < 0.01 else 0.0
    except (ValueError, ZeroDivisionError):
        return 0.0


def partial_match_score(pred: str, gt: str) -> float:
    if not pred or not gt:
        return 0.0

    answer_type = infer_answer_type(gt)
    if answer_type == "binary":
        if len(pred) != len(gt):
            return 0.0
        return sum(a == b for a, b in zip(pred, gt)) / len(gt)
    if answer_type == "number":
        try:
            pf, gf = float(pred), float(gt)
            if gf == 0:
                return max(0.0, 1.0 - abs(pf))
            return max(0.0, 1.0 - min(abs(pf - gf) / abs(gf), 1.0))
        except (ValueError, ZeroDivisionError):
            return 0.0
    return SequenceMatcher(a=pred.lower(), b=gt.lower()).ratio()


def reward_fn(completions, ground_truth=None, ground_truths=None, **kwargs) -> list[float]:
    """
    Dense reward that still centers the exact competition metric.

    Reward components:
      - Exact-match reward on the parsed final answer
      - Boxed-format reward
      - Partial-match reward for near misses
      - Small brevity reward so completions fit the rollout budget
      - Small rambling penalty for long, non-terminating outputs
    """
    if ground_truths is None:
        ground_truths = ground_truth
    if ground_truths is None:
        raise ValueError("reward_fn expected `ground_truth` or `ground_truths` values from the dataset.")

    rewards = []
    for completion, gt in zip(completions, ground_truths):
        gt = normalize_answer(gt)
        pred = extract_candidate_answer(completion, gt)

        exact = exact_match_score(pred, gt)
        boxed_bonus = 0.08 if extract_boxed_answer(completion) else 0.0
        concise_bonus = 0.04 if completion and len(completion.split()) <= 20 else 0.0

        if exact >= 1.0:
            rewards.append(1.0 + boxed_bonus + concise_bonus)
            continue

        partial_bonus = 0.35 * partial_match_score(pred, gt)
        nonempty_bonus = 0.03 if pred else 0.0
        ramble_penalty = -0.05 if completion and len(completion.split()) > 40 else 0.0
        rewards.append(max(0.0, boxed_bonus + concise_bonus + nonempty_bonus + partial_bonus + ramble_penalty))
    return rewards


def load_train_problems() -> list[dict]:
    """Load all competition training problems for GRPO rollouts."""
    with open(TRAIN_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [
        {
            "prompt": row["prompt"].strip() + RL_SUFFIX,
            "ground_truth": row["answer"].strip(),
        }
        for row in rows
    ]


def has_lora_adapter(path: Path) -> bool:
    return (path / "adapter_config.json").exists() and (path / "adapter_model.safetensors").exists()


def disable_gradient_checkpointing_hooks(model) -> None:
    """
    TRL / Unsloth may toggle gradient checkpointing during generation even though
    NemotronH does not support it on this stack.
    """
    def _noop(*args, **kwargs):
        return None

    for candidate in (model, getattr(model, "model", None), getattr(model, "base_model", None)):
        if candidate is None:
            continue
        setattr(candidate, "gradient_checkpointing_enable", _noop)
        setattr(candidate, "gradient_checkpointing_disable", _noop)


def ensure_trl_compat_attrs(model) -> None:
    """Populate attributes that some TRL builds expect on the wrapped model."""
    for candidate in (model, getattr(model, "model", None), getattr(model, "base_model", None)):
        if candidate is None:
            continue
        if not hasattr(candidate, "warnings_issued"):
            setattr(candidate, "warnings_issued", {})


def main():
    load_workspace_env()

    tmp_dir = Path(os.environ.get("TMPDIR", "/tmp/omnyid_grpo_tmp"))
    tmp_dir.mkdir(parents=True, exist_ok=True)
    os.environ["TMPDIR"] = str(tmp_dir)
    os.environ["TMP"] = str(tmp_dir)
    os.environ["TEMP"] = str(tmp_dir)
    triton_cache = Path(os.environ.get("TRITON_CACHE_DIR", "/tmp/omnyid_triton_cache"))
    inductor_cache = Path(os.environ.get("TORCHINDUCTOR_CACHE_DIR", "/tmp/omnyid_torchinductor"))
    triton_cache.mkdir(parents=True, exist_ok=True)
    inductor_cache.mkdir(parents=True, exist_ok=True)
    os.environ["TRITON_CACHE_DIR"] = str(triton_cache)
    os.environ["TORCHINDUCTOR_CACHE_DIR"] = str(inductor_cache)
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

    base_model = os.environ.get("BASE_MODEL", DEFAULT_BASE_MODEL)
    max_seq_len = int(os.environ.get("GRPO_MAX_SEQ_LEN", str(DEFAULT_MAX_SEQ_LEN)))
    max_prompt_len = int(os.environ.get("GRPO_MAX_PROMPT_LEN", str(DEFAULT_MAX_PROMPT_LEN)))
    max_completion_len = int(os.environ.get("GRPO_MAX_COMPLETION_LEN", str(DEFAULT_MAX_COMPLETION_LEN)))
    grad_accum_steps = int(os.environ.get("GRPO_GRAD_ACCUM", "1"))

    max_prompt_len = min(max_prompt_len, max_seq_len - 128)
    if max_prompt_len <= 0:
        raise SystemExit("[ERROR] GRPO_MAX_PROMPT_LEN must be smaller than GRPO_MAX_SEQ_LEN.")

    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=int(os.environ.get("GRPO_STEPS", str(DEFAULT_STEPS))))
    parser.add_argument("--group-size", type=int, default=int(os.environ.get("GRPO_GROUP_SIZE", "2")))
    parser.add_argument("--lr", type=float, default=float(os.environ.get("GRPO_LEARNING_RATE", str(DEFAULT_LR))))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    beta = float(os.environ.get("GRPO_BETA", str(DEFAULT_BETA)))
    temperature = float(os.environ.get("GRPO_TEMPERATURE", str(DEFAULT_TEMPERATURE)))

    hf_home = os.environ.get("HF_HOME", "/workspace/.hf_cache")
    os.environ["HF_HOME"] = hf_home
    os.makedirs(hf_home, exist_ok=True)
    print(f"  HF cache      : {hf_home}")

    hf_token = os.environ.get("HF_TOKEN", "")

    if not SFT_DIR.exists():
        raise SystemExit(
            f"[ERROR] SFT checkpoint not found: {SFT_DIR}\n"
            "Run phase1-sft-train.py first."
        )

    print("=" * 60)
    print("Phase 2: GRPO Training")
    print(f"  Base model      : {base_model}")
    print(f"  SFT checkpoint  : {SFT_DIR}")
    print(f"  Max steps       : {args.steps}")
    print(f"  Group size (k)  : {args.group_size}")
    print(f"  KL penalty (β)  : {beta}")
    print(f"  Learning rate   : {args.lr}")
    print(f"  Temperature     : {temperature}")
    print(f"  Max seq len     : {max_seq_len}")
    print(f"  Max prompt len  : {max_prompt_len}")
    print(f"  Max completion  : {max_completion_len}")
    print(f"  Grad accum      : {grad_accum_steps}")
    print(f"  TMPDIR          : {tmp_dir}")
    print(f"  Triton cache    : {triton_cache}")
    print(f"  Inductor cache  : {inductor_cache}")
    print(f"  Output          : {OUTPUT_DIR}")
    print("=" * 60)

    if args.dry_run:
        print("[DRY RUN] Config OK. Exiting.")
        return

    from unsloth import FastLanguageModel
    from unsloth.chat_templates import get_chat_template
    import torch
    from datasets import Dataset
    from trl import GRPOTrainer, GRPOConfig

    print(f"\nGPU: {torch.cuda.get_device_name(0)}")
    print(f"\nLoading SFT checkpoint from {SFT_DIR}...")

    load_kwargs = {
        "model_name": str(SFT_DIR),
        "max_seq_length": max_seq_len,
        "dtype": torch.bfloat16,
        "load_in_4bit": True,
    }
    if hf_token:
        load_kwargs["token"] = hf_token

    model, tokenizer = FastLanguageModel.from_pretrained(**load_kwargs)

    if has_lora_adapter(SFT_DIR):
        print("Detected existing SFT LoRA adapter; reusing it for GRPO fine-tuning.")
    else:
        print("No saved adapter detected in SFT checkpoint; attaching a fresh LoRA adapter.")
        model = FastLanguageModel.get_peft_model(
            model,
            r=int(os.environ.get("LORA_RANK", "16")),
            lora_alpha=int(os.environ.get("LORA_ALPHA", "32")),
            target_modules=LORA_TARGETS,
            lora_dropout=0.05,
            bias="none",
            use_gradient_checkpointing=False,
            random_state=42,
        )

    peft_config = getattr(model, "peft_config", None)
    if not peft_config:
        raise RuntimeError("Phase 2 requires a trainable LoRA adapter, but none is attached after loading the SFT checkpoint.")

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Trainable params: {trainable_params:,} / {total_params:,}")

    disable_gradient_checkpointing_hooks(model)
    ensure_trl_compat_attrs(model)
    tokenizer = get_chat_template(tokenizer, chat_template="chatml")

    problems = load_train_problems()
    print(f"Problems for GRPO rollouts: {len(problems)}")

    def format_for_grpo(row):
        msgs = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": row["prompt"]},
        ]
        return {
            "prompt": tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True),
            "ground_truth": row["ground_truth"],
        }

    dataset = Dataset.from_list(problems).map(format_for_grpo)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    grpo_config = GRPOConfig(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=1,
        max_steps=args.steps,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=grad_accum_steps,
        num_generations=args.group_size,
        learning_rate=args.lr,
        beta=beta,
        temperature=temperature,
        max_prompt_length=max_prompt_len,
        max_completion_length=max_completion_len,
        generation_batch_size=args.group_size,
        logging_steps=10,
        save_steps=100,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        gradient_checkpointing=False,
        report_to="none",
        seed=42,
        max_grad_norm=1.0,
        warmup_ratio=0.03,
    )

    trainer = GRPOTrainer(
        model=model,
        reward_funcs=[reward_fn],
        args=grpo_config,
        train_dataset=dataset,
        processing_class=tokenizer,
    )

    print("\nStarting GRPO training...")
    print("Reward function: exact-match primary + dense partial/format shaping")
    trainer.train()

    model.save_pretrained(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))
    meta = {
        "base_model": base_model,
        "sft_input_dir": str(SFT_DIR),
        "output_dir": str(OUTPUT_DIR),
        "steps": args.steps,
        "group_size": args.group_size,
        "learning_rate": args.lr,
        "beta": beta,
        "temperature": temperature,
        "max_seq_len": max_seq_len,
        "max_prompt_len": max_prompt_len,
        "max_completion_len": max_completion_len,
        "grad_accum_steps": grad_accum_steps,
        "problem_count": len(problems),
    }
    (OUTPUT_DIR / "training_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\nGRPO adapter saved to {OUTPUT_DIR}")
    print("\nPhase 2 complete. Ready for packing and submission.")


if __name__ == "__main__":
    main()
