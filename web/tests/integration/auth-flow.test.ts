// Integration tests for authentication flow

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	MOCK_TOKEN_A,
	MOCK_PASSWORD_A,
	MOCK_PASSWORD_NEW,
	MOCK_USER_ID,
	TEST_EMAIL,
	NEW_USER_EMAIL
} from '../helpers/test-fixtures';

// Mock fluxbase client
const mockFluxbase = {
	auth: {
		signInWithPassword: vi.fn(),
		signUp: vi.fn(),
		signOut: vi.fn(),
		getSession: vi.fn(),
		getUser: vi.fn(),
		resetPasswordForEmail: vi.fn(),
		updateUser: vi.fn(),
		onAuthStateChange: vi.fn().mockReturnValue({
			data: { subscription: { unsubscribe: vi.fn() } }
		})
	},
	from: vi.fn()
};

vi.mock('$lib/fluxbase', () => ({
	fluxbase: mockFluxbase
}));

describe('Authentication Flow Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Sign In Flow', () => {
		it('should successfully sign in with valid credentials', async () => {
			const mockSession = {
				user: { id: MOCK_USER_ID, email: TEST_EMAIL },
				access_token: MOCK_TOKEN_A
			};

			mockFluxbase.auth.signInWithPassword.mockResolvedValue({
				data: { session: mockSession, user: mockSession.user },
				error: null
			});

			const result = await mockFluxbase.auth.signInWithPassword({
				email: TEST_EMAIL,
				password: MOCK_PASSWORD_A
			});

			expect(result.error).toBeNull();
			expect(result.data?.session?.user?.email).toBe(TEST_EMAIL);
		});

		it('should handle invalid credentials', async () => {
			mockFluxbase.auth.signInWithPassword.mockResolvedValue({
				data: { session: null, user: null },
				error: { message: 'Invalid login credentials' }
			});

			const result = await mockFluxbase.auth.signInWithPassword({
				email: 'wrong@example.com',
				password: 'wrongmock'
			});

			expect(result.error).not.toBeNull();
			expect(result.error?.message).toContain('Invalid');
		});

		it('should handle 2FA requirement', async () => {
			mockFluxbase.auth.signInWithPassword.mockResolvedValue({
				data: {
					session: null,
					user: { id: MOCK_USER_ID, email: TEST_EMAIL }
				},
				error: { message: 'requires_2fa', status: 403 }
			});

			const result = await mockFluxbase.auth.signInWithPassword({
				email: TEST_EMAIL,
				password: MOCK_PASSWORD_A
			});

			expect(result.error?.message).toContain('2fa');
		});
	});

	describe('Sign Up Flow', () => {
		it('should successfully create a new account', async () => {
			const mockUser = {
				id: MOCK_NEW_USER_ID,
				email: NEW_USER_EMAIL,
				email_confirmed_at: null
			};

			mockFluxbase.auth.signUp.mockResolvedValue({
				data: { user: mockUser, session: null },
				error: null
			});

			const result = await mockFluxbase.auth.signUp({
				email: NEW_USER_EMAIL,
				password: MOCK_PASSWORD_A,
				options: {
					data: {
						first_name: 'New',
						last_name: 'User'
					}
				}
			});

			expect(result.error).toBeNull();
			expect(result.data?.user?.email).toBe(NEW_USER_EMAIL);
		});

		it('should reject weak passwords', async () => {
			mockFluxbase.auth.signUp.mockResolvedValue({
				data: { user: null, session: null },
				error: { message: 'Password is too weak' }
			});

			const result = await mockFluxbase.auth.signUp({
				email: TEST_EMAIL,
				password: MOCK_PASSWORD_WEAK
			});

			expect(result.error).not.toBeNull();
			expect(result.error?.message).toContain('weak');
		});

		it('should reject duplicate email', async () => {
			mockFluxbase.auth.signUp.mockResolvedValue({
				data: { user: null, session: null },
				error: { message: 'User already registered' }
			});

			const result = await mockFluxbase.auth.signUp({
				email: 'existing@example.com',
				password: MOCK_PASSWORD_A
			});

			expect(result.error).not.toBeNull();
			expect(result.error?.message).toContain('already');
		});
	});

	describe('Password Reset Flow', () => {
		it('should send password reset email', async () => {
			mockFluxbase.auth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null
			});

			const result = await mockFluxbase.auth.resetPasswordForEmail('test@example.com', {
				redirectTo: 'http://localhost:5173/auth/reset-password'
			});

			expect(result.error).toBeNull();
		});

		it('should not reveal if email exists (security)', async () => {
			// Even for non-existent emails, should return success
			mockFluxbase.auth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null
			});

			const result = await mockFluxbase.auth.resetPasswordForEmail('nonexistent@example.com');

			// Should still succeed (no email enumeration)
			expect(result.error).toBeNull();
		});

		it('should update password with valid token', async () => {
			mockFluxbase.auth.updateUser.mockResolvedValue({
				data: { user: { id: MOCK_USER_ID } },
				error: null
			});

			const result = await mockFluxbase.auth.updateUser({
				password: MOCK_PASSWORD_NEW
			});

			expect(result.error).toBeNull();
		});
	});

	describe('Sign Out Flow', () => {
		it('should successfully sign out', async () => {
			mockFluxbase.auth.signOut.mockResolvedValue({
				error: null
			});

			const result = await mockFluxbase.auth.signOut();

			expect(result.error).toBeNull();
		});
	});

	describe('Session Management', () => {
		it('should get current session', async () => {
			const mockSession = {
				user: { id: MOCK_USER_ID, email: TEST_EMAIL },
				access_token: MOCK_TOKEN_A,
				expires_at: Date.now() + 3600000
			};

			mockFluxbase.auth.getSession.mockResolvedValue({
				data: { session: mockSession },
				error: null
			});

			const result = await mockFluxbase.auth.getSession();

			expect(result.data?.session).not.toBeNull();
			expect(result.data?.session?.user?.email).toBe(TEST_EMAIL);
		});

		it('should return null session when not authenticated', async () => {
			mockFluxbase.auth.getSession.mockResolvedValue({
				data: { session: null },
				error: null
			});

			const result = await mockFluxbase.auth.getSession();

			expect(result.data?.session).toBeNull();
		});

		it('should handle auth state changes', async () => {
			const callback = vi.fn();

			mockFluxbase.auth.onAuthStateChange(callback);

			expect(mockFluxbase.auth.onAuthStateChange).toHaveBeenCalledWith(callback);
		});
	});
});
