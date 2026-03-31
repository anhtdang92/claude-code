/**
 * SecureShell AI — Client Bridge
 *
 * Bridges the new LLM-agnostic client system with the existing codebase.
 * Wraps getLLMClient() to provide compatibility with call sites that
 * previously used getAnthropicClient().
 *
 * This is the primary integration point between the new provider system
 * and the existing query engine / tool execution pipeline.
 *
 * INTEGRATION POINTS:
 * - src/services/api/claude.ts:1780 (queryModel → getAnthropicClient)
 * - src/services/api/claude.ts:546  (verifyApiKey → getAnthropicClient)
 * - src/services/api/claude.ts:845  (queryModelWithoutStreaming)
 * - src/utils/sideQuery.ts:124     (side queries for classifiers)
 */

import type {
	LLMChatParams,
	LLMClient,
	LLMContentBlock,
	LLMMessage,
	LLMStreamEvent,
	LLMToolSchema,
} from './llmClient.js'
import { getLLMClient } from './providers/index.js'
import {
	getAPIProvider,
	getLLMMaxTokens,
	getLLMModel,
	getToolCallFormat,
} from '../../utils/model/providers.js'
import type { Message, AssistantMessage, UserMessage } from '../../types/message.js'

// ============================================================================
// Message Conversion: Internal Message[] → LLMMessage[]
// ============================================================================

/**
 * Convert the existing internal Message array (Anthropic-flavored) to
 * the new LLM-agnostic LLMMessage array.
 *
 * The existing codebase uses BetaMessage / ContentBlockParam types from
 * the Anthropic SDK. This function normalizes them to our agnostic format.
 */
export function convertMessagesToLLM(messages: Message[]): LLMMessage[] {
	const result: LLMMessage[] = []

	for (const msg of messages) {
		switch (msg.type) {
			case 'user': {
				const userMsg = msg as UserMessage
				if (typeof userMsg.message.content === 'string') {
					result.push({ role: 'user', content: userMsg.message.content })
				} else {
					// ContentBlockParam[] — may contain text, tool_result, images
					const blocks: LLMContentBlock[] = []
					const toolResults: LLMMessage[] = []

					for (const block of userMsg.message.content as Array<Record<string, unknown>>) {
						if (block.type === 'text') {
							blocks.push({ type: 'text', text: block.text as string })
						} else if (block.type === 'tool_result') {
							// Tool results become separate tool-role messages
							const content = typeof block.content === 'string'
								? block.content
								: JSON.stringify(block.content)
							toolResults.push({
								role: 'tool',
								content: [{
									type: 'tool_result',
									toolCallId: block.tool_use_id as string,
									content,
									isError: block.is_error as boolean | undefined,
								}],
							})
						}
					}

					if (blocks.length > 0) {
						result.push({ role: 'user', content: blocks })
					}
					for (const tr of toolResults) {
						result.push(tr)
					}
				}
				break
			}

			case 'assistant': {
				const assistantMsg = msg as AssistantMessage
				const content = assistantMsg.message?.content
				if (!content) break

				const blocks: LLMContentBlock[] = []

				for (const block of content as Array<Record<string, unknown>>) {
					if (block.type === 'text') {
						blocks.push({ type: 'text', text: block.text as string })
					} else if (block.type === 'tool_use') {
						blocks.push({
							type: 'tool_call',
							id: block.id as string,
							name: block.name as string,
							arguments: typeof block.input === 'string'
								? block.input
								: JSON.stringify(block.input),
						})
					}
					// Skip thinking blocks — they're not sent back to the LLM
				}

				if (blocks.length > 0) {
					result.push({ role: 'assistant', content: blocks })
				}
				break
			}

			case 'system': {
				// System messages are typically informational and not sent to the LLM
				// They're handled separately via the system prompt
				break
			}
		}
	}

	return result
}

// ============================================================================
// Tool Schema Conversion
// ============================================================================

/**
 * Convert internal Tool definitions to LLM-agnostic tool schemas.
 * The existing tools use Zod schemas; we need JSON Schema for the LLM.
 */
