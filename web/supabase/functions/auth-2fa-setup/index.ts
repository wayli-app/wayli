import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	parseJsonBody,
	validateRequiredFields,
	logError,
	logSuccess
} from '../_shared/utils.ts';

/**
 * Generate recovery codes for 2FA
 */
function generateRecoveryCodes(count: number = 10): string[] {
	const codes: string[] = [];
	for (let i = 0; i < count; i++) {
		// Generate 8-character alphanumeric codes
		const code = Array.from(
			{ length: 8 },
			() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
		).join('');
		codes.push(code);
	}
	return codes;
}

/**
 * Hash a recovery code for storage using SHA-256
 */
async function hashRecoveryCode(code: string): Promise<string> {
	// Convert the code to a Uint8Array
	const encoder = new TextEncoder();
	const data = encoder.encode(code);

	// Generate SHA-256 hash
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);

	// Convert to hex string
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hashHex;
}

// RFC 4648 Base32 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Simple and reliable TOTP implementation
class SimpleTOTP {
	private static readonly DIGITS = 6;
	private static readonly PERIOD = 30;
	private static readonly WINDOW = 2;

	/**
	 * Generate a cryptographically secure random secret
	 */
	static generateSecret(length: number = 32): string {
		const chars = BASE32_ALPHABET;
		let secret = '';

		const randomBytes = new Uint8Array(length);
		crypto.getRandomValues(randomBytes);

		for (let i = 0; i < length; i++) {
			secret += chars[randomBytes[i] % chars.length];
		}

		return secret;
	}

	/**
	 * Simple base32 decode
	 */
	private static base32Decode(base32: string): Uint8Array {
		const bytes: number[] = [];
		let bits = 0;
		let value = 0;

		const cleanBase32 = base32.replace(/=+$/, '').toUpperCase();

		for (let i = 0; i < cleanBase32.length; i++) {
			const char = cleanBase32[i];
			const index = BASE32_ALPHABET.indexOf(char);

			if (index === -1) continue;

			value = (value << 5) | index;
			bits += 5;

			if (bits >= 8) {
				bytes.push((value >>> (bits - 8)) & 0xff);
				bits -= 8;
			}
		}

		return new Uint8Array(bytes);
	}

	/**
	 * Generate TOTP token
	 */
	static async generateToken(secret: string, time?: number): Promise<string> {
		const currentTime = time ?? Math.floor(Date.now() / 1000);
		const timeStep = Math.floor(currentTime / this.PERIOD);

		// Decode base32 secret
		const key = this.base32Decode(secret);

		// Create time buffer (8 bytes, big-endian)
		const timeBuffer = new Uint8Array(8);
		const timeStepBigInt = BigInt(timeStep);
		for (let i = 0; i < 8; i++) {
			timeBuffer[i] = Number((timeStepBigInt >> BigInt(8 * (7 - i))) & BigInt(0xff));
		}

		// Generate HMAC-SHA1
		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			key,
			{ name: 'HMAC', hash: 'SHA-1' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
		const hash = new Uint8Array(signature);

		// Dynamic truncation
		const offset = hash[hash.length - 1] & 0xf;
		const code =
			((hash[offset] & 0x7f) << 24) |
			((hash[offset + 1] & 0xff) << 16) |
			((hash[offset + 2] & 0xff) << 8) |
			(hash[offset + 3] & 0xff);

		return (code % Math.pow(10, this.DIGITS)).toString().padStart(this.DIGITS, '0');
	}

	/**
	 * Verify TOTP token
	 */
	static async verifyToken(token: string, secret: string): Promise<boolean> {
		const currentTime = Math.floor(Date.now() / 1000);
		const timeStep = Math.floor(currentTime / this.PERIOD);

		// Check current time and ±WINDOW time steps
		for (let i = -this.WINDOW; i <= this.WINDOW; i++) {
			const expectedToken = await this.generateToken(secret, (timeStep + i) * this.PERIOD);
			if (token === expectedToken) {
				return true;
			}
		}

		return false;
	}
}

Deno.serve(async (req) => {
	// Handle CORS preflight requests
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		if (req.method === 'POST') {
			const body = await parseJsonBody<Record<string, unknown>>(req);

			// Check if this is a request to generate a new secret or verify an existing one
			if (body.action === 'generate') {
				// Generate a new TOTP secret
				const secret = SimpleTOTP.generateSecret(32);

				// Store secret temporarily (in production, you might want to encrypt this)
				const { error: updateError } = await supabase.from('user_profiles').upsert({
					id: user.id,
					two_factor_secret: secret,
					two_factor_enabled: false
				});

				if (updateError) {
					logError(updateError, 'AUTH-2FA-SETUP');
					return errorResponse('Failed to store secret', 500);
				}

				// Generate QR code URL
				const qrCodeUrl = `otpauth://totp/Wayli:${user.email}?secret=${secret}&issuer=Wayli&algorithm=SHA1&digits=6&period=30`;

				logSuccess('2FA secret generated successfully', 'AUTH-2FA-SETUP', {
					userId: user.id,
					secretLength: secret.length
				});

				return successResponse({
					secret,
					qrCodeUrl
				});
			} else if (body.action === 'verify') {
				// Validate required fields for verification
				const requiredFields = ['token'];
				const missingFields = validateRequiredFields(body, requiredFields);

				if (missingFields.length > 0) {
					return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
				}

				// Get the stored secret
				const { data: profile, error: profileError } = await supabase
					.from('user_profiles')
					.select('two_factor_secret')
					.eq('id', user.id)
					.single();

				if (profileError || !profile?.two_factor_secret) {
					logError(profileError, 'AUTH-2FA-SETUP');
					return errorResponse('No 2FA secret found. Please generate a new one.', 400);
				}

				// Verify the TOTP token
				const isValid = await SimpleTOTP.verifyToken(String(body.token), profile.two_factor_secret);

				if (!isValid) {
					return errorResponse('Invalid verification token', 400);
				}

				// Enable 2FA
				const { error: updateError } = await supabase
					.from('user_profiles')
					.update({
						two_factor_enabled: true
					})
					.eq('id', user.id);

				if (updateError) {
					logError(updateError, 'AUTH-2FA-SETUP');
					return errorResponse('Failed to enable 2FA', 500);
				}

				// Generate recovery codes
				const recoveryCodes = generateRecoveryCodes();

				// Hash recovery codes before storing
				const hashedRecoveryCodes = await Promise.all(
					recoveryCodes.map((code) => hashRecoveryCode(code))
				);

				// Store recovery codes (hashed) in the database
				const { error: recoveryError } = await supabase
					.from('user_profiles')
					.update({
						two_factor_recovery_codes: hashedRecoveryCodes
					})
					.eq('id', user.id);

				if (recoveryError) {
					logError(recoveryError, 'AUTH-2FA-SETUP');
					return errorResponse('Failed to store recovery codes', 500);
				}

				logSuccess('2FA setup completed successfully', 'AUTH-2FA-SETUP', {
					userId: user.id,
					recoveryCodesCount: recoveryCodes.length
				});

				return successResponse({
					message: '2FA setup completed successfully',
					enabled: true,
					recoveryCodes
				});
			} else {
				return errorResponse('Invalid action. Use "generate" or "verify"', 400);
			}
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'AUTH-2FA-SETUP');

		// Ensure CORS headers are applied even for authentication errors
		const errorMessage = error instanceof Error ? error.message : 'Internal server error';
		const status =
			errorMessage.includes('authorization') || errorMessage.includes('token') ? 401 : 500;

		return errorResponse(errorMessage, status);
	}
});
