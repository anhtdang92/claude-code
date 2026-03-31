/**
 * SecureShell AI — Unified LLM Client Interface
 *
 * Provider-agnostic interface for LLM communication.
 * All provider adapters implement this interface, enabling seamless
 * switching between local LLMs and cloud providers.
 */

// ============================================================================
// Message Types (Provider-Agnostic)
// ============================================================================

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LLMTextContent {
	type: 'text'
	text: string
}

export interface LLMToolCallContent {
	type: 'tool_call'
	id: string
	name: string
	arguments: string // JSON string
}

export interface LLMToolResultContent {
	type: 'tool_result'
	toolCallId: string
	content: string
	isError?: boolean
}

export type LLMContentBlock = LLMTextContent | LLMToolCallContent | LLMToolResultContent

export interface LLMMessage {
	role: LLMRole
	content: string | LLMContentBlock[]
}

// ============================================================================
// Tool Schema Types (Provider-Agnostic)
// ============================================================================

export interface LLMToolSchema {
	name: string
	description: string
	parameters: Record<string, unknown> // JSON Schema
}

// ============================================================================
// Request Types
// ============================================================================

export interface LLMChatParams {
	model: string
	messages: LLMMessage[]
	systemPrompt?: string
	tools?: LLMToolSchema[]
	stream: boolean
	maxTokens?: number
	temperature?: number
	stopSequences?: string[]
}

// ============================================================================
// Response / Streaming Types
// ============================================================================

export interface LLMUsage {
	inputTokens: number
	outputTokens: number
}

export type LLMStreamEvent =
	| { type: 'message_start'; messageId: string }
	| { type: 'text_delta'; text: string }
	| { type: 'tool_call_start'; id: string; name: string }
	| { type: 'tool_call_delta'; id: string; arguments: string }
	| { type: 'tool_call_end'; id: string }
	| {
			type: 'message_end'
			stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
			usage: LLMUsage
	  }
	| { type: 'error'; error: string; retryable: boolean }

export interface LLMNonStreamingResponse {
	id: string
	content: LLMContentBlock[]
	stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
	usage: LLMUsage
}

// ============================================================================
// Client Interface
// ============================================================================

export interface LLMClient {
	/**
	 * Send a streaming chat completion request.
	 * Returns an async iterable of stream events.
	 */
	chatStream(params: LLMChatParams, signal?: AbortSignal): AsyncIterable<LLMStreamEvent>

	/**
	 * Send a non-streaming chat completion request.
	 * Used as fallback when streaming fails.
	 */
	chat(params: LLMChatParams, signal?: AbortSignal): Promise<LLMNonStreamingResponse>

	/**
	 * List available models from the provider.
	 * Not all providers support this.
	 */
	listModels?(): Promise<string[]>

	/**
	 * Check if the provider is reachable and ready.
	 */
	healthCheck?(): Promise<boolean>

	/**
	 * Provider name for logging/debugging.
	 */
	readonly providerName: string
}

// ============================================================================
// Client Factory Types
// ============================================================================

export interface LLMClientConfig {
	endpoint: string
	apiKey?: string
	model: string
	maxRetries?: number
	timeoutMs?: number
	contextWindow?: number
	maxTokens?: number
}
