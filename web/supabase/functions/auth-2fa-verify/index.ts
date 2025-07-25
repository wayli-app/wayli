import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  parseJsonBody,
  validateRequiredFields,
  logError,
  logInfo,
  logSuccess
} from '../_shared/utils.ts';

// RFC 4648 Base32 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

class SimpleTOTP {
  private static readonly DIGITS = 6;
  private static readonly PERIOD = 30;
  private static readonly WINDOW = 2;

  /**
   * Generate a cryptographically secure random secret
   */
  static generateSecret(length: number = 32): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    let result = '';
    for (let i = 0; i < length; i++) {
      result += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length];
    }
    return result;
  }

  /**
   * Decode base32 string to bytes
   */
  private static base32Decode(base32: string): Uint8Array {
    const upperBase32 = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
    const bits = upperBase32.split('').map(char => {
      const index = BASE32_ALPHABET.indexOf(char);
      return index.toString(2).padStart(5, '0');
    }).join('');

    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      const byte = bits.substr(i, 8);
      if (byte.length === 8) {
        bytes.push(parseInt(byte, 2));
      }
    }
    return new Uint8Array(bytes);
  }

  /**
   * Generate TOTP token for given secret and time
   */
  static async generateToken(secret: string, time?: number): Promise<string> {
    const currentTime = time || Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(currentTime / this.PERIOD);

    // Convert time step to 8-byte big-endian buffer
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setBigUint64(0, BigInt(timeStep), false);

    // Decode base32 secret
    const secretBytes = this.base32Decode(secret);

    // Generate HMAC-SHA1
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, timeBuffer);
    const signatureArray = new Uint8Array(signature);

    // Generate 6-digit code using RFC 6238 algorithm
    const offset = signatureArray[signatureArray.length - 1] & 0x0f;
    const code = (
      ((signatureArray[offset] & 0x7f) << 24) |
      ((signatureArray[offset + 1] & 0xff) << 16) |
      ((signatureArray[offset + 2] & 0xff) << 8) |
      (signatureArray[offset + 3] & 0xff)
    ) % Math.pow(10, this.DIGITS);

    return code.toString().padStart(this.DIGITS, '0');
  }

  /**
   * Verify TOTP token with clock drift tolerance
   */
  static async verifyToken(token: string, secret: string): Promise<boolean> {
    const currentTime = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(currentTime / this.PERIOD);

    // Check current time step and adjacent steps for clock drift
    for (let i = -this.WINDOW; i <= this.WINDOW; i++) {
      const checkTime = timeStep + i;
      const expectedToken = await this.generateToken(secret, checkTime * this.PERIOD);

      if (token === expectedToken) {
        return true;
      }
    }

    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = setupRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const { user, supabase } = await authenticateRequest(req);

    if (req.method === 'POST') {
      logInfo('Verifying 2FA token', 'AUTH-2FA-VERIFY', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['token'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Get user's 2FA secret from profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        logError(profileError, 'AUTH-2FA-VERIFY');
        return errorResponse('User profile not found', 404);
      }

      if (!profile.two_factor_enabled) {
        return errorResponse('2FA is not enabled for this user', 400);
      }

      // Verify the TOTP token using our custom implementation
      logInfo('Starting TOTP verification', 'AUTH-2FA-VERIFY', {
        token: String(body.token),
        secretLength: profile.two_factor_secret?.length || 0,
        currentTime: Math.floor(Date.now() / 1000)
      });

      const isValid = await SimpleTOTP.verifyToken(String(body.token), profile.two_factor_secret);

      logInfo('TOTP verification result', 'AUTH-2FA-VERIFY', {
        token: String(body.token),
        isValid
      });

      if (!isValid) {
        logError('Invalid TOTP token', 'AUTH-2FA-VERIFY');
        return errorResponse('Invalid verification token', 400);
      }

      logSuccess('2FA token verified successfully', 'AUTH-2FA-VERIFY', { userId: user.id });
      return successResponse({
        message: '2FA token verified successfully',
        verified: true
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-2FA-VERIFY');
    return errorResponse('Internal server error', 500);
  }
});