/**
 * SecureShell AI — Audit Logger Types
 *
 * Defines the structure of immutable, hash-chained audit entries.
 */

import type { ClassificationLevel } from '../classification/types.js'

// ============================================================================
// Audit Entry
// ============================================================================

export interface AuditEntry {
	/** ISO 8601 timestamp */
	timestamp: string
	/** Monotonically increasing sequence number within session */
	sequenceNumber: number
	/** SHA-256 hash of the previous entry (hash chain) */
	previousHash: string
	/** Session identifier */
	sessionId: string
	/** Authenticated user identifier */
	userId: string
	/** User's clearance level */
	clearanceLevel: ClassificationLevel
	/** Tool that was invoked */
	tool: string
	/** Sanitized tool input (PII/secrets removed) */
	input: Record<string, unknown>
	/** Classification of the file being accessed (if applicable) */
	fileClassification?: ClassificationLevel
	/** Permission decision */
	decision: 'allow' | 'deny' | 'ask'
	/** Reason for the decision */
	decisionReason: string
	/** Duration of tool execution in milliseconds */
	durationMs: number
	/** SHA-256 hash of the tool result (not the result itself) */
	resultHash: string
	/** HMAC-SHA256 signature of this entry */
	hmac: string
}

// ============================================================================
// Audit Configuration
// ============================================================================

export type AuditFormat = 'jsonl' | 'syslog' | 'splunk'

export interface AuditConfig {
	/** Enable/disable audit logging */
	enabled: boolean
	/** Output directory for audit log files */
	outputDir: string
	/** Output format */
	format: AuditFormat
	/** HMAC signing key (base64 encoded) */
	signingKey: string
	/** Maximum file size before rotation (bytes) */
	maxFileSizeBytes: number
	/** Fields to redact from input before logging */
	redactFields: string[]
}

// ============================================================================
// Audit Writer Interface
// ============================================================================

export interface AuditWriter {
	/** Write an audit entry */
	write(entry: AuditEntry): Promise<void>
	/** Flush pending writes */
	flush(): Promise<void>
	/** Close the writer */
	close(): Promise<void>
}
