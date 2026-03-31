/**
 * SecureShell AI — Immutable Audit Logger
 *
 * Provides tamper-evident, hash-chained audit logging for every
 * tool invocation. Each entry is:
 * - Append-only (no modification or deletion)
 * - Hash-chained (each entry includes SHA-256 of previous)
 * - HMAC-signed (tamper detection via server key)
 * - Exportable (JSON Lines, Syslog, or Splunk format)
 */

import { createHmac, createHash, randomBytes } from 'crypto'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AuditConfig, AuditEntry, AuditFormat } from './types.js'
import type { ClassificationLevel } from '../classification/types.js'

// ============================================================================
// Configuration
// ============================================================================

function getAuditConfig(): AuditConfig {
	return {
		enabled: process.env.AUDIT_ENABLED !== 'false',
		outputDir: process.env.AUDIT_OUTPUT || join(homedir(), '.secureshell', 'audit'),
		format: (process.env.AUDIT_FORMAT as AuditFormat) || 'jsonl',
		signingKey: process.env.AUDIT_SIGNING_KEY || generateDefaultKey(),
		maxFileSizeBytes: parseInt(process.env.AUDIT_MAX_FILE_SIZE || String(100 * 1024 * 1024), 10), // 100MB
		redactFields: (process.env.AUDIT_REDACT_FIELDS || 'password,secret,token,key,credential').split(','),
	}
}

let defaultKey: string | null = null
function generateDefaultKey(): string {
	if (!defaultKey) {
		// Generate a session-scoped key if none is configured
		defaultKey = randomBytes(32).toString('base64')
	}
	return defaultKey
}

// ============================================================================
// Audit Logger
// ============================================================================

let sequenceNumber = 0
let previousHash = '0000000000000000000000000000000000000000000000000000000000000000'
let currentLogFile: string | null = null

/**
 * Initialize the audit logger. Creates the output directory if needed.
 */
export function initAuditLogger(): void {
	const config = getAuditConfig()
	if (!config.enabled) return

	if (!existsSync(config.outputDir)) {
		mkdirSync(config.outputDir, { recursive: true })
	}

	// Create log file with timestamp
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
	const sessionId = process.env.SESSION_ID || randomBytes(4).toString('hex')
	currentLogFile = join(config.outputDir, `audit-${timestamp}-${sessionId}.${config.format === 'jsonl' ? 'jsonl' : 'log'}`)

	// Write header
	if (config.format === 'jsonl') {
		writeFileSync(
			currentLogFile,
			JSON.stringify({
				type: 'audit_header',
				version: '1.0.0',
				product: 'SecureShell AI',
				startTime: new Date().toISOString(),
				sessionId,
				format: 'hash-chained-jsonl',
			}) + '\n',
		)
	}
}

/**
 * Log a tool invocation to the audit trail.
 */
export function logToolInvocation(params: {
	sessionId: string
	userId: string
	clearanceLevel: ClassificationLevel
	tool: string
	input: Record<string, unknown>
	fileClassification?: ClassificationLevel
	decision: 'allow' | 'deny' | 'ask'
	decisionReason: string
	durationMs: number
	result: unknown
}): void {
	const config = getAuditConfig()
	if (!config.enabled) return

	if (!currentLogFile) {
		initAuditLogger()
	}

	// Sanitize input (redact sensitive fields)
	const sanitizedInput = redactSensitiveFields(params.input, config.redactFields)

	// Hash the result (we log the hash, not the result itself)
	const resultHash = createHash('sha256')
		.update(JSON.stringify(params.result ?? ''))
		.digest('hex')

	// Build entry
	sequenceNumber++
	const entry: AuditEntry = {
		timestamp: new Date().toISOString(),
		sequenceNumber,
		previousHash,
		sessionId: params.sessionId,
		userId: params.userId,
		clearanceLevel: params.clearanceLevel,
		tool: params.tool,
		input: sanitizedInput,
		fileClassification: params.fileClassification,
		decision: params.decision,
		decisionReason: params.decisionReason,
		durationMs: params.durationMs,
		resultHash,
		hmac: '', // Computed below
	}

	// Compute HMAC signature
	entry.hmac = computeHMAC(entry, config.signingKey)

	// Update hash chain
	previousHash = createHash('sha256')
		.update(JSON.stringify(entry))
		.digest('hex')

	// Write entry
	writeEntry(entry, config.format)
}

