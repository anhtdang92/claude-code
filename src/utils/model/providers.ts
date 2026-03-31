/**
 * SecureShell AI — LLM Provider Types
 *
 * Replaces Anthropic-only provider abstraction with LLM-agnostic provider system.
 * Supports local LLMs (Ollama, vLLM, llama.cpp, TGI) and gov-cloud providers.
 */

export type APIProvider =
	| 'ollama'
	| 'vllm'
	| 'llamacpp'
	| 'tgi'
	| 'bedrock-govcloud'
	| 'azure-govcloud'
	| 'custom'

export function getAPIProvider(): APIProvider {
	const provider = process.env.LLM_PROVIDER?.toLowerCase()
	switch (provider) {
		case 'ollama':
			return 'ollama'
		case 'vllm':
			return 'vllm'
		case 'llamacpp':
			return 'llamacpp'
		case 'tgi':
			return 'tgi'
		case 'bedrock-govcloud':
			return 'bedrock-govcloud'
		case 'azure-govcloud':
			return 'azure-govcloud'
		case 'custom':
			return 'custom'
		default:
			// Default to ollama for local development
			return 'ollama'
	}
}

export function isLocalProvider(): boolean {
	const provider = getAPIProvider()
	return provider === 'ollama' || provider === 'vllm' || provider === 'llamacpp' || provider === 'tgi'
}

export function isGovCloudProvider(): boolean {
	const provider = getAPIProvider()
	return provider === 'bedrock-govcloud' || provider === 'azure-govcloud'
}

export function getLLMEndpoint(): string {
	const endpoint = process.env.LLM_ENDPOINT
	if (endpoint) {
		return endpoint
	}
	// Sensible defaults per provider
	switch (getAPIProvider()) {
		case 'ollama':
			return 'http://localhost:11434'
		case 'vllm':
			return 'http://localhost:8000'
		case 'llamacpp':
			return 'http://localhost:8080'
		case 'tgi':
			return 'http://localhost:8080'
		default:
			throw new Error('LLM_ENDPOINT must be set for this provider')
	}
}

export function getLLMModel(): string {
	const model = process.env.LLM_MODEL
	if (!model) {
		throw new Error('LLM_MODEL environment variable is required')
	}
	return model
}

export function getLLMApiKey(): string | undefined {
	return process.env.LLM_API_KEY
}

export function getLLMContextWindow(): number {
	return parseInt(process.env.LLM_CONTEXT_WINDOW || '8192', 10)
}

export function getLLMMaxTokens(): number {
	return parseInt(process.env.LLM_MAX_TOKENS || '4096', 10)
}

/**
 * Determine the tool calling format for the current provider/model.
 * - 'openai': Standard OpenAI function_calling format
 * - 'anthropic': Anthropic tool_use content block format
 * - 'hermes': Prompt-based tool calling for models without native support
 */
export type ToolCallFormat = 'openai' | 'anthropic' | 'hermes'

export function getToolCallFormat(): ToolCallFormat {
	const explicit = process.env.LLM_TOOL_CALL_FORMAT?.toLowerCase()
	if (explicit === 'openai' || explicit === 'anthropic' || explicit === 'hermes') {
		return explicit
	}
	// Auto-detect based on provider
	switch (getAPIProvider()) {
		case 'bedrock-govcloud':
			return 'anthropic'
		case 'ollama':
		case 'vllm':
		case 'llamacpp':
		case 'tgi':
		case 'azure-govcloud':
		case 'custom':
			return 'openai'
		default:
			return 'openai'
	}
}
