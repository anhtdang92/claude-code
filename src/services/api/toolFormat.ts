/**
 * SecureShell AI — Tool Format Translation Layer
 *
 * Converts internal Tool definitions (Zod schemas) into
 * provider-appropriate tool/function schemas.
 *
 * Supports:
 * - OpenAI function calling format (most local LLMs)
 * - Anthropic tool_use format (Bedrock GovCloud)
 */

import type { LLMToolSchema } from './llmClient.js'
import { getToolCallFormat, type ToolCallFormat } from '../../utils/model/providers.js'

/**
 * Convert a Zod schema to JSON Schema format for tool parameters.
 * This is a simplified version -- the original uses zodToJsonSchema from the SDK.
 */
export function zodSchemaToJsonSchema(schema: unknown): Record<string, unknown> {
	// If the schema has a toJsonSchema method (zod v4), use it
	if (schema && typeof schema === 'object' && 'toJsonSchema' in schema) {
		return (schema as { toJsonSchema(): Record<string, unknown> }).toJsonSchema()
	}

	// If it's already a JSON schema object, return as-is
	if (schema && typeof schema === 'object' && 'type' in schema) {
		return schema as Record<string, unknown>
	}

	// Fallback: empty object schema
	return { type: 'object', properties: {} }
}

/**
 * Convert internal tool definitions to provider-appropriate format.
 */
export function convertToolsForProvider(
	tools: Array<{
		name: string
		description: string
		inputSchema: unknown
		inputJSONSchema?: Record<string, unknown>
	}>,
	format?: ToolCallFormat,
): LLMToolSchema[] {
	const resolvedFormat = format ?? getToolCallFormat()

	return tools.map((tool) => {
		// Use pre-computed JSON schema if available, otherwise convert from Zod
		const parameters =
			tool.inputJSONSchema ?? zodSchemaToJsonSchema(tool.inputSchema)

		return {
			name: tool.name,
			description: tool.description,
			parameters,
		}
	})
}

/**
 * Convert an Anthropic-format tool_use content block into internal format.
 * Used when receiving responses from Bedrock GovCloud.
 */
export function parseAnthropicToolUse(block: {
	type: 'tool_use'
	id: string
	name: string
	input: unknown
}): { id: string; name: string; arguments: string } {
	return {
		id: block.id,
		name: block.name,
		arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
	}
}

/**
 * Convert an OpenAI-format function_call into internal format.
 * Used when receiving responses from local LLMs.
 */
export function parseOpenAIFunctionCall(call: {
	id: string
	function: { name: string; arguments: string }
}): { id: string; name: string; arguments: string } {
	return {
		id: call.id,
		name: call.function.name,
		arguments: call.function.arguments,
	}
}

/**
 * Format a tool result for sending back to the LLM.
 * The format depends on the provider's expected message format.
 */
export function formatToolResult(
	toolCallId: string,
	result: string,
	isError: boolean,
	format?: ToolCallFormat,
): Record<string, unknown> {
	const resolvedFormat = format ?? getToolCallFormat()

	if (resolvedFormat === 'anthropic') {
		return {
			type: 'tool_result',
			tool_use_id: toolCallId,
			content: result,
			is_error: isError,
		}
	}

	// OpenAI format: tool role message
	return {
		role: 'tool',
		tool_call_id: toolCallId,
		content: result,
	}
}
