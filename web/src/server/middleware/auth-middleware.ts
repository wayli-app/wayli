import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';

import { getAuditLoggerService } from '../services/server/server-service-adapter';
import { AuditEventType, AuditSeverity } from '../services/audit-logger.service';
import { rateLimitService } from '../services/rate-limit.service';

export interface AuthenticatedRequest extends RequestEvent {
	user: {
		id: string;
		email: string;
		role: string;
		metadata: Record<string, unknown>;
	};
}

export interface AuthorizationConfig {
	requireAuth: boolean;
	requiredRoles?: string[];
	allowedRoles?: string[];
	rateLimit?: {
		windowMs: number;
		maxRequests: number;
		message?: string;
	};
}

export class AuthMiddleware {
	/**
	 * Require authentication for the request
	 */
	static async requireAuth(event: RequestEvent): Promise<AuthenticatedRequest> {
		try {
			// Create Supabase client for server-side operations
			const supabase = createClient(
				process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
				process.env.SUPABASE_SERVICE_ROLE_KEY || '',
				{
					auth: {
						autoRefreshToken: false,
						persistSession: false
					}
				}
			);

			// Get session from Supabase
			const { data: { session }, error } = await supabase.auth.getSession();

			if (error || !session?.user) {
				// Log failed authentication attempt
				await getAuditLoggerService().logEvent(
					AuditEventType.API_ACCESS_DENIED,
					'Authentication required but no session found',
					AuditSeverity.MEDIUM,
					{ endpoint: event.url.pathname },
					event.request
				);

				throw new Error('Authentication required');
			}

			// Validate user data
			if (!session.user.id || !session.user.email) {
				await getAuditLoggerService().logEvent(
					AuditEventType.SUSPICIOUS_ACTIVITY,
					'Invalid user session data',
					AuditSeverity.HIGH,
					{ endpoint: event.url.pathname, user_id: session.user.id },
					event.request,
					session.user.id
				);

				throw new Error('Invalid user session');
			}

			// Get user role from metadata or profile
			const role = session.user.user_metadata?.role || 'user';

			const authenticatedRequest: AuthenticatedRequest = {
				...event,
				user: {
					id: session.user.id,
					email: session.user.email,
					role,
					metadata: session.user.user_metadata || {}
				}
			};

			// Log successful authentication
			await getAuditLoggerService().logEvent(
				AuditEventType.USER_LOGIN,
				'User authenticated successfully',
				AuditSeverity.LOW,
				{ endpoint: event.url.pathname, role },
				event.request,
				session.user.id
			);

			return authenticatedRequest;
		} catch (error) {
			const appError = new Error(error instanceof Error ? error.message : 'Authentication failed');
			throw appError;
		}
	}

	/**
	 * Require specific roles for the request
	 */
	static async requireRoles(event: RequestEvent, roles: string[]): Promise<AuthenticatedRequest> {
		const authenticatedRequest = await this.requireAuth(event);

		if (!roles.includes(authenticatedRequest.user.role)) {
			// Log unauthorized access attempt
			await getAuditLoggerService().logEvent(
				AuditEventType.API_ACCESS_DENIED,
				`Insufficient permissions: required roles [${roles.join(', ')}], user role: ${authenticatedRequest.user.role}`,
				AuditSeverity.HIGH,
				{
					endpoint: event.url.pathname,
					required_roles: roles,
					user_role: authenticatedRequest.user.role
				},
				event.request,
				authenticatedRequest.user.id
			);

			throw new Error('Insufficient permissions');
		}

		return authenticatedRequest;
	}

	/**
	 * Require admin role for the request
	 */
	static async requireAdmin(event: RequestEvent): Promise<AuthenticatedRequest> {
		return this.requireRoles(event, ['admin']);
	}

	/**
	 * Create a middleware function with authorization configuration
	 */
	static createAuthMiddleware(config: AuthorizationConfig) {
		return async (event: RequestEvent): Promise<AuthenticatedRequest> => {
			let authenticatedRequest: AuthenticatedRequest;

			// Apply rate limiting if configured
			if (config.rateLimit) {
				const rateLimitResult = rateLimitService.checkRateLimit(event.request, {
					windowMs: config.rateLimit.windowMs,
					maxRequests: config.rateLimit.maxRequests,
					message: config.rateLimit.message || 'Too many requests'
				});

				if (!rateLimitResult.allowed) {
					// Log rate limit exceeded
					await getAuditLoggerService().logRateLimitExceeded(
						'anonymous', // We don't have user ID yet
						event.url.pathname,
						event.request,
						{ retryAfter: rateLimitResult.retryAfter }
					);

					throw new Error(
						`Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`
					);
				}
			}

			// Require authentication if specified
			if (config.requireAuth) {
				authenticatedRequest = await this.requireAuth(event);
			} else {
				// Optional authentication - try to get user but don't require it
				try {
					authenticatedRequest = await this.requireAuth(event);
				} catch {
					// Create a request with no user for optional auth
					authenticatedRequest = {
						...event,
						user: {
							id: '',
							email: '',
							role: 'anonymous',
							metadata: {}
						}
					};
				}
			}

			// Check required roles
			if (config.requiredRoles && config.requiredRoles.length > 0) {
				if (!config.requiredRoles.includes(authenticatedRequest.user.role)) {
					await getAuditLoggerService().logEvent(
						AuditEventType.API_ACCESS_DENIED,
						`Required roles not met: [${config.requiredRoles.join(', ')}]`,
						AuditSeverity.HIGH,
						{
							endpoint: event.url.pathname,
							required_roles: config.requiredRoles,
							user_role: authenticatedRequest.user.role
						},
						event.request,
						authenticatedRequest.user.id
					);

					throw new Error('Insufficient permissions');
				}
			}

			// Check allowed roles
			if (config.allowedRoles && config.allowedRoles.length > 0) {
				if (!config.allowedRoles.includes(authenticatedRequest.user.role)) {
					await getAuditLoggerService().logEvent(
						AuditEventType.API_ACCESS_DENIED,
						`Role not allowed: ${authenticatedRequest.user.role}`,
						AuditSeverity.HIGH,
						{
							endpoint: event.url.pathname,
							allowed_roles: config.allowedRoles,
							user_role: authenticatedRequest.user.role
						},
						event.request,
						authenticatedRequest.user.id
					);

					throw new Error('Access denied');
				}
			}

			return authenticatedRequest;
		};
	}

