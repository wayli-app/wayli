import { serve } from 'https://deno.land/std@0.131.0/http/server.ts';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';

console.log('🚀 main function started');

// Validate environment variables
const JWT_SECRET = Deno.env.get('JWT_SECRET');
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true';

console.log('🔧 [MAIN] Environment variables:');
console.log('  - JWT_SECRET:', JWT_SECRET ? '✅ Set' : '❌ Not set');
console.log('  - VERIFY_JWT:', VERIFY_JWT ? '✅ Enabled' : '❌ Disabled');

if (VERIFY_JWT && !JWT_SECRET) {
	console.error('❌ [MAIN] JWT verification is enabled but JWT_SECRET is not set');
}

function getAuthToken(req: Request) {
	const authHeader = req.headers.get('authorization');
	if (!authHeader) {
		throw new Error('Missing authorization header');
	}
	const [bearer, token] = authHeader.split(' ');
	if (bearer !== 'Bearer') {
		throw new Error(`Auth header is not 'Bearer {token}'`);
	}
	return token;
}

async function verifyJWT(jwt: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const secretKey = encoder.encode(JWT_SECRET);
	try {
		await jose.jwtVerify(jwt, secretKey);
	} catch (err) {
		console.error(err);
		return false;
	}
	return true;
}

console.log('✅ [MAIN] Function setup complete, starting server...');

serve(async (req: Request) => {
	console.log(`📥 [MAIN] Request: ${req.method} ${req.url}`);

	// Handle CORS preflight
	if (req.method === 'OPTIONS') {
		console.log('🔄 [MAIN] Handling CORS preflight');
		return new Response('ok', {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization'
			}
		});
	}

	// Verify JWT if enabled
	if (VERIFY_JWT) {
		try {
			const token = getAuthToken(req);
			const isValidJWT = await verifyJWT(token);

			if (!isValidJWT) {
				console.log('❌ [MAIN] Invalid JWT token');
				return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			console.log('✅ [MAIN] JWT token verified');
		} catch (e) {
			console.error('❌ [MAIN] JWT verification error:', e);
			const errorMessage = e instanceof Error ? e.message : String(e);
			return new Response(JSON.stringify({ msg: errorMessage }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	// Main function just provides a health check and info
	const response = {
		success: true,
		message: 'Main function is running',
		timestamp: new Date().toISOString(),
		note: 'Individual functions should be called directly (e.g., /functions/v1/auth-check-2fa)',
		availableFunctions: [
			'auth-check-2fa',
			'auth-profile',
			'jobs',
			'trips',
			'export-download',
			'health'
		]
	};

	console.log('✅ [MAIN] Returning success response');
	return new Response(JSON.stringify(response), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
});
