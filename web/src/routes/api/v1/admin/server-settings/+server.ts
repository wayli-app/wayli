import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check if the current user is an admin
		const isAdmin = session.user.user_metadata?.role === 'admin';
		if (!isAdmin) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
		const { data, error } = await supabase.rpc('get_server_settings');

		if (error) {
			console.error('Error fetching server settings:', error);
			return json({ error: error.message }, { status: 500 });
		}

		return json(data?.[0] || {
			server_name: 'Wayli',
			admin_email: '',
			allow_registration: true,
			require_email_verification: false
		});
	} catch (error) {
		console.error('Unexpected error in GET server settings:', error);
		return json({ error: 'An unexpected server error occurred' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check if the current user is an admin
		const isAdmin = session.user.user_metadata?.role === 'admin';
		if (!isAdmin) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const body = await request.json();
		const { server_name, admin_email, allow_registration, require_email_verification } = body;

		if (!server_name) {
			return json({ error: 'Server name is required' }, { status: 400 });
		}

		const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// First, try to get the existing settings row
		const { data: existingSettings, error: fetchError } = await supabase
			.from('server_settings')
			.select('id')
			.limit(1)
			.maybeSingle();

		if (fetchError) {
			console.error('Error fetching existing server settings:', fetchError);
			return json({ error: fetchError.message }, { status: 500 });
		}

		if (existingSettings?.id) {
			// Update existing row
			const { error: updateError } = await supabase
				.from('server_settings')
				.update({
					server_name,
					admin_email,
					allow_registration,
					require_email_verification,
					updated_at: new Date().toISOString()
				})
				.eq('id', existingSettings.id);

			if (updateError) {
				console.error('Error updating server settings:', updateError);
				return json({ error: updateError.message }, { status: 500 });
			}
		} else {
			// Insert new row
			const { error: insertError } = await supabase
				.from('server_settings')
				.insert({
					server_name,
					admin_email,
					allow_registration,
					require_email_verification
				});

			if (insertError) {
				console.error('Error inserting server settings:', insertError);
				return json({ error: insertError.message }, { status: 500 });
			}
		}

		return json({ success: true });
	} catch (error) {
		console.error('Unexpected error in POST server settings:', error);
		return json({ error: 'An unexpected server error occurred' }, { status: 500 });
	}
};