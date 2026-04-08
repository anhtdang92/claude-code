# Local LLM Setup

How to plug a local or self-hosted LLM into SecureShell AI. All facts below are verified against the source at the referenced file paths and line numbers.

## TL;DR

Set three environment variables and run:

```bash
export LLM_PROVIDER=ollama
export LLM_ENDPOINT=http://localhost:11434
export LLM_MODEL=codellama:70b
bun run src/entrypoints/cli.tsx
```

That's it. Your model must support OpenAI-style function/tool calling — see [Tool-calling requirement](#tool-calling-requirement) below.

---

## Supported providers

Five local/self-hosted providers are fully implemented (not stubs). Source: `src/services/api/providers/`.

| Provider | `LLM_PROVIDER` value | Adapter file | Default endpoint |
|---|---|---|---|
| Ollama | `ollama` | `src/services/api/providers/ollama.ts` | `http://localhost:11434` |
| vLLM | `vllm` | `src/services/api/providers/vllm.ts` | `http://localhost:8000` |
| llama.cpp | `llamacpp` | `src/services/api/providers/llamacpp.ts` | `http://localhost:8080` |
| TGI (HuggingFace) | `tgi` | `src/services/api/providers/tgi.ts` | `http://localhost:8080` |
| Custom OpenAI-compatible | `custom` | `src/services/api/providers/custom.ts` | (must set `LLM_ENDPOINT`) |

Gov-cloud providers (`bedrock-govcloud`, `azure-govcloud`) also exist but are out of scope for this doc.

The provider factory at `src/services/api/providers/index.ts:60-95` dispatches to the right adapter based on `LLM_PROVIDER`. If `LLM_PROVIDER` is unset, it defaults to `ollama` (see `src/utils/model/providers.ts:34-37`).

---

## Environment variables

All LLM config is environment-variable driven. Defined in `src/utils/model/providers.ts`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LLM_PROVIDER` | No | `ollama` | One of: `ollama`, `vllm`, `llamacpp`, `tgi`, `custom`, `bedrock-govcloud`, `azure-govcloud` |
| `LLM_ENDPOINT` | Depends | Per-provider default (see table above) | Required for `custom`; optional otherwise |
| `LLM_MODEL` | **Yes** | — | Throws `LLM_MODEL environment variable is required` if unset (`providers.ts:72-74`) |
| `LLM_API_KEY` | No | — | Bearer token; needed for endpoints that require auth (vLLM/TGI/custom) |
| `LLM_CONTEXT_WINDOW` | No | `8192` | Parsed as int (`providers.ts:82-84`). Match to your model's real context |
| `LLM_MAX_TOKENS` | No | `4096` | Max output tokens per response (`providers.ts:86-88`) |
| `LLM_TOOL_CALL_FORMAT` | No | Auto-detected | `openai` \| `anthropic` \| `hermes` (`providers.ts:96-117`) |

---

## Setup by provider

### Ollama (fastest on-ramp)

```bash
# Install and pull a tool-capable coding model
ollama pull codellama:70b

export LLM_PROVIDER=ollama
export LLM_ENDPOINT=http://localhost:11434
export LLM_MODEL=codellama:70b

