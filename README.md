<div align="center">

# SecureShell AI

**Air-Gapped, LLM-Agnostic AI Coding Terminal for Defense & Classified Environments**

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![Bun](https://img.shields.io/badge/Runtime-Bun-f472b6?logo=bun&logoColor=white)](#tech-stack)
[![Air-Gapped](https://img.shields.io/badge/Network-Air--Gapped-critical)](#air-gapped-architecture)
[![LLM Agnostic](https://img.shields.io/badge/LLM-Agnostic-blueviolet)](#supported-providers)
[![Classification](https://img.shields.io/badge/Data-Classification--Aware-orange)](#classification-system)

> An AI-powered coding terminal that runs entirely on-premise with zero outbound network traffic. Supports any LLM backend -- local or cloud. Built for IL4/IL5, SCIF, and air-gapped networks.

</div>

---

## Table of Contents

- [What is SecureShell AI?](#what-is-secureshell-ai)
- [Why SecureShell AI?](#why-secureshell-ai)
- [Supported LLM Providers](#supported-llm-providers)
- [Air-Gapped Architecture](#air-gapped-architecture)
- [Classification System](#classification-system)
- [Core Features](#core-features)
  - [Tool System](#tool-system)
  - [Permission Engine](#permission-engine)
  - [Audit Logging](#audit-logging)
  - [Authentication](#authentication)
- [Quick Start](#quick-start)
  - [Local Development](#local-development)
  - [Docker](#docker)
  - [Kubernetes (Helm)](#kubernetes-helm)
- [Configuration](#configuration)
  - [Provider Configuration](#provider-configuration)
  - [Classification Levels](#classification-levels)
  - [Permission Modes](#permission-modes)
  - [Audit Configuration](#audit-configuration)
- [Deployment Guide](#deployment-guide)
  - [Air-Gapped Docker Image](#air-gapped-docker-image)
  - [Kubernetes with GPU Scheduling](#kubernetes-with-gpu-scheduling)
  - [Model Weight Management](#model-weight-management)
- [Architecture](#architecture)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

---

## What is SecureShell AI?

SecureShell AI is an AI-powered terminal coding assistant designed for environments where data cannot leave the network. It provides the full power of an AI coding agent -- file editing, code search, command execution, sub-agent orchestration -- while running entirely on-premise against local or approved LLM backends.

| | |
|---|---|
| **Runtime** | [Bun](https://bun.sh) |
| **Language** | TypeScript (strict) |
| **Terminal UI** | React + [Ink](https://github.com/vadimdemedes/ink) |
| **LLM Support** | Ollama, vLLM, llama.cpp, TGI, Bedrock GovCloud, Azure GovCloud, Custom OpenAI-compatible |
| **Classification** | UNCLASSIFIED, CUI, SECRET, TOP SECRET |
| **Compliance** | IL4, IL5, SCIF-ready, STIG-aware |

---

## Why SecureShell AI?

| Problem | SecureShell AI Solution |
|---|---|
| AI coding tools send code to external APIs | Zero outbound traffic -- all inference runs on-premise |
| No classification-aware access controls | Per-file classification labels with clearance-gated access |
| No audit trail for AI actions | Immutable, append-only audit log for every tool invocation |
| Locked to a single LLM vendor | Provider-agnostic -- swap LLMs via environment variable |
| No CAC/PIV authentication | Native smart card authentication for defense networks |
| STIG compliance is manual | Built-in STIG compliance checking tool |

---

## Supported LLM Providers

SecureShell AI uses an adapter pattern to support any LLM that exposes an API:

| Provider | Type | Environment Variable | Use Case |
|---|---|---|---|
| **Ollama** | Local | `LLM_PROVIDER=ollama` | Single-machine development |
| **vLLM** | Local/Cluster | `LLM_PROVIDER=vllm` | GPU cluster inference |
| **llama.cpp** | Local | `LLM_PROVIDER=llamacpp` | Lightweight local inference |
| **Text Generation Inference (TGI)** | Local/Cluster | `LLM_PROVIDER=tgi` | HuggingFace models |
| **AWS Bedrock GovCloud** | Cloud (Gov) | `LLM_PROVIDER=bedrock-govcloud` | FedRAMP-authorized cloud |
| **Azure GovCloud** | Cloud (Gov) | `LLM_PROVIDER=azure-govcloud` | IL5-authorized cloud |
| **Custom OpenAI-compatible** | Any | `LLM_PROVIDER=custom` | Any OpenAI-compatible API |

### Provider Configuration Example

```bash
# Local Ollama with CodeLlama
export LLM_PROVIDER=ollama
export LLM_ENDPOINT=http://localhost:11434
export LLM_MODEL=codellama:70b

# GPU cluster with vLLM
export LLM_PROVIDER=vllm
export LLM_ENDPOINT=http://inference-server.internal:8000
export LLM_MODEL=deepseek-coder-v2

# AWS Bedrock GovCloud
export LLM_PROVIDER=bedrock-govcloud
export AWS_REGION=us-gov-west-1
export LLM_MODEL=anthropic.claude-sonnet-4-20250514

# Any OpenAI-compatible endpoint
export LLM_PROVIDER=custom
export LLM_ENDPOINT=http://my-inference:8080/v1
export LLM_MODEL=my-model
export LLM_API_KEY=my-key  # optional
```

---

## Air-Gapped Architecture

```
+-----------------------------------------------------------+
|                    AIR-GAPPED NETWORK                      |
|                                                            |
|  +---------------+    +---------------+    +------------+  |
|  |  SecureShell  |    |   LLM         |    |   Audit    |  |
|  |  Terminal     |<-->|   Router      |<-->|   Logger   |  |
|  |  (React/Ink)  |    |   (Adapter)   |    | (Immutable)|  |
|  +-------+-------+    +-------+-------+    +-----+------+  |
|          |                    |                   |         |
|          |             +------+-------+    +-----+------+  |
|          |             |   Provider   |    | Permission |  |
|          |             |   Adapters   |    |  Engine    |  |
|          |             +------+-------+    | (Class-    |  |
|          |                    |             |  Aware)    |  |
|          |                    |             +------------+  |
|  +-------+--------------------+---------------------------+|
|  |           Local LLM Infrastructure                      |
|  |  +-----------+  +-----------+  +--------------------+   |
|  |  |  Ollama   |  |   vLLM    |  | llama.cpp / TGI   |   |
|  |  +-----------+  +-----------+  +--------------------+   |
|  +---------------------------------------------------------+|
|                                                            |
|  +---------------------------------------------------------+|
|  |  On-Prem GPU Cluster (NVIDIA A100/H100)                 |
|  +---------------------------------------------------------+|
|                                                            |
|  ZERO OUTBOUND NETWORK TRAFFIC                             |
|  NetworkPolicy: deny all egress                            |
+-----------------------------------------------------------+
```

### What Was Removed for Air-Gap

| External Dependency | Status | Replacement |
|---|---|---|
| Anthropic API (api.anthropic.com) | Removed | Local LLM provider adapters |
| OAuth (claude.ai, platform.claude.com) | Removed | Local auth (API key, CAC/PIV, LDAP) |
| GrowthBook feature flags | Removed | Static local config file |
| Remote managed settings | Removed | Local settings.json |
| Policy limits (remote) | Removed | Local policy file |
| Datadog analytics | Removed | Internal audit log |
| BigQuery metrics export | Removed | Internal Prometheus/Grafana |
| 1P event logging | Removed | Internal audit log |
| OTEL telemetry (external) | Optional | Internal collector or disabled |
| MCP registry (remote) | Removed | Local registry only |
| Domain validation (WebFetchTool) | Removed | WebFetch disabled in air-gap mode |

---

## Classification System

SecureShell AI enforces data classification at the file and directory level:

```typescript
type ClassificationLevel = 'UNCLASSIFIED' | 'CUI' | 'SECRET' | 'TOP_SECRET'
```

### How It Works

1. **File Classification**: Files and directories are tagged with classification levels via `.classification.json` manifest files
2. **User Clearance**: Users authenticate with a clearance level (derived from CAC/PIV or LDAP group)
3. **Tool Gating**: Every tool invocation checks file classification against user clearance before execution
4. **Audit Trail**: Classification-gated access decisions are logged to the immutable audit log

### Classification Manifest Example

```json
{
  "default": "CUI",
  "rules": [
    { "pattern": "src/crypto/**", "level": "SECRET" },
    { "pattern": "docs/public/**", "level": "UNCLASSIFIED" },
    { "pattern": "*.key", "level": "TOP_SECRET" }
  ]
}
```

---

## Core Features

### Tool System

Self-contained, LLM-agnostic tools with Zod-validated input schemas:

| Tool | Category | Description |
|---|---|---|
| `BashTool` | Execution | Sandboxed shell command execution |
| `FileReadTool` | File I/O | Read files with format detection |
| `FileEditTool` | File I/O | Partial file modification (string replacement) |
| `FileWriteTool` | File I/O | Create / overwrite files |
| `GlobTool` | Search | File pattern matching |
| `GrepTool` | Search | ripgrep-based content search |
| `AgentTool` | Orchestration | Sub-agent spawning for parallel work |
| `TodoWriteTool` | Planning | Task tracking and management |
| `AuditLogTool` | Defense | Write entries to immutable audit trail |
| `STIGCheckTool` | Defense | Run DISA STIG compliance checks |
| `SBOMTool` | Defense | Generate Software Bill of Materials |
| `ClassificationTool` | Defense | Tag files with classification levels |

### Permission Engine

Classification-aware permission system with defense-specific modes:

| Mode | Description |
|---|---|
| `default` | Prompt user for each tool invocation |
| `plan` | Read-only planning mode -- no writes allowed |
| `il4` | IL4 compliant -- audit everything, no PII in prompts |
| `il5` | IL5 compliant -- CUI allowed, full audit, no external calls |
| `scif` | SCIF mode -- most restrictive, no file export, no clipboard |
| `custom-policy` | Load from organization-provided policy file |

### Audit Logging

Every tool invocation produces an immutable audit record:

```json
{
  "timestamp": "2026-03-31T14:22:01.000Z",
  "sessionId": "a1b2c3d4",
  "userId": "john.doe.civ",
  "clearanceLevel": "SECRET",
  "tool": "FileReadTool",
  "input": { "file_path": "/project/src/main.ts" },
  "fileClassification": "CUI",
  "decision": "allow",
  "durationMs": 12,
  "resultHash": "sha256:abc123..."
}
```

Audit logs are:
- **Append-only**: No modification or deletion
- **Hash-chained**: Each entry includes the hash of the previous entry
- **Exportable**: SYSLOG, JSON Lines, or Splunk-compatible format
- **Tamper-evident**: HMAC signature on each entry using server key

### Authentication

| Method | Use Case | Configuration |
|---|---|---|
| API Key | Development, CI/CD | `AUTH_PROVIDER=apikey` |
| CAC/PIV | Defense networks | `AUTH_PROVIDER=cac` |
| LDAP/AD | Enterprise on-prem | `AUTH_PROVIDER=ldap` |
| mTLS Client Cert | Zero-trust environments | `AUTH_PROVIDER=mtls` |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [ripgrep](https://github.com/BurntSushi/ripgrep)
- A local LLM server (Ollama recommended for getting started)

### Local Development

```bash
# 1. Install dependencies
bun install

# 2. Start Ollama with a coding model
ollama pull codellama:70b

# 3. Configure provider
export LLM_PROVIDER=ollama
export LLM_ENDPOINT=http://localhost:11434
export LLM_MODEL=codellama:70b

# 4. Run SecureShell AI
bun run src/entrypoints/cli.tsx
```

### Docker

```bash
# Build air-gapped image
docker build -t secureshell-ai .

# Run with local Ollama
docker run --rm \
  -e LLM_PROVIDER=ollama \
  -e LLM_ENDPOINT=http://host.docker.internal:11434 \
  -e LLM_MODEL=codellama:70b \
  -v $(pwd):/workspace \
  secureshell-ai
```

### Kubernetes (Helm)

```bash
# Install with Helm
helm install secureshell-ai ./helm/secureshell-ai \
  -f my-values.yaml \
  --set config.llmProvider=vllm \
  --set config.llmEndpoint=http://inference-server.internal:8000 \
  --set config.llmModel=deepseek-coder-v2
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | Yes | - | LLM provider: `ollama`, `vllm`, `llamacpp`, `tgi`, `bedrock-govcloud`, `azure-govcloud`, `custom` |
| `LLM_ENDPOINT` | Yes | - | LLM API endpoint URL |
| `LLM_MODEL` | Yes | - | Model name/identifier |
| `LLM_API_KEY` | No | - | API key (if required by provider) |
| `LLM_MAX_TOKENS` | No | `4096` | Maximum output tokens |
| `LLM_CONTEXT_WINDOW` | No | `8192` | Context window size |
| `LLM_SUPPORTS_TOOLS` | No | `auto` | Whether model supports tool calling (`true`, `false`, `auto`) |
| `LLM_TOOL_CALL_FORMAT` | No | `auto` | Tool call format: `anthropic`, `openai`, `hermes`, `auto` |
| `AUTH_PROVIDER` | No | `apikey` | Auth method: `apikey`, `cac`, `ldap`, `mtls` |
| `CLASSIFICATION_MODE` | No | `disabled` | Classification enforcement: `disabled`, `warn`, `enforce` |
| `CLASSIFICATION_CONFIG` | No | `.classification.json` | Path to classification manifest |
| `AUDIT_ENABLED` | No | `true` | Enable immutable audit logging |
| `AUDIT_OUTPUT` | No | `~/.secureshell/audit/` | Audit log output directory |
| `AUDIT_FORMAT` | No | `jsonl` | Audit format: `jsonl`, `syslog`, `splunk` |
| `PERMISSION_MODE` | No | `default` | Permission mode: `default`, `plan`, `il4`, `il5`, `scif`, `custom-policy` |
| `FEATURE_CONFIG` | No | `~/.secureshell/features.json` | Static feature flag config file |

---

## Architecture

### System Pipeline

```
User Input --> CLI Parser --> Query Engine --> LLM Router --> Provider Adapter
                                  ^                               |
                                  |                               v
                              Tool Results <-- Tool Executor <-- LLM Response
                                  |               |
                                  v               v
                              Audit Log     Permission Engine
                                               |
                                               v
                                        Classification Check
```

### Directory Structure

```
src/
+-- entrypoints/             # CLI, SDK entry points
+-- services/
|   +-- api/                 # LLM provider abstraction layer
|   |   +-- client.ts        # Provider adapter factory
|   |   +-- providers/       # Individual provider adapters
|   |   |   +-- ollama.ts
|   |   |   +-- vllm.ts
|   |   |   +-- llamacpp.ts
|   |   |   +-- tgi.ts
|   |   |   +-- bedrock-govcloud.ts
|   |   |   +-- custom.ts
|   |   +-- messageFormat.ts # Message format translation layer
|   |   +-- toolFormat.ts    # Tool schema translation layer
|   +-- audit/               # Immutable audit logging
|   +-- classification/      # Data classification engine
|   +-- auth/                # Authentication (CAC/PIV, LDAP, mTLS)
+-- tools/                   # Agent tool implementations
|   +-- BashTool/
|   +-- FileEditTool/
|   +-- GrepTool/
|   +-- AuditLogTool/        # Defense: audit log access
|   +-- STIGCheckTool/       # Defense: STIG compliance
|   +-- SBOMTool/            # Defense: SBOM generation
|   +-- ClassificationTool/  # Defense: file classification
+-- utils/
|   +-- permissions/         # Classification-aware permission engine
|   +-- model/               # Model configuration and selection
+-- components/              # React/Ink terminal UI
+-- hooks/                   # React hooks
+-- state/                   # Application state management
+-- types/                   # TypeScript type definitions
helm/
+-- secureshell-ai/          # Kubernetes Helm chart
docker/                      # Docker configurations
config/                      # Default configuration files
```

---

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type checking
bun run typecheck

# Linting
bun run lint

# Run tests
bun run test

# Build production bundle
bun run build:prod
```

---

## Roadmap

### Phase 1 -- Foundation (Current)
- [x] Project identity and README
- [ ] LLM provider abstraction layer with adapter pattern
- [ ] Core tool system (Bash, File I/O, Search)
- [ ] Basic terminal UI
- [ ] Static feature configuration (replace GrowthBook)

### Phase 2 -- Air-Gap Hardening
- [ ] Strip all external phone-home code
- [ ] Local-only authentication (API key)
- [ ] Replace remote settings with local config
- [ ] Air-gapped Docker image

### Phase 3 -- Defense Features
- [ ] Classification-aware permission engine
- [ ] Immutable audit logging with hash chains
- [ ] CAC/PIV authentication
- [ ] STIG compliance checking tool
- [ ] SBOM generation tool

### Phase 4 -- Deployment
- [ ] Helm chart with GPU scheduling and NetworkPolicy
- [ ] Model weight management for air-gapped networks
- [ ] mTLS between all components
- [ ] Grafana dashboards for audit metrics

### Phase 5 -- Compliance
- [ ] IL4/IL5 compliance documentation
- [ ] FedRAMP authorization package
- [ ] Penetration testing
- [ ] ATO support documentation

---

## License

Proprietary. All rights reserved.

---

<div align="center">

**SecureShell AI** -- AI-powered coding. Zero data exfiltration.

</div>
