/**
 * SecureShell AI — Defense Permission Modes
 *
 * Extends the base permission system with defense-specific modes:
 * - IL4: Audit everything, no PII in prompts
 * - IL5: CUI allowed, full audit, deny all external network tools
 * - SCIF: Most restrictive — no file export, no clipboard, read-only default
 * - custom-policy: Load restrictions from organization-provided policy file
 */

import type { ClassificationLevel } from '../classification/types.js'

// ============================================================================
// Defense Permission Mode Definitions
// ============================================================================

export type DefensePermissionMode = 'il4' | 'il5' | 'scif' | 'custom-policy'

export type SecureShellPermissionMode =
	| 'default'
	| 'plan'
	| 'acceptEdits'
	| 'bypassPermissions'
	| 'dontAsk'
	| DefensePermissionMode

/**
 * Configuration for a defense permission mode.
 * Defines what tools are allowed/denied and what additional restrictions apply.
 */
export interface DefenseModeConfig {
	/** Mode identifier */
	mode: DefensePermissionMode
	/** Human-readable description */
	description: string
	/** Minimum clearance level required to use this mode */
	minimumClearance: ClassificationLevel
	/** Whether classification checking is enforced */
	classificationEnforced: boolean
	/** Whether audit logging is required */
	auditRequired: boolean
	/** Tools that are explicitly denied in this mode */
	deniedTools: string[]
	/** Whether write operations require explicit approval */
	writeRequiresApproval: boolean
	/** Whether file export (clipboard, external transfer) is blocked */
	blockFileExport: boolean
	/** Whether PII must be redacted from tool inputs before sending to LLM */
	redactPII: boolean
}

// ============================================================================
// Mode Configurations
// ============================================================================

export const DEFENSE_MODE_CONFIGS: Record<DefensePermissionMode, DefenseModeConfig> = {
	il4: {
		mode: 'il4',
		description: 'IL4 Compliance Mode — Audit all tool invocations, redact PII from prompts',
		minimumClearance: 'UNCLASSIFIED',
		classificationEnforced: true,
		auditRequired: true,
		deniedTools: ['WebFetchTool', 'WebSearchTool'],
		writeRequiresApproval: false,
		blockFileExport: false,
		redactPII: true,
	},
	il5: {
		mode: 'il5',
		description: 'IL5 Compliance Mode — CUI allowed, full audit, no external network tools',
		minimumClearance: 'CUI',
		classificationEnforced: true,
		auditRequired: true,
		deniedTools: [
			'WebFetchTool',
			'WebSearchTool',
			'MCPTool',
			'RemoteTriggerTool',
			'ScheduleCronTool',
		],
		writeRequiresApproval: true,
		blockFileExport: false,
		redactPII: true,
	},
	scif: {
		mode: 'scif',
		description:
			'SCIF Mode — Most restrictive. No file export, no clipboard, read-only by default',
		minimumClearance: 'SECRET',
		classificationEnforced: true,
		auditRequired: true,
		deniedTools: [
			'WebFetchTool',
			'WebSearchTool',
			'MCPTool',
			'RemoteTriggerTool',
			'ScheduleCronTool',
			'FileWriteTool',
			'NotebookEditTool',
			'SendMessageTool',
		],
		writeRequiresApproval: true,
		blockFileExport: true,
		redactPII: true,
	},
	'custom-policy': {
		mode: 'custom-policy',
		description: 'Custom Policy Mode — Load restrictions from organization policy file',
		minimumClearance: 'UNCLASSIFIED',
		classificationEnforced: false,
		auditRequired: true,
		deniedTools: [],
		writeRequiresApproval: false,
		blockFileExport: false,
		redactPII: false,
	},
}

// ============================================================================
// Mode Helpers
// ============================================================================

/**
 * Get the current defense permission mode from configuration.
 */
export function getDefensePermissionMode(): DefensePermissionMode | null {
	const mode = process.env.PERMISSION_MODE?.toLowerCase()
	if (mode === 'il4' || mode === 'il5' || mode === 'scif' || mode === 'custom-policy') {
		return mode
	}
	return null
}

/**
 * Get the configuration for a defense permission mode.
 */
export function getDefenseModeConfig(mode: DefensePermissionMode): DefenseModeConfig {
	return DEFENSE_MODE_CONFIGS[mode]
}

/**
 * Check if a tool is denied by the current defense permission mode.
 */
export function isToolDeniedByDefenseMode(
	toolName: string,
	mode?: DefensePermissionMode,
): boolean {
	const resolvedMode = mode ?? getDefensePermissionMode()
	if (!resolvedMode) return false

	const config = DEFENSE_MODE_CONFIGS[resolvedMode]
	return config.deniedTools.includes(toolName)
}

/**
 * Check if the current mode requires classification enforcement.
 */
export function isClassificationEnforced(mode?: DefensePermissionMode): boolean {
	const resolvedMode = mode ?? getDefensePermissionMode()
	if (!resolvedMode) return false
	return DEFENSE_MODE_CONFIGS[resolvedMode].classificationEnforced
}

/**
 * Check if the current mode requires audit logging.
 */
export function isAuditRequired(mode?: DefensePermissionMode): boolean {
	const resolvedMode = mode ?? getDefensePermissionMode()
	if (!resolvedMode) {
		// Default: audit is always enabled unless explicitly disabled
		return process.env.AUDIT_ENABLED !== 'false'
	}
	return DEFENSE_MODE_CONFIGS[resolvedMode].auditRequired
}
