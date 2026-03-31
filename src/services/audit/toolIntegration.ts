/**
 * SecureShell AI — Audit Integration for Tool Execution
 *
 * Wraps tool execution with immutable audit logging. Integrates with
 * the tool execution pipeline in toolExecution.ts to log every tool
 * invocation, permission decision, and result hash.
 *
 * INTEGRATION POINT:
 * - src/services/tools/toolExecution.ts (checkPermissionsAndCallTool)
 *   Insert auditToolInvocation() around tool.call() at line ~1207
 */

import { createHash } from 'node:crypto'
import type { ClassificationLevel } from '../classification/types.js'
import { getFileClassification } from '../classification/index.js'
import { getCurrentClearance } from '../auth/index.js'
import { logToolInvocation, isAuditEnabled } from './index.js'

// ============================================================================
// Tool Audit Wrapper
// ============================================================================

/**
 * Wrap a tool invocation with audit logging.
 * Call this around tool.call() in the tool execution pipeline.
 *
 * Usage in toolExecution.ts:
 *   const result = await auditToolInvocation(
 *     tool.name,
 *     callInput,
 *     toolUseID,
 *     'allow',
 *     async () => tool.call(callInput, context, canUseTool, assistantMessage, onProgress)
 *   )
 */
export async function auditToolInvocation<T>(
	toolName: string,
	input: Record<string, unknown>,
	toolUseId: string,
	decision: 'allow' | 'deny' | 'ask',
	decisionReason: string,
	executeFn: () => Promise<T>,
): Promise<T> {
	if (!isAuditEnabled()) {
		return executeFn()
	}

	const startTime = Date.now()
	let resultHash = ''
	let error: Error | undefined

	// Determine file classification if the tool accesses a file
	let fileClassification: ClassificationLevel | undefined
	const filePath = extractFilePath(toolName, input)
	if (filePath) {
		try {
			fileClassification = await getFileClassification(filePath)
		} catch {
			// Classification lookup failure should not block tool execution
		}
	}

	try {
		const result = await executeFn()

		// Hash the result for audit trail (never log the actual result)
		resultHash = hashResult(result)

		return result
	} catch (e) {
		error = e instanceof Error ? e : new Error(String(e))
		resultHash = hashResult({ error: error.message })
		throw e
	} finally {
		const durationMs = Date.now() - startTime

		try {
			await logToolInvocation({
				tool: toolName,
				input: sanitizeInput(input),
				decision,
				decisionReason,
				durationMs,
				resultHash,
				fileClassification,
			})
		} catch {
			// Audit logging failure should never break tool execution
		}
	}
}

/**
 * Log a permission denial without executing the tool.
 * Call this when a tool is denied before execution.
 */
export async function auditToolDenial(
	toolName: string,
	input: Record<string, unknown>,
	denialReason: string,
	fileClassification?: ClassificationLevel,
): Promise<void> {
	if (!isAuditEnabled()) {
		return
	}

	try {
		await logToolInvocation({
			tool: toolName,
			input: sanitizeInput(input),
			decision: 'deny',
			decisionReason: denialReason,
			durationMs: 0,
			resultHash: '',
			fileClassification,
		})
	} catch {
		// Audit logging failure should never break the flow
	}
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract file path from tool input based on tool name.
 * Different tools use different parameter names for file paths.
 */
function extractFilePath(
	toolName: string,
	input: Record<string, unknown>,
): string | undefined {
	// Common file path parameter names across tools
	const filePathKeys = ['file_path', 'filePath', 'path', 'command']

	for (const key of filePathKeys) {
		const value = input[key]
		if (typeof value === 'string' && value.startsWith('/')) {
			return value
		}
	}

	// For Bash tool, try to extract file paths from the command
	if (toolName === 'Bash' && typeof input.command === 'string') {
		// Don't try to parse complex commands — just return undefined
		return undefined
	}

	return undefined
}

/**
 * Create a SHA-256 hash of the tool result.
 * We never log actual results — only their hash for integrity verification.
 */
function hashResult(result: unknown): string {
	const serialized = typeof result === 'string'
		? result
		: JSON.stringify(result ?? '')
	return createHash('sha256').update(serialized).digest('hex').slice(0, 16)
}

/**
 * Sanitize tool input for audit logging.
 * Redacts sensitive fields like passwords, tokens, keys.
 */
const SENSITIVE_KEYS = new Set([
	'password', 'secret', 'token', 'key', 'credential',
	'api_key', 'apiKey', 'auth', 'authorization',
	'private_key', 'privateKey', 'passphrase',
])

function sanitizeInput(
	input: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(input)) {
		if (SENSITIVE_KEYS.has(key.toLowerCase())) {
			sanitized[key] = '[REDACTED]'
		} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			sanitized[key] = sanitizeInput(value as Record<string, unknown>)
		} else {
			sanitized[key] = value
		}
	}

	return sanitized
}
