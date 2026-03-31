# ─────────────────────────────────────────────────────────────
# SecureShell AI — Air-Gapped Production Container
# ─────────────────────────────────────────────────────────────
# Multi-stage build: builds a production bundle, then copies
# only the output into a minimal runtime image.
# Zero outbound network traffic at runtime.
#
# Usage:
#   docker build -t secureshell-ai .
#   docker run --rm \
#     -e LLM_PROVIDER=ollama \
#     -e LLM_ENDPOINT=http://host.docker.internal:11434 \
#     -e LLM_MODEL=codellama:70b \
#     secureshell-ai
# ─────────────────────────────────────────────────────────────

# Stage 1: Build
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json bun.lockb* ./

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY . .

# Build production bundle
RUN bun run build:prod

# Stage 2: Runtime
FROM oven/bun:1-alpine

WORKDIR /app

# Install OS-level runtime dependencies
RUN apk add --no-cache git ripgrep

# Copy only the bundled output from the builder
COPY --from=builder /app/dist/cli.mjs /app/cli.mjs

# Copy default configuration files
COPY --from=builder /app/config /app/config

# Make it executable
RUN chmod +x /app/cli.mjs

# Create default config directory
RUN mkdir -p /root/.secureshell && \
    cp /app/config/default-features.json /root/.secureshell/features.json && \
    cp /app/config/default-settings.json /root/.secureshell/settings.json && \
    cp /app/config/default-policy.json /root/.secureshell/policy.json

# Air-gapped defaults: disable all outbound traffic
ENV AUDIT_ENABLED=true \
    CLASSIFICATION_MODE=disabled \
    LLM_PROVIDER=ollama \
    LLM_ENDPOINT=http://localhost:11434

# Labels
LABEL org.opencontainers.image.title="SecureShell AI" \
      org.opencontainers.image.description="Air-gapped, LLM-agnostic AI coding terminal" \
      org.opencontainers.image.vendor="SecureShell AI"

ENTRYPOINT ["bun", "/app/cli.mjs"]
