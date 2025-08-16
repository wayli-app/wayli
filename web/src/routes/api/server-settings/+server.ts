import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async () => {
	try {
		// Create Supabase client for server-side operations
		const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get server settings
		const { data: settings, error: settingsError } = await supabase
			.from('server_settings')
			.select('allow_registration')
			.single();

		if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116 = no rows returned
			console.error('❌ [SERVER-SETTINGS] Error fetching settings:', settingsError);
			return json(
				{
					success: false,
					error: 'Failed to fetch server settings'
				},
				{ status: 500 }
			);
		}

		// Return only public settings
		const publicSettings = {
			success: true,
			data: {
				allow_registration: settings?.allow_registration ?? true // Default to true if no settings exist
			}
		};
		return json(publicSettings);
	} catch (error) {
		console.error('❌ [SERVER-SETTINGS] Internal server error:', error);
		return json(
			{
				success: false,
				error: 'Internal server error'
			},
			{ status: 500 }
		);
	}
};