export function convertToolsToLLMSchema(
	tools: Array<{
		name: string
		description?: string
		inputSchema?: unknown
		inputJSONSchema?: Record<string, unknown>
		prompt?: (options: unknown) => Promise<string>
	}>,
	descriptions: Map<string, string>,
): LLMToolSchema[] {
	return tools.map((tool) => {
		let parameters: Record<string, unknown>

		if (tool.inputJSONSchema) {
			parameters = tool.inputJSONSchema
		} else if (tool.inputSchema && typeof tool.inputSchema === 'object') {
			// Try to use Zod's built-in JSON schema conversion
			const schema = tool.inputSchema as { _def?: unknown }
			if ('toJsonSchema' in (tool.inputSchema as object)) {
				parameters = (tool.inputSchema as { toJsonSchema(): Record<string, unknown> }).toJsonSchema()
			} else {
				parameters = { type: 'object', properties: {} }
			}
		} else {
			parameters = { type: 'object', properties: {} }
		}

		return {
			name: tool.name,
			description: descriptions.get(tool.name) ?? tool.name,
			parameters,
		}
	})
}

// ============================================================================
// Streaming Bridge
// ============================================================================

/**
 * Execute a streaming LLM query using the new provider system.
 * Returns an async generator yielding LLMStreamEvents.
 *
 * This is the function that replaces the core
 * `anthropic.beta.messages.create({stream: true})` call in claude.ts:1822.
 */
export async function* streamQuery(params: {
	messages: LLMMessage[]
	systemPrompt: string
	tools: LLMToolSchema[]
	maxTokens?: number
	temperature?: number
	model?: string
	signal?: AbortSignal
}): AsyncGenerator<LLMStreamEvent> {
	const client = await getLLMClient()

	const chatParams: LLMChatParams = {
		model: params.model ?? getLLMModel(),
		messages: params.messages,
		systemPrompt: params.systemPrompt,
		tools: params.tools.length > 0 ? params.tools : undefined,
		stream: true,
		maxTokens: params.maxTokens ?? getLLMMaxTokens(),
		temperature: params.temperature,
	}

	yield* client.chatStream(chatParams, params.signal)
}

// ============================================================================
// Non-Streaming Bridge
// ============================================================================

/**
 * Execute a non-streaming LLM query (fallback mode).
 * Replaces the non-streaming path in claude.ts.
 */
export async function nonStreamQuery(params: {
	messages: LLMMessage[]
	systemPrompt: string
	tools: LLMToolSchema[]
	maxTokens?: number
	temperature?: number
	model?: string
	signal?: AbortSignal
}): Promise<{
	content: LLMContentBlock[]
	stopReason: string
	usage: { inputTokens: number; outputTokens: number }
}> {
	const client = await getLLMClient()

	const chatParams: LLMChatParams = {
		model: params.model ?? getLLMModel(),
		messages: params.messages,
		systemPrompt: params.systemPrompt,
		tools: params.tools.length > 0 ? params.tools : undefined,
		stream: false,
		maxTokens: params.maxTokens ?? getLLMMaxTokens(),
		temperature: params.temperature,
	}

	return client.chat(chatParams, params.signal)
}

// ============================================================================
// API Key Verification Bridge
// ============================================================================

/**
 * Verify that the LLM provider is reachable and the credentials work.
 * Replaces verifyApiKey() in claude.ts:530.
 */
export async function verifyLLMConnection(): Promise<boolean> {
	try {
		const client = await getLLMClient()

		// Use healthCheck if available
		if (client.healthCheck) {
			return await client.healthCheck()
		}

		// Fallback: try a minimal request
		const response = await client.chat({
			model: getLLMModel(),
			messages: [{ role: 'user', content: 'test' }],
			stream: false,
			maxTokens: 1,
		})

		return response.content.length > 0
	} catch {
		return false
	}
}

// ============================================================================
// Provider Info
// ============================================================================

/**
 * Get current provider information for display/logging.
 */
export function getProviderInfo(): {
	provider: string
	model: string
	toolFormat: string
} {
	return {
		provider: getAPIProvider(),
		model: getLLMModel(),
		toolFormat: getToolCallFormat(),
	}
}
