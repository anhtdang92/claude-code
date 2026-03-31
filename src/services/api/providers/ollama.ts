/**
 * SecureShell AI — Ollama Provider Adapter
 *
 * Connects to a local Ollama instance via its OpenAI-compatible API.
 * Ollama 0.3+ supports tool/function calling.
 *
 * Default endpoint: http://localhost:11434
 * API docs: https://github.com/ollama/ollama/blob/main/docs/openai.md
 */

import type {
	LLMChatParams,
	LLMClient,
	LLMClientConfig,
	LLMContentBlock,
	LLMMessage,
	LLMNonStreamingResponse,
	LLMStreamEvent,
	LLMToolSchema,
	LLMUsage,
} from '../llmClient.js'
import {
	buildOpenAIMessages,
	buildOpenAITools,
	parseOpenAIStreamChunk,
	parseOpenAINonStreamingResponse,
} from '../messageFormat.js'

export class OllamaClient implements LLMClient {
	readonly providerName = 'ollama'
	private readonly endpoint: string
	private readonly model: string
	private readonly timeoutMs: number

	constructor(config: LLMClientConfig) {
		this.endpoint = config.endpoint.replace(/\/$/, '')
		this.model = config.model
		this.timeoutMs = config.timeoutMs ?? 600_000
	}

	async *chatStream(params: LLMChatParams, signal?: AbortSignal): AsyncIterable<LLMStreamEvent> {
		const body = this.buildRequestBody(params, true)

		const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal,
		})

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error')
			yield {
				type: 'error',
				error: `Ollama API error (${response.status}): ${errorText}`,
				retryable: response.status >= 500 || response.status === 429,
			}
			return
		}

		if (!response.body) {
			yield { type: 'error', error: 'No response body from Ollama', retryable: true }
			return
		}

		yield { type: 'message_start', messageId: crypto.randomUUID() }

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		let totalInputTokens = 0
		let totalOutputTokens = 0

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split('\n')
				buffer = lines.pop() ?? ''

				for (const line of lines) {
					const trimmed = line.trim()
					if (!trimmed || trimmed === 'data: [DONE]') continue
					if (!trimmed.startsWith('data: ')) continue

					const jsonStr = trimmed.slice(6)
					try {
						const chunk = JSON.parse(jsonStr)
						const events = parseOpenAIStreamChunk(chunk)
						for (const event of events) {
							if (event.type === 'message_end') {
								totalInputTokens += event.usage.inputTokens
								totalOutputTokens += event.usage.outputTokens
							}
							yield event
						}
					} catch {
						// Skip malformed chunks
					}
				}
			}
		} finally {
			reader.releaseLock()
		}

		yield {
			type: 'message_end',
			stopReason: 'end_turn',
			usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
		}
	}

	async chat(params: LLMChatParams, signal?: AbortSignal): Promise<LLMNonStreamingResponse> {
		const body = this.buildRequestBody(params, false)

		const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal,
		})

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error')
			throw new Error(`Ollama API error (${response.status}): ${errorText}`)
		}

		const json = await response.json()
		return parseOpenAINonStreamingResponse(json)
	}

	async listModels(): Promise<string[]> {
		const response = await fetch(`${this.endpoint}/api/tags`)
		if (!response.ok) {
			throw new Error(`Failed to list Ollama models: ${response.status}`)
		}
		const json = (await response.json()) as { models: Array<{ name: string }> }
		return json.models.map((m) => m.name)
	}

	async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.endpoint}/api/tags`, {
				signal: AbortSignal.timeout(5000),
			})
			return response.ok
		} catch {
			return false
		}
	}

	private buildRequestBody(params: LLMChatParams, stream: boolean): Record<string, unknown> {
		const messages = buildOpenAIMessages(params.messages, params.systemPrompt)
		const body: Record<string, unknown> = {
			model: params.model || this.model,
			messages,
			stream,
			...(params.maxTokens && { max_tokens: params.maxTokens }),
			...(params.temperature !== undefined && { temperature: params.temperature }),
			...(params.stopSequences?.length && { stop: params.stopSequences }),
		}

		if (params.tools?.length) {
			body.tools = buildOpenAITools(params.tools)
		}

		if (stream) {
			body.stream_options = { include_usage: true }
		}

		return body
	}
}
