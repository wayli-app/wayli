import { authenticator } from 'otplib';
import { randomBytes, createHash } from 'crypto';
import QRCode from 'qrcode';

// Configure otplib with secure defaults
authenticator.options = {
	window: 1, // Allow ±1 time step (30 seconds) for clock drift
	step: 30, // 30-second time step (standard)
	digits: 6 // 6-digit codes (standard)
};

export interface TOTPConfig {
	issuer: string;
	label: string;
	email: string;
}

export interface RecoveryCode {
	code: string;
	hashed: string;
}

export class TOTPService {
	/**
	 * Generate a new TOTP secret
	 */
	static generateSecret(): string {
		return authenticator.generateSecret();
	}

	/**
	 * Generate a QR code URL for TOTP setup
	 */
	static async generateQRCode(config: TOTPConfig, secret: string): Promise<string> {
		try {
			const otpauthUrl = authenticator.keyuri(config.email, config.issuer, secret);
			return await QRCode.toDataURL(otpauthUrl);
		} catch (error) {
			console.error('QR code generation failed:', error);
			throw new Error('Failed to generate QR code');
		}
	}

	/**
	 * Verify a TOTP code
	 */
	static verifyCode(token: string, secret: string): boolean {
		try {
			return authenticator.verify({ token, secret });
		} catch (error) {
			console.error('TOTP verification error:', error);
			return false;
		}
	}

	/**
	 * Generate recovery codes
	 */
	static generateRecoveryCodes(count = 10, length = 10): RecoveryCode[] {
		const codes: RecoveryCode[] = [];

		for (let i = 0; i < count; i++) {
			const code = randomBytes(length)
				.toString('base64')
				.replace(/[/+=]/g, '') // Remove URL-unsafe characters
				.substring(0, length);

			const hashed = createHash('sha256').update(code).digest('hex');

			codes.push({ code, hashed });
		}

		return codes;
	}

	/**
	 * Verify a recovery code
	 */
	static verifyRecoveryCode(
		code: string,
		hashedCodes: string[]
	): { isValid: boolean; remainingCodes: string[] } {
		const hashedCode = createHash('sha256').update(code).digest('hex');
		const codeIndex = hashedCodes.indexOf(hashedCode);

		if (codeIndex === -1) {
			return { isValid: false, remainingCodes: hashedCodes };
		}

		// Remove the used code
		const remainingCodes = [...hashedCodes];
		remainingCodes.splice(codeIndex, 1);

		return { isValid: true, remainingCodes };
	}

	/**
	 * Create a complete TOTP setup
	 */
	static async createTOTPSetup(config: TOTPConfig): Promise<{
		secret: string;
		qrCodeUrl: string;
		recoveryCodes: RecoveryCode[];
	}> {
		const secret = this.generateSecret();
		const qrCodeUrl = await this.generateQRCode(config, secret);
		const recoveryCodes = this.generateRecoveryCodes();

		return {
			secret,
			qrCodeUrl,
			recoveryCodes
		};
	}

	/**
	 * Validate TOTP configuration
	 */
	static validateConfig(config: TOTPConfig): { isValid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!config.issuer || config.issuer.trim().length === 0) {
			errors.push('Issuer is required');
		}

		if (!config.label || config.label.trim().length === 0) {
			errors.push('Label is required');
		}

		if (!config.email || !this.isValidEmail(config.email)) {
			errors.push('Valid email is required');
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	/**
	 * Validate TOTP token format
	 */
	static validateToken(token: string): { isValid: boolean; error?: string } {
		if (!token || token.trim().length === 0) {
			return { isValid: false, error: 'Token is required' };
		}

		if (!/^\d{6}$/.test(token)) {
			return { isValid: false, error: 'Token must be exactly 6 digits' };
		}

		return { isValid: true };
	}

	/**
	 * Validate recovery code format
	 */
	static validateRecoveryCode(code: string): { isValid: boolean; error?: string } {
		if (!code || code.trim().length === 0) {
			return { isValid: false, error: 'Recovery code is required' };
		}

		if (code.length < 8) {
			return { isValid: false, error: 'Recovery code must be at least 8 characters' };
		}

		return { isValid: true };
	}

	/**
	 * Simple email validation
	 */
	private static isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}
}
