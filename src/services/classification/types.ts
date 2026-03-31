/**
 * SecureShell AI — Data Classification Types
 *
 * Defines classification levels, rules, and check results
 * for the classification-aware permission system.
 */

// ============================================================================
// Classification Levels
// ============================================================================

/**
 * Standard US government classification levels, ordered from least to most restrictive.
 */
export type ClassificationLevel = 'UNCLASSIFIED' | 'CUI' | 'SECRET' | 'TOP_SECRET'

/**
 * Numeric ordering of classification levels for comparison.
 */
export const CLASSIFICATION_ORDER: Record<ClassificationLevel, number> = {
	UNCLASSIFIED: 0,
	CUI: 1,
	SECRET: 2,
	TOP_SECRET: 3,
}

/**
 * Check if a user's clearance level is sufficient for a file's classification.
 */
export function isClearanceSufficient(
	userClearance: ClassificationLevel,
	fileClassification: ClassificationLevel,
): boolean {
	return CLASSIFICATION_ORDER[userClearance] >= CLASSIFICATION_ORDER[fileClassification]
}

// ============================================================================
// Classification Rules
// ============================================================================

/**
 * A rule mapping a file pattern to a classification level.
 */
export interface ClassificationRule {
	/** Glob pattern matching files (e.g., "src/crypto/**", "*.key") */
	pattern: string
	/** Classification level for matching files */
	level: ClassificationLevel
}

/**
 * A classification manifest for a project or directory.
 * Stored as .classification.json files.
 */
export interface ClassificationManifest {
	/** Default classification for files not matching any rule */
	default: ClassificationLevel
	/** Rules for specific file patterns (evaluated in order, last match wins) */
	rules: ClassificationRule[]
}

// ============================================================================
// Classification Check Results
// ============================================================================

/**
 * Result of checking a file's classification against a user's clearance.
 */
export interface ClassificationCheckResult {
	/** Whether access is allowed */
	allowed: boolean
	/** The file's classification level */
	fileClassification: ClassificationLevel
	/** The user's clearance level */
	userClearance: ClassificationLevel
	/** Human-readable reason for the decision */
	reason: string
	/** The rule that determined the classification (if any) */
	matchedRule?: ClassificationRule
}

// ============================================================================
// Classification Mode
// ============================================================================

/**
 * How the classification system operates.
 */
export type ClassificationMode = 'disabled' | 'warn' | 'enforce'