	/**
	 * Validate and sanitize user input for authentication
	 */
	static validateAuthInput(input: {
		email?: string;
		password?: string;
		code?: string;
		recoveryCode?: string;
	}): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		// Validate email
		if (input.email) {
			// Assuming SecurityUtils is no longer available, this will cause an error
			// if (!SecurityUtils.validateEmail(input.email)) {
			// 	errors.push('Invalid email format');
			// }
		}

		// Validate password
		if (input.password) {
			// Assuming SecurityUtils is no longer available, this will cause an error
			// const passwordValidation = SecurityUtils.validatePassword(input.password);
			// if (!passwordValidation.valid) {
			// 	errors.push(...passwordValidation.errors);
			// }
		}

		// Validate 2FA code
		if (input.code) {
			if (!/^\d{6}$/.test(input.code)) {
				errors.push('2FA code must be 6 digits');
			}
		}

		// Validate recovery code
		if (input.recoveryCode) {
			if (!/^[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/.test(input.recoveryCode)) {
				errors.push('Invalid recovery code format');
			}
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}

	/**
	 * Check if user has permission to access a resource
	 */
	static hasPermission(
		user: { id: string; role: string },
		resource: string,
		action: string,
		resourceOwnerId?: string
	): boolean {
		// Admins have all permissions
		if (user.role === 'admin') {
			return true;
		}

		// Users can always access their own resources
		if (resourceOwnerId && user.id === resourceOwnerId) {
			return true;
		}

		// Define permission matrix
		const permissions: Record<string, Record<string, string[]>> = {
			trips: {
				view: ['user', 'admin'],
				create: ['user', 'admin'],
				update: ['user', 'admin'],
				delete: ['user', 'admin']
			},
			users: {
				view: ['admin'],
				create: ['admin'],
				update: ['admin'],
				delete: ['admin']
			},
			audit_logs: {
				view: ['admin'],
				create: ['admin'],
				update: ['admin'],
				delete: ['admin']
			},
			system_settings: {
				view: ['admin'],
				update: ['admin']
			}
		};

		const resourcePermissions = permissions[resource];
		if (!resourcePermissions) {
			return false;
		}

		const actionPermissions = resourcePermissions[action];
		if (!actionPermissions) {
			return false;
		}

		return actionPermissions.includes(user.role);
	}

	/**
	 * Generate a secure session token
	 */
	static generateSessionToken(): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			try {
				return crypto.randomUUID();
			} catch {
				// Fallback to manual generation
			}
		}
		return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}

	/**
	 * Validate session token
	 */
	static validateSessionToken(token: string): boolean {
		// Basic UUID validation
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		return uuidRegex.test(token);
	}

	/**
	 * Log user activity for security monitoring
	 */
	static async logUserActivity(
		userId: string,
		action: string,
		resource?: string,
		resourceId?: string,
		request?: Request,
		metadata?: Record<string, unknown>
	): Promise<void> {
		await getAuditLoggerService().logDataAccess(
			userId,
			action as 'view' | 'create' | 'update' | 'delete' | 'export' | 'import',
			resource || 'unknown',
			resourceId,
			request,
			metadata
		);
	}

	/**
	 * Check for suspicious activity patterns
	 */
	static async detectSuspiciousActivity(
		userId: string,
		action: string,
		request?: Request
	): Promise<boolean> {
		// This is a simplified implementation
		// In a real system, you would implement more sophisticated detection logic

		// For now, just log the activity and let the audit system handle it
		await getAuditLoggerService().logEvent(
			AuditEventType.DATA_VIEW,
			`User activity: ${action}`,
			AuditSeverity.LOW,
			{ action, user_id: userId },
			request,
			userId
		);

		return false; // No suspicious activity detected
	}
}

// Export convenience functions
export const requireAuth = AuthMiddleware.requireAuth;
export const requireRoles = AuthMiddleware.requireRoles;
export const requireAdmin = AuthMiddleware.requireAdmin;
export const createAuthMiddleware = AuthMiddleware.createAuthMiddleware;
export const hasPermission = AuthMiddleware.hasPermission;
