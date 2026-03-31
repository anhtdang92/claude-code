/**
 * SecureShell AI — Data Classification Engine
 *
 * Enforces data classification at the file and directory level.
 * Reads .classification.json manifest files and checks file access
 * against user clearance levels.
 */

import { existsSync, readFileSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { minimatch } from 'minimatch'
import type {
	ClassificationCheckResult,
	ClassificationLevel,
	ClassificationManifest,
	ClassificationMode,
	ClassificationRule,
} from './types.js'
import { CLASSIFICATION_ORDER, isClearanceSufficient } from './types.js'

// ============================================================================
// Configuration
// ============================================================================

const MANIFEST_FILENAME = '.classification.json'

function getClassificationMode(): ClassificationMode {
	const mode = process.env.CLASSIFICATION_MODE?.toLowerCase()
	if (mode === 'warn' || mode === 'enforce') return mode
	return 'disabled'
}

function getDefaultClassification(): ClassificationLevel {
	return (process.env.DEFAULT_CLASSIFICATION as ClassificationLevel) ?? 'UNCLASSIFIED'
}

// ============================================================================
// Manifest Loading
// ============================================================================

const manifestCache = new Map<string, ClassificationManifest | null>()

/**
 * Load the classification manifest for a given directory.
 * Searches up the directory tree for .classification.json files.
 */
function loadManifest(filePath: string): ClassificationManifest | null {
	const dir = dirname(resolve(filePath))

	if (manifestCache.has(dir)) {
		return manifestCache.get(dir) ?? null
	}

	// Search up directory tree for manifest
	let currentDir = dir
	const root = '/'

	while (true) {
		const manifestPath = join(currentDir, MANIFEST_FILENAME)

		if (existsSync(manifestPath)) {
			try {
				const content = readFileSync(manifestPath, 'utf-8')
				const manifest = JSON.parse(content) as ClassificationManifest

				// Validate the manifest
				if (!manifest.default || !CLASSIFICATION_ORDER[manifest.default]) {
					manifest.default = getDefaultClassification()
				}
				if (!Array.isArray(manifest.rules)) {
					manifest.rules = []
				}

				manifestCache.set(dir, manifest)
				return manifest
			} catch {
				// Invalid manifest, continue searching
			}
		}

		if (currentDir === root || currentDir === '.') break
		currentDir = dirname(currentDir)
	}

	manifestCache.set(dir, null)
	return null
}

// ============================================================================
// Classification Checking
// ============================================================================

/**
 * Get the classification level for a specific file.
 */
export function getFileClassification(filePath: string): ClassificationLevel {
	const mode = getClassificationMode()
	if (mode === 'disabled') {
		return 'UNCLASSIFIED'
	}

	const manifest = loadManifest(filePath)
	if (!manifest) {
		return getDefaultClassification()
	}

	const resolvedPath = resolve(filePath)
	let classification = manifest.default

	// Evaluate rules in order, last match wins
	for (const rule of manifest.rules) {
		if (minimatch(resolvedPath, rule.pattern, { matchBase: true })) {
			classification = rule.level
		}
	}

	return classification
}

/**
 * Check if a user with the given clearance can access a file.
 */
export function checkFileAccess(
	filePath: string,
	userClearance: ClassificationLevel,
): ClassificationCheckResult {
	const mode = getClassificationMode()

	if (mode === 'disabled') {
		return {
			allowed: true,
			fileClassification: 'UNCLASSIFIED',
			userClearance,
			reason: 'Classification system is disabled',
		}
	}

	const fileClassification = getFileClassification(filePath)
	const allowed = isClearanceSufficient(userClearance, fileClassification)

	const result: ClassificationCheckResult = {
		allowed: mode === 'warn' ? true : allowed, // Warn mode always allows
		fileClassification,
		userClearance,
		reason: allowed
			? `Access granted: ${userClearance} clearance sufficient for ${fileClassification} file`
			: `Access denied: ${userClearance} clearance insufficient for ${fileClassification} file`,
	}

	if (mode === 'warn' && !allowed) {
		result.reason = `WARNING: ${userClearance} clearance insufficient for ${fileClassification} file (warn mode, access permitted)`
	}

	return result
}

/**
 * Check if the classification system is active.
 */
export function isClassificationEnabled(): boolean {
	return getClassificationMode() !== 'disabled'
}

/**
 * Clear the manifest cache. Useful after config changes.
 */
export function clearManifestCache(): void {
	manifestCache.clear()
}

// Re-export types
export type {
	ClassificationCheckResult,
	ClassificationLevel,
	ClassificationManifest,
	ClassificationMode,
	ClassificationRule,
} from './types.js'
