import { serve } from 'https://deno.land/std@0.131.0/http/server.ts';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';

console.log('main function started');

const JWT_SECRET = Deno.env.get('JWT_SECRET');
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true';

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

serve(async (req: Request) => {
	const url = new URL(req.url);
	const { pathname } = url;
	const path_parts = pathname.split('/');
	const service_name = path_parts[1];

	// JWT verification is enabled by default for all functions (opt-out model)
	// Functions that use alternative authentication (API keys, etc.) can opt-out
	const noJwtFunctions: string[] = [
		'owntracks-points' // Uses API key authentication
	];

	if (req.method !== 'OPTIONS' && VERIFY_JWT && !noJwtFunctions.includes(service_name)) {
		try {
			const token = getAuthToken(req);
			const isValidJWT = await verifyJWT(token);

			if (!isValidJWT) {
				return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		} catch (e) {
			console.error(e);
			return new Response(JSON.stringify({ msg: e.toString() }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	if (!service_name || service_name === '') {
		const error = { msg: 'missing function name in request' };
		return new Response(JSON.stringify(error), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const servicePath = `/home/supabase/functions/${service_name}`;
	console.error(`serving the request with ${servicePath}`);

	const memoryLimitMb = 500; // Increased to handle large file processing and job creation
	const workerTimeoutMs = 5 * 60 * 1000; // Increased timeout for large file processing
	const noModuleCache = false;
	const importMapPath = null;
	const envVarsObj = Deno.env.toObject();
	const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);

	try {
		const worker = await EdgeRuntime.userWorkers.create({
			servicePath,
			memoryLimitMb,
			workerTimeoutMs,
			noModuleCache,
			importMapPath,
			envVars
		});
		return await worker.fetch(req);
	} catch (e) {
		const error = { msg: e.toString() };
		return new Response(JSON.stringify(error), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
});
