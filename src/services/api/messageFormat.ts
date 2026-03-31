/**
 * SecureShell AI — Message Format Translation Layer
 *
 * Translates between the internal LLM-agnostic message format and
 * provider-specific formats (OpenAI, Anthropic).
 *
 * This is the critical bridge that makes LLM-agnostic operation possible.
 */

import type {
	LLMContentBlock,
	LLMMessage,
	LLMNonStreamingResponse,
	LLMStreamEvent,
	LLMToolSchema,
	LLMUsage,
} from './llmClient.js'

// ============================================================================
// OpenAI Format Translation
// ============================================================================

/**
 * Convert internal LLMMessage[] to OpenAI chat completion messages.
 * Handles:
 * - System prompt as first message
 * - Tool call content blocks -> OpenAI tool_calls format
 * - Tool result content blocks -> OpenAI tool role messages
 */
export function buildOpenAIMessages(
	messages: LLMMessage[],
	systemPrompt?: string,
): OpenAIMessage[] {
	const result: OpenAIMessage[] = []

	if (systemPrompt) {
		result.push({ role: 'system', content: systemPrompt })
	}

	for (const msg of messages) {
		if (msg.role === 'system') {
			// System messages go directly
			const text = typeof msg.content === 'string' ? msg.content : extractText(msg.content)
			result.push({ role: 'system', content: text })
			continue
		}

		if (msg.role === 'tool') {
			// Tool results -> OpenAI tool role
			if (typeof msg.content === 'string') {
				result.push({
					role: 'tool',
					content: msg.content,
					tool_call_id: msg.toolCallId ?? '',
				})
			} else {
				for (const block of msg.content) {
					if (block.type === 'tool_result') {
						result.push({
							role: 'tool',
							content: block.content,
							tool_call_id: block.toolCallId,
						})
					}
				}
			}
			continue
		}

		if (msg.role === 'assistant') {
			// Assistant messages may contain text + tool_calls
			if (typeof msg.content === 'string') {
				result.push({ role: 'assistant', content: msg.content })
			} else {
				const textParts: string[] = []
				const toolCalls: OpenAIToolCall[] = []

				for (const block of msg.content) {
					if (block.type === 'text') {
						textParts.push(block.text)
					} else if (block.type === 'tool_call') {
						toolCalls.push({
							id: block.id,
							type: 'function' as const,
							function: {
								name: block.name,
								arguments: block.arguments,
							},
						})
					}
				}

				const assistantMsg: OpenAIMessage = {
					role: 'assistant',
					content: textParts.join('') || null,
				}
				if (toolCalls.length > 0) {
					assistantMsg.tool_calls = toolCalls
				}
				result.push(assistantMsg)
			}
			continue
		}

		// User messages
		if (typeof msg.content === 'string') {
			result.push({ role: 'user', content: msg.content })
		} else {
			const text = extractText(msg.content)
			result.push({ role: 'user', content: text })
		}
	}

	return result
}

/**
 * Convert internal LLMToolSchema[] to OpenAI function tool format.
 */
export function buildOpenAITools(tools: LLMToolSchema[]): OpenAITool[] {
	return tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	}))
}

/**
 * Parse an OpenAI SSE streaming chunk into internal LLMStreamEvent[].
 * Handles text deltas, tool call deltas, and usage/finish events.
 */
