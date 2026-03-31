/**
 * SecureShell AI — Authentication System
 *
 * Provides pluggable authentication for air-gapped environments.
 * Supports API key (development), CAC/PIV, LDAP, and mTLS.
 *
 * Replaces the Anthropic OAuth flow entirely.
 */

import type { ClassificationLevel } from '../classification/types.js'
import type { AuthCredentials, AuthMethod, AuthProvider, AuthUser } from './types.js'

// ============================================================================
// Configuration
// ============================================================================

function getAuthMethod(): AuthMethod {
	const method = process.env.AUTH_PROVIDER?.toLowerCase()
	switch (method) {
		case 'cac':
			return 'cac'
		case 'ldap':
			return 'ldap'
		case 'mtls':
			return 'mtls'
		default:
			return 'apikey'
	}
}

function getDefaultClearance(): ClassificationLevel {
	return (process.env.USER_CLEARANCE as ClassificationLevel) ?? 'UNCLASSIFIED'
}

// ============================================================================
// API Key Provider (Default / Development)
// ============================================================================

class APIKeyAuthProvider implements AuthProvider {
	readonly method: AuthMethod = 'apikey'

	async authenticate(credentials: AuthCredentials): Promise<AuthUser> {
		if (credentials.method !== 'apikey') {
			throw new Error('Invalid credentials for API key auth')
		}

		const expectedKey = process.env.AUTH_API_KEY || process.env.LLM_API_KEY
		if (expectedKey && credentials.apiKey !== expectedKey) {
			throw new Error('Invalid API key')
		}

		return {
			id: process.env.USER_ID || 'local-user',
			displayName: process.env.USER_DISPLAY_NAME || 'Local User',
			clearanceLevel: getDefaultClearance(),
			roles: (process.env.USER_ROLES || 'developer').split(','),
			authMethod: 'apikey',
			organization: process.env.USER_ORG || 'local',
		}
	}

	async verify(_user: AuthUser): Promise<boolean> {
		return true // API key sessions don't expire
	}
}

// ============================================================================
// CAC/PIV Provider (Placeholder — requires PKCS#11 integration)
// ============================================================================

class CACAuthProvider implements AuthProvider {
	readonly method: AuthMethod = 'cac'

	async authenticate(_credentials: AuthCredentials): Promise<AuthUser> {
		// In production, this would:
		// 1. Read the smart card via PKCS#11 (e.g., using pkcs11js)
		// 2. Extract the X.509 certificate
		// 3. Verify the certificate chain against DoD PKI
		// 4. Extract user identity from certificate subject
		// 5. Look up clearance level from LDAP/AD

		throw new Error(
			'CAC/PIV authentication requires PKCS#11 integration. ' +
				'Set AUTH_PROVIDER=apikey for development, or implement the PKCS#11 bridge ' +
				'for your specific smart card middleware (e.g., OpenSC, CoolKey).',
		)
	}

	async verify(_user: AuthUser): Promise<boolean> {
		return false
	}
}

// ============================================================================
// LDAP Provider (Placeholder — requires ldapjs)
// ============================================================================

class LDAPAuthProvider implements AuthProvider {
	readonly method: AuthMethod = 'ldap'

	async authenticate(_credentials: AuthCredentials): Promise<AuthUser> {
		// In production, this would:
		// 1. Connect to LDAP server (process.env.LDAP_URL)
		// 2. Bind with service account
		// 3. Search for user
		// 4. Verify password
		// 5. Extract groups/roles
		// 6. Map groups to clearance levels

		throw new Error(
			'LDAP authentication requires ldapjs integration. ' +
				'Configure LDAP_URL, LDAP_BASE_DN, and LDAP_BIND_DN environment variables.',
		)
	}

	async verify(_user: AuthUser): Promise<boolean> {
		return false
	}
}

// ============================================================================
// mTLS Provider (Placeholder — requires TLS certificate validation)
// ============================================================================

class MTLSAuthProvider implements AuthProvider {
	readonly method: AuthMethod = 'mtls'

	async authenticate(_credentials: AuthCredentials): Promise<AuthUser> {
		// In production, this would:
		// 1. Read client certificate from TLS connection
		// 2. Verify against trusted CA bundle
		// 3. Extract subject/SAN for user identity
		// 4. Map certificate attributes to clearance level

		throw new Error(
			'mTLS authentication requires TLS certificate validation. ' +
				'Configure NODE_EXTRA_CA_CERTS and ensure client certificates are presented.',
		)
	}

	async verify(_user: AuthUser): Promise<boolean> {
		return false
	}
}

// ============================================================================
// Auth Manager
// ============================================================================

let currentUser: AuthUser | null = null
let authProvider: AuthProvider | null = null

function getAuthProvider(): AuthProvider {
	if (authProvider) return authProvider

	switch (getAuthMethod()) {
		case 'cac':
			authProvider = new CACAuthProvider()
			break
		case 'ldap':
			authProvider = new LDAPAuthProvider()
			break
		case 'mtls':
			authProvider = new MTLSAuthProvider()
			break
		default:
			authProvider = new APIKeyAuthProvider()
	}

	return authProvider
}

/**
 * Authenticate the current user.
 * For API key auth, this auto-authenticates using env vars.
 */
export async function authenticate(credentials?: AuthCredentials): Promise<AuthUser> {
	const provider = getAuthProvider()

	const resolvedCredentials: AuthCredentials = credentials ?? {
		method: 'apikey',
		apiKey: process.env.AUTH_API_KEY || process.env.LLM_API_KEY || '',
	}

	currentUser = await provider.authenticate(resolvedCredentials)
	return currentUser
}

/**
 * Get the currently authenticated user.
 * Auto-authenticates with API key if no user is set.
 */
export async function getCurrentUser(): Promise<AuthUser> {
	if (currentUser) return currentUser

	// Auto-authenticate with default method
	return authenticate()
}

/**
 * Get the current user's clearance level.
 */
export async function getCurrentClearance(): Promise<ClassificationLevel> {
	const user = await getCurrentUser()
	return user.clearanceLevel
}

/**
 * Clear the current authentication state.
 */
export function logout(): void {
	currentUser = null
}

// Re-export types
export type { AuthCredentials, AuthMethod, AuthProvider, AuthUser } from './types.js'
