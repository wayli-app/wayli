// web/src/lib/services/session/session-manager.service.ts
// Global session management service with automatic token refresh and auth state sync

import { supabase } from '$lib/supabase';
import { userStore, sessionStore } from '$lib/stores/auth';
import { goto } from '$app/navigation';

export class SessionManagerService {
	private static instance: SessionManagerService;
	private refreshInterval: ReturnType<typeof setInterval> | null = null;
	private lastActivityTime: number = Date.now();
	private readonly REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
	private readonly ACTIVITY_TIMEOUT_MS = 3.5 * 60 * 60 * 1000; // 3.5 hours (less than server timeout)
	private isInitialized = false;
	private authListenerSet = false;

	private constructor() {
		// Private constructor for singleton
	}

	static getInstance(): SessionManagerService {
		if (!SessionManagerService.instance) {
			SessionManagerService.instance = new SessionManagerService();
		}
		return SessionManagerService.instance;
	}

	/**
	 * Initialize the session manager
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			console.log('🔄 [SessionManager] Already initialized, skipping...');
			return;
		}

		console.log('🔐 [SessionManager] Initializing session management...');

		// Set the initialized flag early to prevent concurrent initialization
		this.isInitialized = true;

		// Set up auth state change listener (only once)
		if (!this.authListenerSet) {
			supabase.auth.onAuthStateChange((event: string, session: any) => {
				console.log(
					`🔐 [SessionManager] Auth state changed: ${event}`,
					session ? 'session present' : 'no session'
				);

				// Always update stores first
				this.updateAuthStores(session);

				if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
					if (event === 'INITIAL_SESSION') {
						console.log('🔄 [SessionManager] Initial session restored from storage');
					}
					this.startSessionManagement();
				} else if (event === 'SIGNED_OUT' || !session) {
					console.log(
						'🚪 [SessionManager] User signed out or no session, clearing stores and stopping management'
					);
					// Ensure stores are cleared
					this.updateAuthStores(null);
					this.stopSessionManagement();
				} else if (event === 'TOKEN_REFRESHED' && session) {
					console.log('✅ [SessionManager] Token refreshed successfully');
					this.updateLastActivity();
				}
			});
			this.authListenerSet = true;
			console.log('🔐 [SessionManager] Auth state change listener set up');
		} else {
			console.log('🔄 [SessionManager] Auth listener already set up, skipping...');
			return;
		}

		// Initialize with current session - let auth state change events handle session management
		try {
			const {
				data: { session },
				error
			} = await supabase.auth.getSession();
			if (error) {
				console.error('❌ [SessionManager] Error getting initial session:', error);
				// Don't clear stores on error - let auth state change events handle it
			} else if (session) {
				console.log('✅ [SessionManager] Initial session found during setup');
				// Don't manually start session management - auth state change events will handle it
				// But do update the stores with the found session
				this.updateAuthStores(session);
			} else {
				console.log(
					'ℹ️ [SessionManager] No initial session found - waiting for auth state changes'
				);
				// Don't clear stores if no session exists - let auth state change events handle it
			}
		} catch (error) {
			console.error('❌ [SessionManager] Error during session initialization:', error);
			// Don't clear stores on error - let auth state change events handle it
		}

		// Set up activity tracking
		this.setupActivityTracking();

		console.log('✅ [SessionManager] Session management initialized');
	}

	/**
	 * Update auth stores with current session
	 */
	private updateAuthStores(session: any): void {
		console.log(
			'🔄 [SessionManager] Updating auth stores:',
			session ? 'with session' : 'clearing stores'
		);

		sessionStore.set(session);

		if (session?.user) {
			userStore.set(session.user);
			console.log('✅ [SessionManager] User store updated with:', session.user.email);
		} else {
			userStore.set(null);
			console.log('🧹 [SessionManager] User store cleared');
		}
	}

	/**
	 * Force clear all auth stores (for emergency cleanup)
	 */
	public forceClearStores(): void {
		console.log('🧹 [SessionManager] Force clearing all auth stores');
		sessionStore.set(null);
		userStore.set(null);
	}

	/**
	 * Start automatic session management
	 */
	private startSessionManagement(): void {
		// Only start if not already running
		if (this.refreshInterval) {
			console.log('🔄 [SessionManager] Token refresh already running, skipping...');
			this.updateLastActivity();
			return;
		}

		console.log('🔄 [SessionManager] Starting automatic token refresh...');

		this.updateLastActivity();

		// Set up automatic token refresh
		this.refreshInterval = setInterval(async () => {
			await this.checkAndRefreshSession();
		}, this.REFRESH_INTERVAL_MS);
	}

	/**
	 * Stop session management
	 */
	private stopSessionManagement(): void {
		console.log('🛑 [SessionManager] Stopping session management...');

		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
	}

