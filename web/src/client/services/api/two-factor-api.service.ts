// src/lib/services/api/two-factor-api.service.ts
// Two-Factor Authentication API Service for handling 2FA-related API operations

import { errorHandler, ErrorCode } from '../error-handler.service';
import { TOTPService } from '../totp.service';

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TwoFactorApiServiceConfig {
	supabase: SupabaseClient;
}

export interface Setup2FARequest {
	password: string;
}

export interface Verify2FARequest {
	token: string;
}

export interface RecoveryCodeRequest {
	recoveryCode: string;
}

export interface Disable2FARequest {
	password: string;
}

export interface Setup2FAResult {
	secret: string;
	qrCodeUrl: string;
	email: string;
	message: string;
}

export interface Verify2FAResult {
	message: string;
	enabled: boolean;
}

export interface RecoveryCodeResult {
	message: string;
	enabled: boolean;
}

export interface Disable2FAResult {
	message: string;
	disabled: boolean;
}

export interface Check2FAResult {
	enabled: boolean;
	requiresVerification: boolean;
}

export class TwoFactorApiService {
	private supabase: SupabaseClient;

	constructor(config: TwoFactorApiServiceConfig) {
		this.supabase = config.supabase;
	}

	/**
	 * Setup 2FA for a user
	 */
	async setup2FA(
		userId: string,
		userEmail: string,
		request: Setup2FARequest
	): Promise<Setup2FAResult> {
		try {
			const { password } = request;

			// Validate password
			if (!password) {
				throw errorHandler.createError(
					ErrorCode.MISSING_REQUIRED_FIELD,
					'Password is required',
					400,
					{ field: 'password' }
				);
			}

			// Verify password by attempting to sign in with admin client
			const { error: signInError } = await this.supabase.auth.signInWithPassword({
				email: userEmail,
				password: password
			});

			if (signInError) {
				throw errorHandler.createError(
					ErrorCode.INVALID_CREDENTIALS,
					'Password is incorrect',
					401,
					{ email: userEmail }
				);
			}

			// Generate TOTP setup using the service
			const totpConfig = {
				issuer: 'Wayli',
				label: userEmail,
				email: userEmail
			};

			const { secret, qrCodeUrl } = await TOTPService.createTOTPSetup(totpConfig);

			// Store the secret in user metadata using admin API
			const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
				user_metadata: {
					totp_secret: secret,
					totp_setup_completed: false // Mark as not yet verified
				}
			});

