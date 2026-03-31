/**
 * SecureShell AI — llama.cpp Server Provider Adapter
 *
 * Connects to a llama.cpp server instance via its OpenAI-compatible API.
 * Supports tool calling via grammar-constrained generation.
 *
 * Default endpoint: http://localhost:8080
 * API docs: https://github.com/ggerganov/llama.cpp/blob/master/examples/server/README.md
 */

import type {
	LLMChatParams,
	LLMClient,
	LLMClientConfig,
	LLMNonStreamingResponse,
	LLMStreamEvent,
} from '../llmClient.js'
import {
	buildOpenAIMessages,
	buildOpenAITools,
	parseOpenAIStreamChunk,
	parseOpenAINonStreamingResponse,
} from '../messageFormat.js'

export class LlamaCppClient implements LLMClient {
	readonly providerName = 'llamacpp'
	private readonly endpoint: string
	private readonly model: string
	private readonly apiKey?: string
	private readonly timeoutMs: number

	constructor(config: LLMClientConfig) {
		this.endpoint = config.endpoint.replace(/\/$/, '')
		this.model = config.model
		this.apiKey = config.apiKey
		this.timeoutMs = config.timeoutMs ?? 600_000
	}

	async *chatStream(params: LLMChatParams, signal?: AbortSignal): AsyncIterable<LLMStreamEvent> {
		const body = this.buildRequestBody(params, true)
		const headers: Record<string, string> = { 'Content-Type': 'application/json' }
		if (this.apiKey) {
			headers['Authorization'] = `Bearer ${this.apiKey}`
		}

		const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal,
		})

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error')
			yield {
				type: 'error',
				error: `llama.cpp API error (${response.status}): ${errorText}`,
				retryable: response.status >= 500 || response.status === 429,
			}
			return
		}

		if (!response.body) {
			yield { type: 'error', error: 'No response body from llama.cpp', retryable: true }
			return
		}

		yield { type: 'message_start', messageId: crypto.randomUUID() }

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''

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

					try {
						const chunk = JSON.parse(trimmed.slice(6))
						const events = parseOpenAIStreamChunk(chunk)
						for (const event of events) {
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
	}

	async chat(params: LLMChatParams, signal?: AbortSignal): Promise<LLMNonStreamingResponse> {
		const body = this.buildRequestBody(params, false)
		const headers: Record<string, string> = { 'Content-Type': 'application/json' }
		if (this.apiKey) {
			headers['Authorization'] = `Bearer ${this.apiKey}`
		}

		const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal,
		})

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error')
			throw new Error(`llama.cpp API error (${response.status}): ${errorText}`)
		}

		return parseOpenAINonStreamingResponse(await response.json())
	}

	async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.endpoint}/health`, {
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

		return body
	}
}