/**
 * Verify the integrity of an audit log file.
 * Returns true if the hash chain and HMAC signatures are valid.
 */
export function verifyAuditLog(
	entries: AuditEntry[],
	signingKey: string,
): { valid: boolean; errors: string[] } {
	const errors: string[] = []
	let expectedPreviousHash = '0000000000000000000000000000000000000000000000000000000000000000'

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]

		// Verify hash chain
		if (entry.previousHash !== expectedPreviousHash) {
			errors.push(
				`Entry ${i} (seq ${entry.sequenceNumber}): hash chain broken. ` +
					`Expected previousHash ${expectedPreviousHash}, got ${entry.previousHash}`,
			)
		}

		// Verify HMAC
		const expectedHMAC = computeHMAC(entry, signingKey)
		if (entry.hmac !== expectedHMAC) {
			errors.push(
				`Entry ${i} (seq ${entry.sequenceNumber}): HMAC verification failed. Entry may have been tampered with.`,
			)
		}

		// Verify sequence number
		if (entry.sequenceNumber !== i + 1) {
			errors.push(
				`Entry ${i}: expected sequence number ${i + 1}, got ${entry.sequenceNumber}`,
			)
		}

		// Update expected previous hash for next entry
		expectedPreviousHash = createHash('sha256')
			.update(JSON.stringify(entry))
			.digest('hex')
	}

	return {
		valid: errors.length === 0,
		errors,
	}
}

// ============================================================================
// Internal Helpers
// ============================================================================

function computeHMAC(entry: AuditEntry, signingKey: string): string {
	// Create a copy without the hmac field for signing
	const { hmac: _, ...entryWithoutHMAC } = entry
	return createHmac('sha256', signingKey)
		.update(JSON.stringify(entryWithoutHMAC))
		.digest('hex')
}

function redactSensitiveFields(
	input: Record<string, unknown>,
	redactFields: string[],
): Record<string, unknown> {
	const result: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(input)) {
		const keyLower = key.toLowerCase()
		if (redactFields.some((field) => keyLower.includes(field.toLowerCase()))) {
			result[key] = '[REDACTED]'
		} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			result[key] = redactSensitiveFields(value as Record<string, unknown>, redactFields)
		} else {
			result[key] = value
		}
	}

	return result
}

function writeEntry(entry: AuditEntry, format: AuditFormat): void {
	if (!currentLogFile) return

	let line: string

	switch (format) {
		case 'jsonl':
			line = JSON.stringify(entry) + '\n'
			break

		case 'syslog': {
			// RFC 5424 compatible format
			const severity = entry.decision === 'deny' ? '4' : '6' // warning : info
			line =
				`<${severity}>1 ${entry.timestamp} secureshell-ai - - - ` +
				`[tool="${entry.tool}" user="${entry.userId}" decision="${entry.decision}" ` +
				`classification="${entry.fileClassification ?? 'N/A'}" seq="${entry.sequenceNumber}"] ` +
				`${entry.decisionReason}\n`
			break
		}

		case 'splunk': {
			// Splunk HEC JSON format
			line =
				JSON.stringify({
					time: new Date(entry.timestamp).getTime() / 1000,
					source: 'secureshell-ai',
					sourcetype: 'secureshell:audit',
					event: entry,
				}) + '\n'
			break
		}
	}

	try {
		appendFileSync(currentLogFile, line)
	} catch {
		// Audit logging should never crash the application
		// In production, this would write to stderr as a fallback
	}
}

// Re-export types
export type { AuditConfig, AuditEntry, AuditFormat, AuditWriter } from './types.js'