			if (updateError) {
				console.error('❌ [2FAAPI] Error updating user metadata:', updateError);
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					'Failed to save 2FA setup',
					500,
					updateError,
					{ userId }
				);
			}

			return {
				secret,
				qrCodeUrl,
				email: userEmail,
				message: 'TOTP setup generated successfully. Please verify with your authenticator app.'
			};
		} catch (error) {
			console.error('❌ [2FAAPI] Setup 2FA error:', error);
			throw errorHandler.createError(
				ErrorCode.EXTERNAL_SERVICE_ERROR,
				'Failed to setup 2FA',
				500,
				error,
				{ userId }
			);
		}
	}

	/**
	 * Verify 2FA token
	 */
	async verify2FA(userId: string, request: Verify2FARequest): Promise<Verify2FAResult> {
		try {
			const { token } = request;

			// Validate token
			if (!token) {
				throw errorHandler.createError(ErrorCode.MISSING_REQUIRED_FIELD, 'Token is required', 400, {
					field: 'token'
				});
			}

			// Get user to access TOTP secret
			const {
				data: { user },
				error: userError
			} = await this.supabase.auth.admin.getUserById(userId);
			if (userError || !user) {
				throw errorHandler.createError(
					ErrorCode.RECORD_NOT_FOUND,
					'User not found',
					404,
					userError,
					{ userId }
				);
			}

			const totpSecret = user.user_metadata?.totp_secret;
			if (!totpSecret) {
				throw errorHandler.createError(
					ErrorCode.VALIDATION_ERROR,
					'2FA not set up for this user',
					400,
					{ userId }
				);
			}

			// Verify the token
			const isValid = await TOTPService.verifyCode(token, totpSecret);
			if (!isValid) {
				throw errorHandler.createError(ErrorCode.INVALID_CREDENTIALS, 'Invalid 2FA token', 401, {
					userId
				});
			}

			// Mark 2FA as enabled in user metadata
			const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
				user_metadata: {
					...user.user_metadata,
					totp_enabled: true,
					totp_setup_completed: true
				}
			});

			if (updateError) {
				console.error('❌ [2FAAPI] Error updating user metadata:', updateError);
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					'Failed to enable 2FA',
					500,
					updateError,
					{ userId }
				);
			}

			return {
				message: '2FA enabled successfully',
				enabled: true
			};
		} catch (error) {
			console.error('❌ [2FAAPI] Verify 2FA error:', error);
			throw errorHandler.createError(
				ErrorCode.EXTERNAL_SERVICE_ERROR,
				'Failed to verify 2FA',
				500,
				error,
				{ userId }
			);
		}
	}

	/**
	 * Verify recovery code
	 */
	async verifyRecoveryCode(
		userId: string,
		request: RecoveryCodeRequest
	): Promise<RecoveryCodeResult> {
		try {
			const { recoveryCode } = request;

			// Validate recovery code
			if (!recoveryCode) {
				throw errorHandler.createError(
					ErrorCode.MISSING_REQUIRED_FIELD,
					'Recovery code is required',
					400,
					{ field: 'recoveryCode' }
				);
			}

			// Get user to access recovery codes
			const {
				data: { user },
				error: userError
			} = await this.supabase.auth.admin.getUserById(userId);
			if (userError || !user) {
				throw errorHandler.createError(
					ErrorCode.RECORD_NOT_FOUND,
					'User not found',
					404,
					userError,
					{ userId }
				);
			}

			const recoveryCodes = user.user_metadata?.recovery_codes;
			if (!recoveryCodes || !Array.isArray(recoveryCodes)) {
				throw errorHandler.createError(
					ErrorCode.VALIDATION_ERROR,
					'No recovery codes found for this user',
					400,
					{ userId }
				);
			}

			// Check if recovery code is valid
			const isValidCode = recoveryCodes.includes(recoveryCode);
			if (!isValidCode) {
				throw errorHandler.createError(
					ErrorCode.INVALID_CREDENTIALS,
					'Invalid recovery code',
					401,
					{ userId }
				);
			}

			// Remove the used recovery code
			const updatedCodes = recoveryCodes.filter((code: string) => code !== recoveryCode);
			const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
				user_metadata: {
					...user.user_metadata,
					recovery_codes: updatedCodes
				}
			});

			if (updateError) {
				console.error('❌ [2FAAPI] Error updating recovery codes:', updateError);
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					'Failed to update recovery codes',
					500,
					updateError,
					{ userId }
				);
			}

			return {
				message: 'Recovery code verified successfully',
				enabled: true
			};
		} catch (error) {
			console.error('❌ [2FAAPI] Verify recovery code error:', error);
			throw errorHandler.createError(
				ErrorCode.EXTERNAL_SERVICE_ERROR,
				'Failed to verify recovery code',
				500,
				error,
				{ userId }
			);
		}
	}

	/**
	 * Disable 2FA for a user
	 */
	async disable2FA(
		userId: string,
		userEmail: string,
		request: Disable2FARequest
	): Promise<Disable2FAResult> {
		try {
			const { password } = request;

			// Validate password
			if (!password) {
				throw errorHandler.createError(
					ErrorCode.MISSING_REQUIRED_FIELD,
					'Password is required',
					400,
					{ field: 'password' }
				);
			}

			// Verify password by attempting to sign in with admin client
			const { error: signInError } = await this.supabase.auth.signInWithPassword({
				email: userEmail,
				password: password
			});

			if (signInError) {
				throw errorHandler.createError(
					ErrorCode.INVALID_CREDENTIALS,
					'Password is incorrect',
					401,
					{ email: userEmail }
				);
			}

			// Get user to access current metadata
			const {
				data: { user },
				error: userError
			} = await this.supabase.auth.admin.getUserById(userId);
			if (userError || !user) {
				throw errorHandler.createError(
					ErrorCode.RECORD_NOT_FOUND,
					'User not found',
					404,
					userError,
					{ userId }
				);
			}

			// Remove 2FA-related metadata
			const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
				user_metadata: {
					...user.user_metadata,
					totp_enabled: false,
					totp_secret: null,
					totp_setup_completed: false,
					recovery_codes: null
				}
			});

			if (updateError) {
				console.error('❌ [2FAAPI] Error updating user metadata:', updateError);
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					'Failed to disable 2FA',
					500,
					updateError,
					{ userId }
				);
			}

			return {
				message: '2FA disabled successfully',
				disabled: true
			};
		} catch (error) {
			console.error('❌ [2FAAPI] Disable 2FA error:', error);
			throw errorHandler.createError(
				ErrorCode.EXTERNAL_SERVICE_ERROR,
				'Failed to disable 2FA',
				500,
				error,
				{ userId }
			);
		}
	}

	/**
	 * Check 2FA status for a user
	 */
	async check2FAStatus(userId: string): Promise<Check2FAResult> {
		try {
			// Get user to check 2FA status
			const {
				data: { user },
				error: userError
			} = await this.supabase.auth.admin.getUserById(userId);
			if (userError || !user) {
				throw errorHandler.createError(
					ErrorCode.RECORD_NOT_FOUND,
					'User not found',
					404,
					userError,
					{ userId }
				);
			}

			const enabled = !!user.user_metadata?.totp_enabled;
			const requiresVerification = !!(
				user.user_metadata?.totp_secret && !user.user_metadata?.totp_setup_completed
			);

			return {
				enabled,
				requiresVerification
			};
		} catch (error) {
			console.error('❌ [2FAAPI] Check 2FA status error:', error);
			throw errorHandler.createError(
				ErrorCode.DATABASE_ERROR,
				'Failed to check 2FA status',
				500,
				error,
				{ userId }
			);
		}
	}

	/**
	 * Validate setup request
	 */
	validateSetupRequest(request: Setup2FARequest): void {
		const { password } = request;

		if (!password) {
			throw errorHandler.createError(
				ErrorCode.MISSING_REQUIRED_FIELD,
				'Password is required',
				400,
				{ field: 'password' }
			);
		}
	}

	/**
	 * Validate verify request
	 */
	validateVerifyRequest(request: Verify2FARequest): void {
		const { token } = request;

		if (!token) {
			throw errorHandler.createError(ErrorCode.MISSING_REQUIRED_FIELD, 'Token is required', 400, {
				field: 'token'
			});
		}
	}

	/**
	 * Validate recovery code request
	 */
	validateRecoveryCodeRequest(request: RecoveryCodeRequest): void {
		const { recoveryCode } = request;

		if (!recoveryCode) {
			throw errorHandler.createError(
				ErrorCode.MISSING_REQUIRED_FIELD,
				'Recovery code is required',
				400,
				{ field: 'recoveryCode' }
			);
		}
	}

	/**
	 * Validate disable request
	 */
	validateDisableRequest(request: Disable2FARequest): void {
		const { password } = request;

		if (!password) {
			throw errorHandler.createError(
				ErrorCode.MISSING_REQUIRED_FIELD,
				'Password is required',
				400,
				{ field: 'password' }
			);
		}
	}
}
