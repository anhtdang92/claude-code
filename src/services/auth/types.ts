/**
 * SecureShell AI — Authentication Types
 *
 * Defines authentication providers and user identity for
 * defense environments (CAC/PIV, LDAP, mTLS, API key).
 */

import type { ClassificationLevel } from '../classification/types.js'

// ============================================================================
// Auth Provider Types
// ============================================================================

export type AuthMethod = 'apikey' | 'cac' | 'ldap' | 'mtls'

// ============================================================================
// Authenticated User
// ============================================================================

export interface AuthUser {
	/** Unique user identifier */
	id: string
	/** Display name */
	displayName: string
	/** User's security clearance level */
	clearanceLevel: ClassificationLevel
	/** Organizational roles */
	roles: string[]
	/** Authentication method used */
	authMethod: AuthMethod
	/** Certificate details (for CAC/PIV and mTLS) */
	certificate?: {
		subject: string
		issuer: string
		serialNumber: string
		notAfter: Date
	}
	/** Organizational unit */
	organization?: string
	/** Email address */
	email?: string
}

// ============================================================================
// Auth Provider Interface
// ============================================================================

export interface AuthProvider {
	/** Authentication method name */
	readonly method: AuthMethod

	/**
	 * Authenticate a user.
	 * Returns the authenticated user or throws an error.
	 */
	authenticate(credentials: AuthCredentials): Promise<AuthUser>

	/**
	 * Verify that a previously authenticated session is still valid.
	 */
	verify(user: AuthUser): Promise<boolean>
}

// ============================================================================
// Credentials
// ============================================================================

export type AuthCredentials =
	| { method: 'apikey'; apiKey: string }
	| { method: 'cac'; certificatePath?: string }
	| { method: 'ldap'; username: string; password: string }
	| { method: 'mtls'; certPath: string; keyPath: string }
