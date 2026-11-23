#!/usr/bin/env python3
"""
Phase 1: SFT fine-tuning of Nemotron Nano 30B on CoT training data.

Trains the competition base model (nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16)
on the CoT-annotated examples from Phase 0, using Unsloth + TRL SFTTrainer.

Expected accuracy after SFT: 55-65% on competition problems.

Input:  /workspace/training_data/cot_sft.jsonl
Output: /workspace/lora_output/sft_v1/

Usage:
    python3 /workspace/phase1-sft-train.py [--epochs N] [--rank N]
"""

import argparse
import json
import os
from pathlib import Path


RAW_DATA_FILE = Path("/workspace/training_data/cot_sft.jsonl")
CLEAN_DATA_FILE = Path("/workspace/training_data/cleaned/cot_sft.cleaned.jsonl")

LORA_TARGETS = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]


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


def resolve_config() -> dict:
    load_workspace_env()
    output_root = Path(os.environ.get("OUTPUT_DIR", "/workspace/lora_output"))
    output_subdir = os.environ.get("SFT_SUBDIR", "sft_v1")
    return {
        "base_model": os.environ.get("BASE_MODEL", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16"),
        "lora_rank": int(os.environ.get("LORA_RANK", "16")),
        "lora_alpha": int(os.environ.get("LORA_ALPHA", "32")),
        "max_seq_len": int(os.environ.get("MAX_SEQ_LEN", "2048")),
        "batch_size": int(os.environ.get("BATCH_SIZE", "1")),
        "grad_accum": int(os.environ.get("GRAD_ACCUM", "16")),
        "learning_rate": float(os.environ.get("LEARNING_RATE", "2e-4")),
        "epochs": int(os.environ.get("EPOCHS", "3")),
        "output_root": output_root,
        "output_subdir": output_subdir,
        "output_dir": output_root / output_subdir,
        "data_file": Path(
            os.environ.get(
                "SFT_DATA_FILE",
                str(CLEAN_DATA_FILE if CLEAN_DATA_FILE.exists() else RAW_DATA_FILE),
            )
        ),
        "hf_token": os.environ.get("HF_TOKEN", ""),
    }


def load_cot_data(path: Path) -> list[dict]:
    examples = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                example = json.loads(line)
                examples.append({"conversations": example["messages"]})
    print(f"Loaded {len(examples)} CoT training examples from {path}")
    return examples


def main():
    cfg = resolve_config()

    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=cfg["epochs"])
    parser.add_argument("--rank", type=int, default=cfg["lora_rank"])
    parser.add_argument("--lr", type=float, default=cfg["learning_rate"])
    parser.add_argument("--dry-run", action="store_true", help="Print config and exit without training")
    args = parser.parse_args()

    tmp_root = os.environ.get("TMPDIR", "/workspace/tmp")
    xdg_cache = os.environ.get("XDG_CACHE_HOME", "/workspace/.cache")
    triton_cache = os.environ.get("TRITON_CACHE_DIR", f"{xdg_cache}/triton")
    inductor_cache = os.environ.get("TORCHINDUCTOR_CACHE_DIR", "/workspace/.torchinductor")

    os.environ["TMPDIR"] = tmp_root
    os.environ["TMP"] = tmp_root
    os.environ["TEMP"] = tmp_root
    os.environ["XDG_CACHE_HOME"] = xdg_cache
    os.environ["TRITON_CACHE_DIR"] = triton_cache
    os.environ["TORCHINDUCTOR_CACHE_DIR"] = inductor_cache

    os.makedirs(tmp_root, exist_ok=True)
    os.makedirs(xdg_cache, exist_ok=True)
    os.makedirs(triton_cache, exist_ok=True)
    os.makedirs(inductor_cache, exist_ok=True)

    print(f"  TMP root      : {tmp_root}")
    print(f"  XDG cache     : {xdg_cache}")
    print(f"  Triton cache  : {triton_cache}")
    print(f"  Inductor cache: {inductor_cache}")

    hf_home = os.environ.get("HF_HOME", "/workspace/.hf_cache")
    os.environ["HF_HOME"] = hf_home
    os.makedirs(hf_home, exist_ok=True)
    print(f"  HF cache      : {hf_home}")

    print("=" * 60)
    print("Phase 1: SFT Training")
    print(f"  Base model    : {cfg['base_model']}")
    print(f"  LoRA rank     : {args.rank}")
    print(f"  Max seq len   : {cfg['max_seq_len']}")
    print(
        f"  Batch size    : {cfg['batch_size']} x grad_accum {cfg['grad_accum']} = "
        f"{cfg['batch_size'] * cfg['grad_accum']}"
    )
    print(f"  Learning rate : {args.lr}")
    print(f"  Epochs        : {args.epochs}")
    print(f"  Data file     : {cfg['data_file']}")
    print(f"  Output        : {cfg['output_dir']}")
    print("=" * 60)

    if not cfg["data_file"].exists():
        raise SystemExit(
            f"[ERROR] Training data not found: {cfg['data_file']}\n"
            "Run phase0-cot-generate.py first."
        )

    data = load_cot_data(cfg["data_file"])
    if len(data) < 100:
        print(f"[WARNING] Only {len(data)} training examples - pass rate may be low.")
        print("Consider running Phase 0 with more problems or a stronger backend.")

    if args.dry_run:
        print("[DRY RUN] Config looks good. Exiting without training.")
        return

    import torch
    from unsloth import FastLanguageModel
    from unsloth.chat_templates import get_chat_template
    from datasets import Dataset
    from trl import SFTConfig, SFTTrainer

    print(
        f"\nGPU: {torch.cuda.get_device_name(0)}, "
        f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB"
    )

    print(f"\nLoading {cfg['base_model']} (4-bit)...")
    load_kwargs = {
        "model_name": cfg["base_model"],
        "max_seq_length": cfg["max_seq_len"],
        "dtype": torch.bfloat16,
        "load_in_4bit": True,
    }
    if cfg["hf_token"]:
        load_kwargs["token"] = cfg["hf_token"]

    model, tokenizer = FastLanguageModel.from_pretrained(**load_kwargs)

    model = FastLanguageModel.get_peft_model(
        model,
        r=args.rank,
        lora_alpha=cfg["lora_alpha"],
        target_modules=LORA_TARGETS,
        lora_dropout=0.05,
        bias="none",
        use_gradient_checkpointing=False,
        random_state=42,
    )

    tokenizer = get_chat_template(tokenizer, chat_template="chatml")

    def format_example(example: dict) -> dict:
        text = tokenizer.apply_chat_template(
            example["conversations"], tokenize=False, add_generation_prompt=False
        )
        return {"text": text}

    dataset = Dataset.from_list(data).map(format_example, remove_columns=["conversations"])
    print(f"Dataset: {len(dataset)} examples")

    cfg["output_dir"].mkdir(parents=True, exist_ok=True)

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        processing_class=tokenizer,
        args=SFTConfig(
            dataset_text_field="text",
            dataset_num_proc=1,
            max_length=cfg["max_seq_len"],
            per_device_train_batch_size=cfg["batch_size"],
            gradient_accumulation_steps=cfg["grad_accum"],
            warmup_steps=5,
            num_train_epochs=args.epochs,
            learning_rate=args.lr,
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=10,
            output_dir=str(cfg["output_dir"]),
            save_strategy="epoch",
            lr_scheduler_type="cosine",
            optim="adamw_8bit",
            weight_decay=0.01,
            seed=42,
            report_to="none",
            gradient_checkpointing=False,
        ),
    )

    print("\nStarting SFT training...")
    trainer.train()

    model.save_pretrained(str(cfg["output_dir"]))
    tokenizer.save_pretrained(str(cfg["output_dir"]))
    meta = {
        "base_model": cfg["base_model"],
        "data_file": str(cfg["data_file"]),
        "data_rows": len(data),
        "epochs": args.epochs,
        "lora_rank": args.rank,
        "lora_alpha": cfg["lora_alpha"],
        "max_seq_len": cfg["max_seq_len"],
        "batch_size": cfg["batch_size"],
        "grad_accum": cfg["grad_accum"],
        "learning_rate": args.lr,
    }
    (cfg["output_dir"] / "training_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\nLoRA adapter saved to {cfg['output_dir']}")
    print("\nPhase 1 complete. Run phase2-grpo-train.py next.")


if __name__ == "__main__":
    main()
