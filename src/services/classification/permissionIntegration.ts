/**
 * SecureShell AI — Classification Integration for Permission System
 *
 * Adds classification-aware permission checking to the existing permission
 * pipeline. Checks file classification levels against user clearance before
 * allowing tool access.
 *
 * INTEGRATION POINT:
 * - src/utils/permissions/permissions.ts (hasPermissionsToUseToolInner)
 *   Insert classificationPermissionCheck() before step 1 (deny rules)
 */

import { checkFileAccess, getFileClassification } from './index.js'
import { getCurrentClearance } from '../auth/index.js'
import { isClassificationEnforced } from '../auth/permissionModes.js'
import type { ClassificationLevel, ClassificationCheckResult } from './types.js'
import type { PermissionDecision } from '../../types/permissions.js'

// ============================================================================
// Classification Permission Check
// ============================================================================

/**
 * Check if a tool invocation is allowed based on file classification.
 * Returns null if classification is not enforced or no file path is involved.
 * Returns a PermissionDenyDecision if the user lacks clearance.
 *
 * Call this at the top of hasPermissionsToUseToolInner, before rule-based checks.
 */
export async function classificationPermissionCheck(
	toolName: string,
	input: Record<string, unknown>,
	permissionMode: string,
): Promise<PermissionDecision | null> {
	// Only enforce classification in defense modes
	if (!isClassificationEnforced(permissionMode)) {
		return null
	}

	// Extract file path from tool input
	const filePath = extractFilePathFromInput(toolName, input)
	if (!filePath) {
		return null
	}

	const userClearance = getCurrentClearance()
	const checkResult = await checkFileAccess(filePath, userClearance)

	if (!checkResult.allowed) {
		return {
			behavior: 'deny',
			message: formatClassificationDenial(checkResult, filePath),
			decisionReason: {
				type: 'classification' as const,
				fileClassification: checkResult.fileClassification,
				userClearance: checkResult.userClearance,
			} as any, // Extended reason type for classification
		}
	}

	return null
}

/**
 * Check classification for multiple file paths (e.g., glob results).
 * Returns the first denial, or null if all files are accessible.
 */
export async function classificationCheckMultiplePaths(
	filePaths: string[],
	permissionMode: string,
): Promise<PermissionDecision | null> {
	if (!isClassificationEnforced(permissionMode)) {
		return null
	}

	const userClearance = getCurrentClearance()

	for (const filePath of filePaths) {
		const checkResult = await checkFileAccess(filePath, userClearance)
		if (!checkResult.allowed) {
			return {
				behavior: 'deny',
				message: formatClassificationDenial(checkResult, filePath),
				decisionReason: {
					type: 'classification' as const,
					fileClassification: checkResult.fileClassification,
					userClearance: checkResult.userClearance,
				} as any,
			}
		}
	}

	return null
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the primary file path from a tool's input parameters.
 * Handles the various parameter naming conventions across tools.
 */
function extractFilePathFromInput(
	toolName: string,
	input: Record<string, unknown>,
): string | undefined {
	// Direct file path parameters
	const directPathKeys = ['file_path', 'filePath', 'path']
	for (const key of directPathKeys) {
		const value = input[key]
		if (typeof value === 'string' && value.length > 0) {
			return value
		}
	}

	// Tool-specific extraction
	switch (toolName) {
		case 'Read':
		case 'Write':
		case 'Edit':
			return typeof input.file_path === 'string' ? input.file_path : undefined

		case 'Glob':
		case 'Grep':
			return typeof input.path === 'string' ? input.path : undefined

		case 'Bash': {
			// For bash commands, we can't reliably extract file paths
			// Classification is checked at a higher level for bash
			return undefined
		}

		default:
			return undefined
	}
}

/**
 * Format a user-friendly denial message for classification violations.
 */
function formatClassificationDenial(
	result: ClassificationCheckResult,
	filePath: string,
): string {
	return (
		`Access denied: ${filePath} is classified ${result.fileClassification} ` +
		`but your clearance is ${result.userClearance}. ` +
		(result.reason ?? 'Insufficient clearance level.')
	)
}
