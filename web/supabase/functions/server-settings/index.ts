import {
	setupRequest,
	successResponse,
	errorResponse,
	logError,
	logInfo
} from '../_shared/utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		// This endpoint requires anon key for rate limiting and security
		// but doesn't require user authentication
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			logError('Missing authorization header', 'SERVER-SETTINGS');
			return errorResponse('Missing authorization header', 401);
		}

		logInfo('Public server settings request', 'SERVER-SETTINGS');

		// Create Supabase client with service role key for database access
		// This allows reading server settings regardless of RLS policies
		const supabaseUrl = Deno.env.get('SUPABASE_URL');
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

		if (!supabaseUrl || !supabaseServiceKey) {
			logError('Missing environment variables', 'SERVER-SETTINGS');
			return errorResponse('Server configuration error', 500);
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});

		if (req.method === 'GET') {
			// Get basic server settings that are safe for public access
			const { data: settings, error: settingsError } = await supabase
				.from('server_settings')
				.select('allow_registration, require_email_verification, server_name, is_setup_complete')
				.single();

			if (settingsError && settingsError.code !== 'PGRST116') {
				// PGRST116 = no rows returned
				logError(settingsError, 'SERVER-SETTINGS');
				return errorResponse('Failed to fetch server settings', 500);
			}

			// Return default settings if none exist
			const defaultSettings = {
				allow_registration: true,
				require_email_verification: false,
				server_name: 'Wayli',
				is_setup_complete: false
			};

			const publicSettings = {
				allow_registration: settings?.allow_registration ?? defaultSettings.allow_registration,
				require_email_verification:
					settings?.require_email_verification ?? defaultSettings.require_email_verification,
				server_name: settings?.server_name ?? defaultSettings.server_name,
				is_setup_complete: settings?.is_setup_complete ?? defaultSettings.is_setup_complete
			};

			logInfo('Public server settings returned', 'SERVER-SETTINGS', publicSettings);
			return successResponse(publicSettings);
		}

		// Only GET is allowed for public access
		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'SERVER-SETTINGS');
		return errorResponse('Internal server error', 500);
	}
});
