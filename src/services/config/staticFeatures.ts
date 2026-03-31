/**
 * SecureShell AI — Static Feature Configuration
 *
 * Replaces GrowthBook remote feature flags with a local, static
 * configuration file. No network calls. No remote eval.
 *
 * Features are loaded from:
 * 1. FEATURE_CONFIG env var (path to JSON file)
 * 2. ~/.secureshell/features.json
 * 3. Built-in defaults
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ============================================================================
// Feature Flag Definitions
// ============================================================================

/**
 * All feature flags with their default values.
 * These replace the GrowthBook remote feature flags.
 */
const DEFAULT_FEATURES: Record<string, boolean | string | number> = {
	// Core features (enabled by default)
	tool_search: true,
	todo_v2: true,
	agent_swarms: false,
	file_edit_strict: true,

	// Defense features
	classification_enabled: false,
	audit_enabled: true,
	stig_checks_enabled: false,
	sbom_generation_enabled: false,

	// Air-gap features
	disable_telemetry: true,
	disable_remote_settings: true,
	disable_remote_policy: true,
	disable_oauth: true,
	disable_web_fetch: true,
	disable_web_search: true,
	disable_mcp_registry: true,

	// UI features
	vim_mode: true,
	voice_mode: false,
	desktop_mode: false,
	mobile_mode: false,

	// Agent features
	proactive_mode: false,
	agent_triggers: false,
	agent_triggers_remote: false,
	monitor_tool: false,

	// Permission features
	transcript_classifier: false,
	bash_classifier: false,
}

// ============================================================================
// Feature Store
// ============================================================================

let loadedFeatures: Record<string, boolean | string | number> | null = null

export function loadFeatures(): Record<string, boolean | string | number> {
	if (loadedFeatures) return loadedFeatures

	// Start with defaults
	loadedFeatures = { ...DEFAULT_FEATURES }

	// Try loading from config file
	const configPaths = [
		process.env.FEATURE_CONFIG,
		join(homedir(), '.secureshell', 'features.json'),
	].filter(Boolean) as string[]

	for (const configPath of configPaths) {
		try {
			if (existsSync(configPath)) {
				const content = readFileSync(configPath, 'utf-8')
				const parsed = JSON.parse(content) as Record<string, unknown>
				// Merge, allowing overrides
				for (const [key, value] of Object.entries(parsed)) {
					if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
						loadedFeatures[key] = value
					}
				}
				break // Use first found config file
			}
		} catch {
			// Ignore parse errors, continue with defaults
		}
	}

	return loadedFeatures
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a feature flag is enabled.
 * Replaces checkStatsigFeatureGate / GrowthBook isOn.
 */
export function isFeatureEnabled(key: string): boolean {
	const features = loadFeatures()
	const value = features[key]
	if (typeof value === 'boolean') return value
	if (typeof value === 'string') return value === 'true' || value === '1'
	if (typeof value === 'number') return value > 0
	return false
}

/**
 * Get a feature flag value (for non-boolean features).
 * Replaces getFeatureValue from GrowthBook.
 */
export function getFeatureValue<T>(key: string, defaultValue: T): T {
	const features = loadFeatures()
	const value = features[key]
	if (value === undefined) return defaultValue
	return value as unknown as T
}

/**
 * Get all feature flags (for debugging/admin).
 */
export function getAllFeatures(): Record<string, boolean | string | number> {
	return { ...loadFeatures() }
}

/**
 * Reload features from disk. Useful after config changes.
 */
export function reloadFeatures(): void {
	loadedFeatures = null
	loadFeatures()
}