bun run src/entrypoints/cli.tsx
```

- Ollama **0.3+** is required for native tool/function calling (`ollama.ts:5`).
- Health check pings `GET /api/tags` with a 5s timeout (`ollama.ts:143-152`).
- Chat goes to `POST /v1/chat/completions` (OpenAI-compatible, `ollama.ts:44`).

### vLLM (GPU cluster / production)

```bash
export LLM_PROVIDER=vllm
export LLM_ENDPOINT=http://inference-server.internal:8000
export LLM_MODEL=deepseek-coder-v2
# optional:
export LLM_API_KEY=<bearer-token>
export LLM_CONTEXT_WINDOW=32768
```

### llama.cpp

```bash
export LLM_PROVIDER=llamacpp
export LLM_ENDPOINT=http://localhost:8080
export LLM_MODEL=<model-name-served-by-llamacpp>
```

Uses grammar-constrained tool calling where supported.

### TGI (HuggingFace Text Generation Inference)

```bash
export LLM_PROVIDER=tgi
export LLM_ENDPOINT=http://localhost:8080
export LLM_MODEL=<hf-model-id>
export LLM_API_KEY=<token-if-needed>
```

### Custom OpenAI-compatible

For any endpoint that speaks `/v1/chat/completions`:

```bash
export LLM_PROVIDER=custom
export LLM_ENDPOINT=http://my-inference:8080/v1
export LLM_MODEL=my-model
export LLM_API_KEY=my-key  # optional
```

`LLM_ENDPOINT` is **required** for `custom` — `getLLMEndpoint()` throws if unset and no per-provider default applies (`providers.ts:65-67`).

---

## Tool-calling requirement

**This is the one thing that will break your setup if you get it wrong.**

SecureShell AI is a tool-heavy agent — it has 40+ tools (Bash, FileRead, FileEdit, Glob, Grep, Agent orchestration, etc.). Every turn, the model receives tool schemas and is expected to emit tool calls in OpenAI function-calling format.

- Tool schema translation lives in `src/services/api/messageFormat.ts` — `buildOpenAIMessages()` and `buildOpenAITools()`.
- Each local provider sends tools via its `buildRequestBody()`. For Ollama this is `ollama.ts:165-167`:
  ```ts
  if (params.tools?.length) {
    body.tools = buildOpenAITools(params.tools)
  }
  ```
- Format auto-detection (`providers.ts:104-116`): Ollama / vLLM / llama.cpp / TGI / custom → `openai`. You can override with `LLM_TOOL_CALL_FORMAT=hermes` for prompt-based tool calling on models without native support, but agent capability will be degraded.

**Known-good local models (native OpenAI tool calling):**

- CodeLlama (via Ollama 0.3+)
- DeepSeek Coder v2
- Llama 3.1 / 3.3 Instruct variants with tool support
- Any model vLLM or TGI can serve with `tools` parameter support

If your model silently ignores the `tools` field, the agent will appear to "forget" how to read files, run commands, etc. — that's the symptom of a non-tool-capable backend.

---

## Gotchas and requirements

1. **Streaming is required.** All adapters use `POST /v1/chat/completions` with `stream: true` and parse SSE chunks (`ollama.ts:41-113`). Your endpoint must support streaming.
2. **`LLM_MODEL` must be set or startup throws.** There is no default model — see `providers.ts:70-76`.
3. **Context window defaults to 8192.** Undersize it and tool-heavy loops will truncate mid-task. For a 32K-context model, set `LLM_CONTEXT_WINDOW=32768` explicitly.
4. **`max_tokens` is always sent.** Defaults to 4096 (`providers.ts:86-88`). If your inference server rejects `max_tokens`, requests will fail — use `custom` and a proxy, or patch the adapter.
5. **Auth is optional for Ollama / llama.cpp by default.** vLLM / TGI / custom can require a bearer token via `LLM_API_KEY`.
6. **Docker → host Ollama:** use `http://host.docker.internal:11434` (see `README.md:305-310`).
7. **Client is cached per-provider.** Changing env vars at runtime won't take effect until you call `clearLLMClientCache()` or restart (`src/services/api/providers/index.ts:19-58`).
8. **`.env.example` is Anthropic-focused.** Don't rely on it for local-LLM setup — use this doc or `README.md:79-116`.

---

## Verify your setup

Before starting a real session:

```bash
# 1. Confirm env vars
env | grep ^LLM_

# 2. Confirm the endpoint answers
curl -s $LLM_ENDPOINT/v1/chat/completions -X POST \
  -H "Content-Type: application/json" \
  -d '{"model":"'"$LLM_MODEL"'","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'

# 3. (Ollama only) list available models
curl -s $LLM_ENDPOINT/api/tags | jq '.models[].name'

# 4. Start the CLI
bun run src/entrypoints/cli.tsx
```

If step 2 returns a valid streaming or non-streaming chat completion, the adapter will work. If it returns a `tools`-related error, your model/server doesn't support function calling — pick a different model.

---

## Docker quick start

```bash
docker build -t secureshell-ai .

docker run --rm \
  -e LLM_PROVIDER=ollama \
  -e LLM_ENDPOINT=http://host.docker.internal:11434 \
  -e LLM_MODEL=codellama:70b \
  -v $(pwd):/workspace \
  secureshell-ai
```

## Kubernetes (Helm)

```bash
helm install secureshell-ai ./helm/secureshell-ai \
  -f my-values.yaml \
  --set config.llmProvider=vllm \
  --set config.llmEndpoint=http://inference-server.internal:8000 \
  --set config.llmModel=deepseek-coder-v2
```

---

## Source references

- Provider type + env var readers: `src/utils/model/providers.ts`
- Client factory / caching: `src/services/api/providers/index.ts`
- Ollama adapter: `src/services/api/providers/ollama.ts`
- vLLM adapter: `src/services/api/providers/vllm.ts`
- llama.cpp adapter: `src/services/api/providers/llamacpp.ts`
- TGI adapter: `src/services/api/providers/tgi.ts`
- Custom OpenAI-compatible adapter: `src/services/api/providers/custom.ts`
- Tool / message format translation: `src/services/api/messageFormat.ts`
- README provider section: `README.md:79-116`, `README.md:272-322`
