/**
 * SecureShell AI — AWS Bedrock GovCloud Provider Adapter
 *
 * Connects to AWS Bedrock in GovCloud regions (us-gov-west-1, us-gov-east-1)
 * via the Anthropic Bedrock SDK. Uses Anthropic's native tool_use format.
 *
 * Requires: AWS credentials configured via standard AWS SDK credential chain
 * Environment variables:
 *   - AWS_REGION or AWS_DEFAULT_REGION (default: us-gov-west-1)
 *   - AWS credentials (via env, instance profile, or config file)
 */

import type {
	LLMChatParams,
	LLMClient,
	LLMClientConfig,
	LLMContentBlock,
	LLMNonStreamingResponse,
	LLMStreamEvent,
} from '../llmClient.js'

export class BedrockGovCloudClient implements LLMClient {
	readonly providerName = 'bedrock-govcloud'
	private readonly model: string
	private readonly region: string
	private readonly timeoutMs: number
	private bedrockClient: unknown | null = null

	constructor(config: LLMClientConfig) {
		this.model = config.model
		this.region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-gov-west-1'
		this.timeoutMs = config.timeoutMs ?? 600_000
	}

	private async getClient(): Promise<unknown> {
		if (this.bedrockClient) return this.bedrockClient

		// Dynamic import to avoid requiring the SDK unless this provider is used
		const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk')
		this.bedrockClient = new AnthropicBedrock({
			awsRegion: this.region,
			maxRetries: 3,
			timeout: this.timeoutMs,
		})
		return this.bedrockClient
	}

	async *chatStream(params: LLMChatParams, signal?: AbortSignal): AsyncIterable<LLMStreamEvent> {
		const client = (await this.getClient()) as {
			messages: {
				create(params: Record<string, unknown>): Promise<{
					[Symbol.asyncIterator](): AsyncIterator<Record<string, unknown>>
				}>
			}
		}

		const requestParams = this.buildAnthropicParams(params, true)

		yield { type: 'message_start', messageId: crypto.randomUUID() }

		try {
			const stream = await client.messages.create(requestParams)

			for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
				const eventType = event.type as string

				switch (eventType) {
					case 'content_block_start': {
						const block = event.content_block as Record<string, unknown>
						if (block.type === 'tool_use') {
							yield {
								type: 'tool_call_start',
								id: block.id as string,
								name: block.name as string,
							}
						}
						break
					}
					case 'content_block_delta': {
						const delta = event.delta as Record<string, unknown>
						if (delta.type === 'text_delta') {
							yield { type: 'text_delta', text: delta.text as string }
						} else if (delta.type === 'input_json_delta') {
							yield {
								type: 'tool_call_delta',
								id: '', // Will be matched by order
								arguments: delta.partial_json as string,
							}
						}
						break
					}
					case 'content_block_stop': {
						// Tool call end will be inferred from message_delta
						break
					}
					case 'message_delta': {
						const delta = event.delta as Record<string, unknown>
						const usage = event.usage as Record<string, number> | undefined
						const stopReason = delta.stop_reason as string
						yield {
							type: 'message_end',
							stopReason:
								stopReason === 'tool_use'
									? 'tool_use'
									: stopReason === 'max_tokens'
										? 'max_tokens'
										: 'end_turn',
							usage: {
								inputTokens: usage?.input_tokens ?? 0,
								outputTokens: usage?.output_tokens ?? 0,
							},
						}
						break
					}
				}
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error)
			yield {
				type: 'error',
				error: `Bedrock GovCloud error: ${message}`,
				retryable: true,
			}
		}
	}

	async chat(params: LLMChatParams, signal?: AbortSignal): Promise<LLMNonStreamingResponse> {
		const client = (await this.getClient()) as {
			messages: {
				create(params: Record<string, unknown>): Promise<Record<string, unknown>>
			}
		}

		const requestParams = this.buildAnthropicParams(params, false)
		const response = await client.messages.create(requestParams)

		const content: LLMContentBlock[] = []
		const responseContent = response.content as Array<Record<string, unknown>>

		for (const block of responseContent) {
			if (block.type === 'text') {
				content.push({ type: 'text', text: block.text as string })
			} else if (block.type === 'tool_use') {
				content.push({
					type: 'tool_call',
					id: block.id as string,
					name: block.name as string,
					arguments: JSON.stringify(block.input),
				})
			}
		}

		const usage = response.usage as Record<string, number>
		const stopReason = response.stop_reason as string

		return {
			id: (response.id as string) ?? crypto.randomUUID(),
			content,
			stopReason:
				stopReason === 'tool_use'
					? 'tool_use'
					: stopReason === 'max_tokens'
						? 'max_tokens'
						: 'end_turn',
			usage: {
				inputTokens: usage?.input_tokens ?? 0,
				outputTokens: usage?.output_tokens ?? 0,
			},
		}
	}

	async healthCheck(): Promise<boolean> {
		try {
			await this.getClient()
			return true
		} catch {
			return false
		}
	}

	private buildAnthropicParams(params: LLMChatParams, stream: boolean): Record<string, unknown> {
		// Convert messages to Anthropic format
		const messages: Array<Record<string, unknown>> = []
		const systemBlocks: string[] = []

		if (params.systemPrompt) {
			systemBlocks.push(params.systemPrompt)
		}

		for (const msg of params.messages) {
			if (msg.role === 'system') {
				const text = typeof msg.content === 'string' ? msg.content : ''
				systemBlocks.push(text)
				continue
			}

			if (msg.role === 'user') {
				const content = typeof msg.content === 'string' ? msg.content : ''
				messages.push({ role: 'user', content })
				continue
			}

			if (msg.role === 'assistant') {
				if (typeof msg.content === 'string') {
					messages.push({ role: 'assistant', content: msg.content })
				} else {
					const contentBlocks: Array<Record<string, unknown>> = []
					for (const block of msg.content) {
						if (block.type === 'text') {
							contentBlocks.push({ type: 'text', text: block.text })
						} else if (block.type === 'tool_call') {
							contentBlocks.push({
								type: 'tool_use',
								id: block.id,
								name: block.name,
								input: JSON.parse(block.arguments),
							})
						}
					}
					messages.push({ role: 'assistant', content: contentBlocks })
				}
				continue
			}

			if (msg.role === 'tool') {
				if (typeof msg.content === 'string') {
					messages.push({
						role: 'user',
						content: [
							{
								type: 'tool_result',
								tool_use_id: msg.toolCallId,
								content: msg.content,
							},
						],
					})
				}
			}
		}

		const requestParams: Record<string, unknown> = {
			model: params.model || this.model,
			messages,
			max_tokens: params.maxTokens ?? 4096,
			stream,
		}

		if (systemBlocks.length > 0) {
			requestParams.system = systemBlocks.join('\n\n')
		}

		if (params.tools?.length) {
			requestParams.tools = params.tools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.parameters,
			}))
		}

		if (params.temperature !== undefined) {
			requestParams.temperature = params.temperature
		}

		if (params.stopSequences?.length) {
			requestParams.stop_sequences = params.stopSequences
		}

		return requestParams
	}
}
