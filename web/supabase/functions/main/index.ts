import * as jose from "jose";

console.log("🚀 main function started");

const JWT_SECRET = Deno.env.get("JWT_SECRET");
const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true";

function getAuthToken(req: Request): string {
	const authHeader = req.headers.get("authorization");
	if (!authHeader) {
		throw new Error("Missing authorization header");
	}
	const [bearer, token] = authHeader.split(" ");
	if (bearer !== "Bearer") {
		throw new Error("Auth header is not 'Bearer {token}'");
	}
	return token;
}

async function verifyJWT(jwt: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const secretKey = encoder.encode(JWT_SECRET);
	try {
		await jose.jwtVerify(jwt, secretKey);
	} catch (err) {
		console.error("❌ JWT verification error:", err);
		return false;
	}
	return true;
}

async function handleRequest(req: Request): Promise<Response> {
	if (req.method !== "OPTIONS" && VERIFY_JWT) {
		try {
			const token = getAuthToken(req);
			const isValidJWT = await verifyJWT(token);

			if (!isValidJWT) {
				return new Response(JSON.stringify({ msg: "Invalid JWT" }), {
					status: 401,
					headers: { "Content-Type": "application/json" }
				});
			}
		} catch (e) {
			console.error("❌ Auth error:", e);
			const errorMessage = e instanceof Error ? e.message : String(e);
			return new Response(JSON.stringify({ msg: errorMessage }), {
				status: 401,
				headers: { "Content-Type": "application/json" }
			});
		}
	}

	const url = new URL(req.url);
	const { pathname } = url;
	const path_parts = pathname.split("/");
	const service_name = path_parts[1];

	if (!service_name || service_name === "") {
		const error = { msg: "missing function name in request" };
		return new Response(JSON.stringify(error), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
	}

	const servicePath = `/home/supabase/functions/${service_name}`;
	console.log(`🔧 serving the request with ${servicePath}`);

	// For now, return a simple response since EdgeRuntime.userWorkers is not available
	// You may need to implement the actual worker logic based on your Supabase setup
	return new Response(JSON.stringify({
		msg: "Service routing not implemented",
		service: service_name,
		path: servicePath
	}), {
		status: 501,
		headers: { "Content-Type": "application/json" }
	});
}

// Use modern Deno.serve API
Deno.serve(handleRequest);
