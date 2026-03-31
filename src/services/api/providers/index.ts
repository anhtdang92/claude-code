/**
 * SecureShell AI — LLM Client Factory
 *
 * Creates the appropriate LLM client based on the configured provider.
 * This replaces the original getAnthropicClient() function.
 */

import type { LLMClient, LLMClientConfig } from '../llmClient.js'
import {
	getAPIProvider,
	getLLMApiKey,
	getLLMEndpoint,
	getLLMMaxTokens,
	getLLMModel,
	getLLMContextWindow,
	type APIProvider,
} from '../../../utils/model/providers.js'

let cachedClient: LLMClient | null = null
let cachedProvider: APIProvider | null = null

/**
 * Get or create the LLM client for the current provider configuration.
 * Caches the client instance for reuse across requests.
 */
export async function getLLMClient(options?: {
	maxRetries?: number
	timeoutMs?: number
}): Promise<LLMClient> {
	const provider = getAPIProvider()

	// Return cached client if provider hasn't changed
	if (cachedClient && cachedProvider === provider) {
		return cachedClient
	}

	const config: LLMClientConfig = {
		endpoint: getLLMEndpoint(),
		apiKey: getLLMApiKey(),
		model: getLLMModel(),
		maxRetries: options?.maxRetries ?? 3,
		timeoutMs: options?.timeoutMs ?? 600_000,
		contextWindow: getLLMContextWindow(),
		maxTokens: getLLMMaxTokens(),
	}

	cachedClient = await createClient(provider, config)
	cachedProvider = provider
	return cachedClient
}

/**
 * Clear the cached client. Useful for testing or when config changes.
 */
export function clearLLMClientCache(): void {
	cachedClient = null
	cachedProvider = null
}

async function createClient(provider: APIProvider, config: LLMClientConfig): Promise<LLMClient> {
	switch (provider) {
		case 'ollama': {
			const { OllamaClient } = await import('./ollama.js')
			return new OllamaClient(config)
		}
		case 'vllm': {
			const { VLLMClient } = await import('./vllm.js')
			return new VLLMClient(config)
		}
		case 'llamacpp': {
			const { LlamaCppClient } = await import('./llamacpp.js')
			return new LlamaCppClient(config)
		}
		case 'tgi': {
			const { TGIClient } = await import('./tgi.js')
			return new TGIClient(config)
		}
		case 'bedrock-govcloud': {
			const { BedrockGovCloudClient } = await import('./bedrockGovcloud.js')
			return new BedrockGovCloudClient(config)
		}
		case 'azure-govcloud': {
			// Azure GovCloud uses the custom OpenAI-compatible adapter
			// pointed at the Azure OpenAI endpoint
			const { CustomOpenAIClient } = await import('./custom.js')
			return new CustomOpenAIClient(config)
		}
		case 'custom': {
			const { CustomOpenAIClient } = await import('./custom.js')
			return new CustomOpenAIClient(config)
		}
		default:
			throw new Error(`Unknown LLM provider: ${provider}`)
	}
}
