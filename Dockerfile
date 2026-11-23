# syntax=docker/dockerfile:1
# Build stage
FROM rust:1.94-slim AS builder

# The full release crate can exceed rustc's default worker stack while checking
# AWS/storage and Wedding routes together. Keep this builder-only so the
# runtime container receives no unnecessary process setting.
ARG RUST_MIN_STACK=134217728
ENV RUST_MIN_STACK=${RUST_MIN_STACK}

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY build.rs ./
COPY proto/ ./proto/
COPY postgres/ ./postgres/
COPY runtime-templates/ ./runtime-templates/
COPY service-adapter-templates/ ./service-adapter-templates/
COPY schemas/ ./schemas/
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tests/fixtures/ ./tests/fixtures/
COPY wedding/email/ ./wedding/email/
COPY wedding/vendors.html ./wedding/vendors.html
COPY solid-ui/src/lib/weddingFacetVocabulary.json ./solid-ui/src/lib/weddingFacetVocabulary.json

# Cache the crate registry and incremental build artifacts across builds so an
# interrupted or re-triggered deploy doesn't recompile the world from scratch.
# The cache mount isn't visible to later Dockerfile steps, so the resulting
# binary is copied out to a normal (non-cached) path before the mount is torn down.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release && \
    cp target/release/omnyid-homeserver /app/omnyid-homeserver

# Runtime stage
FROM debian:trixie-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    docker.io \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/omnyid-homeserver .

EXPOSE 8080

CMD ["./omnyid-homeserver"]
