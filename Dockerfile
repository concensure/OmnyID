# Build stage
FROM rust:1.94-slim AS builder

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
COPY scripts/ ./scripts/
COPY src/ ./src/

RUN cargo build --release

# Runtime stage
FROM debian:trixie-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    docker.io \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/omnyid-homeserver .

EXPOSE 8080

CMD ["./omnyid-homeserver"]