	/**
	 * Check session validity and refresh if needed
	 */
	private async checkAndRefreshSession(): Promise<void> {
		try {
			// Check for inactivity timeout
			const timeSinceLastActivity = Date.now() - this.lastActivityTime;
			if (timeSinceLastActivity > this.ACTIVITY_TIMEOUT_MS) {
				console.log('⏰ [SessionManager] Session expired due to inactivity');
				await this.handleSessionExpiry();
				return;
			}

			// Get current session
			const {
				data: { session },
				error
			} = await supabase.auth.getSession();

			if (error) {
				console.error('❌ [SessionManager] Error checking session:', error);
				return;
			}

			if (!session) {
				console.log('🚪 [SessionManager] No session found, user may have been logged out');
				await this.handleSessionExpiry();
				return;
			}

			// Check if token is close to expiry (refresh 10 minutes before expiry)
			const expiresAt = session.expires_at;
			const now = Math.floor(Date.now() / 1000);
			const timeUntilExpiry = expiresAt ? expiresAt - now : 0;

			if (timeUntilExpiry < 600) {
				// 10 minutes
				console.log('🔄 [SessionManager] Token expires soon, refreshing...');

				const { data, error: refreshError } = await supabase.auth.refreshSession();

				if (refreshError) {
					console.error('❌ [SessionManager] Failed to refresh token:', refreshError);
					await this.handleSessionExpiry();
				} else if (data.session) {
					console.log('✅ [SessionManager] Token refreshed successfully');
					this.updateAuthStores(data.session);
				}
			}
		} catch (error) {
			console.error('❌ [SessionManager] Error in session check:', error);
		}
	}

	/**
	 * Handle session expiry
	 */
	private async handleSessionExpiry(): Promise<void> {
		console.log('🚪 [SessionManager] Handling session expiry...');

		try {
			// Clear client-side session
			await supabase.auth.signOut();
		} catch (error) {
			console.warn('⚠️ [SessionManager] Error during signout:', error);
		}

		// Update stores
		this.updateAuthStores(null);

		// Stop session management
		this.stopSessionManagement();

		// Redirect to login if not already on auth pages
		if (typeof window !== 'undefined') {
			const currentPath = window.location.pathname;
			if (!currentPath.startsWith('/auth') && currentPath !== '/') {
				console.log('🔀 [SessionManager] Redirecting to signin...');
				goto('/auth/signin');
			}
		}
	}

	/**
	 * Set up activity tracking
	 */
	private setupActivityTracking(): void {
		if (typeof window === 'undefined') return;

		const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

		const updateActivity = () => {
			this.updateLastActivity();
		};

		activityEvents.forEach((event) => {
			document.addEventListener(event, updateActivity, { passive: true });
		});

		// Also track focus events
		window.addEventListener('focus', updateActivity);
	}

	/**
	 * Update last activity timestamp
	 */
	private updateLastActivity(): void {
		this.lastActivityTime = Date.now();
	}

	/**
	 * Force refresh the current session
	 */
	async forceRefreshSession(): Promise<boolean> {
		try {
			console.log('🔄 [SessionManager] Force refreshing session...');

			const { data, error } = await supabase.auth.refreshSession();

			if (error) {
				console.error('❌ [SessionManager] Force refresh failed:', error);
				await this.handleSessionExpiry();
				return false;
			}

			if (data.session) {
				console.log('✅ [SessionManager] Force refresh successful');
				this.updateAuthStores(data.session);
				this.updateLastActivity();
				return true;
			}

			return false;
		} catch (error) {
			console.error('❌ [SessionManager] Force refresh error:', error);
			return false;
		}
	}

	/**
	 * Check if session manager is ready and has completed initial session restoration
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	/**
	 * Check if user is currently authenticated
	 */
	async isAuthenticated(): Promise<boolean> {
		try {
			// Check Supabase session directly
			const {
				data: { session },
				error
			} = await supabase.auth.getSession();
			if (error) {
				console.error('❌ [SessionManager] Error checking Supabase session:', error);
				return false;
			}

			if (session && session.user) {
				console.log('🔐 [SessionManager] Authentication confirmed via Supabase');
				// Update stores with the found session if they're empty
				this.updateAuthStores(session);
				return true;
			}

			console.log('🚪 [SessionManager] No valid session found');
			return false;
		} catch (error) {
			console.error('❌ [SessionManager] Error in isAuthenticated:', error);
			return false;
		}
	}

	/**
	 * Get current session
	 */
	async getCurrentSession() {
		try {
			const {
				data: { session },
				error
			} = await supabase.auth.getSession();
			return error ? null : session;
		} catch {
			return null;
		}
	}

	/**
	 * Clean up session manager
	 */
	destroy(): void {
		this.stopSessionManagement();
		this.isInitialized = false;
	}
}

// Export singleton instance
export const sessionManager = SessionManagerService.getInstance();
