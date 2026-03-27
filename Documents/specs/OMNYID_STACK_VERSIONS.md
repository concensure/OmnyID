# Omnyid Stack Versions

As of March 20, 2026, Omnyid should use this stable baseline across the project.

## Language and Runtime Baseline

- Rust: `1.94.0`
- Rust edition: `2024`
- Python: `3.14.3`
- Node.js: `22.22.1` LTS
- TypeScript: `5.9.x`

## Why These Versions

- Rust `1.94.0` is the latest stable Rust release as of March 20, 2026.
- Python `3.14.3` is the latest stable Python 3 release as of March 20, 2026.
- Node.js `22.22.1` is the current LTS release as of March 20, 2026.
- TypeScript `5.9` is the latest stable TypeScript release line as of March 20, 2026.

## Repo Enforcement

- Rust is pinned in [rust-toolchain.toml](/c:/Users/ozans/Desktop/projects/Agenton/rust-toolchain.toml)
- Docker uses Rust `1.94-slim` in [Dockerfile](/c:/Users/ozans/Desktop/projects/Agenton/Dockerfile)
- Python is documented in [.python-version](/c:/Users/ozans/Desktop/projects/Agenton/.python-version) and constrained in [python-sdk/pyproject.toml](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/pyproject.toml)
- Node is documented in [.nvmrc](/c:/Users/ozans/Desktop/projects/Agenton/.nvmrc) and constrained in [typescript-sdk/package.json](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/package.json)

## Task Rule

All future Omnyid tasks should assume this baseline unless a later phase explicitly upgrades the stack and updates this document.