export function parseOpenAIStreamChunk(chunk: OpenAIStreamChunk): LLMStreamEvent[] {
	const events: LLMStreamEvent[] = []

	// Handle usage-only chunks (stream_options: include_usage)
	if (chunk.usage) {
		events.push({
			type: 'message_end',
			stopReason: 'end_turn',
			usage: {
				inputTokens: chunk.usage.prompt_tokens ?? 0,
				outputTokens: chunk.usage.completion_tokens ?? 0,
			},
		})
		return events
	}

	if (!chunk.choices || chunk.choices.length === 0) {
		return events
	}

	for (const choice of chunk.choices) {
		const delta = choice.delta
		if (!delta) continue

		// Text content
		if (delta.content) {
			events.push({ type: 'text_delta', text: delta.content })
		}

		// Tool calls
		if (delta.tool_calls) {
			for (const tc of delta.tool_calls) {
				if (tc.function?.name) {
					// Start of a new tool call
					events.push({
						type: 'tool_call_start',
						id: tc.id ?? `call_${tc.index}`,
						name: tc.function.name,
					})
				}
				if (tc.function?.arguments) {
					events.push({
						type: 'tool_call_delta',
						id: tc.id ?? `call_${tc.index}`,
						arguments: tc.function.arguments,
					})
				}
			}
		}

		// Finish reason
		if (choice.finish_reason) {
			const stopReason = mapOpenAIFinishReason(choice.finish_reason)
			// Tool call ends are inferred from finish_reason
			if (choice.finish_reason === 'tool_calls') {
				// All pending tool calls are now complete
				if (delta.tool_calls) {
					for (const tc of delta.tool_calls) {
						events.push({
							type: 'tool_call_end',
							id: tc.id ?? `call_${tc.index}`,
						})
					}
				}
			}
			events.push({
				type: 'message_end',
				stopReason,
				usage: { inputTokens: 0, outputTokens: 0 },
			})
		}
	}

	return events
}

/**
 * Parse a non-streaming OpenAI response into internal format.
 */
export function parseOpenAINonStreamingResponse(json: OpenAINonStreamingResponse): LLMNonStreamingResponse {
	const choice = json.choices?.[0]
	if (!choice) {
		throw new Error('No choices in OpenAI response')
	}

	const content: LLMContentBlock[] = []

	if (choice.message.content) {
		content.push({ type: 'text', text: choice.message.content })
	}

	if (choice.message.tool_calls) {
		for (const tc of choice.message.tool_calls) {
			content.push({
				type: 'tool_call',
				id: tc.id,
				name: tc.function.name,
				arguments: tc.function.arguments,
			})
		}
	}

	return {
		id: json.id ?? crypto.randomUUID(),
		content,
		stopReason: mapOpenAIFinishReason(choice.finish_reason),
		usage: {
			inputTokens: json.usage?.prompt_tokens ?? 0,
			outputTokens: json.usage?.completion_tokens ?? 0,
		},
	}
}

// ============================================================================
// Helpers
// ============================================================================

function extractText(blocks: LLMContentBlock[]): string {
	return blocks
		.filter((b) => b.type === 'text')
		.map((b) => (b as { type: 'text'; text: string }).text)
		.join('')
}

function mapOpenAIFinishReason(
	reason: string | null,
): 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' {
	switch (reason) {
		case 'stop':
			return 'end_turn'
		case 'tool_calls':
		case 'function_call':
			return 'tool_use'
		case 'length':
			return 'max_tokens'
		default:
			return 'end_turn'
	}
}

// ============================================================================
// OpenAI Types (minimal, just what we need)
// ============================================================================

interface OpenAIMessage {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content: string | null
	tool_calls?: OpenAIToolCall[]
	tool_call_id?: string
}

interface OpenAIToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string
	}
}

interface OpenAITool {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

interface OpenAIStreamChunk {
	id?: string
	choices?: Array<{
		index: number
		delta: {
			role?: string
			content?: string | null
			tool_calls?: Array<{
				index: number
				id?: string
				type?: string
				function?: {
					name?: string
					arguments?: string
				}
			}>
		}
		finish_reason?: string | null
	}>
	usage?: {
		prompt_tokens?: number
		completion_tokens?: number
		total_tokens?: number
	}
}

interface OpenAINonStreamingResponse {
	id?: string
	choices: Array<{
		index: number
		message: {
			role: string
			content: string | null
			tool_calls?: Array<{
				id: string
				type: string
				function: {
					name: string
					arguments: string
				}
			}>
		}
		finish_reason: string
	}>
	usage?: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}
