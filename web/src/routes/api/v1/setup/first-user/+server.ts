import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse, conflictResponse } from '$lib/utils/api/response';
import { supabase } from '$lib/supabase';
// import { RealtimeSetupService } from '$lib/services/realtime-setup.service';
// TODO: Replace with new realtime setup service if needed.

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, password, name } = await request.json();

		if (!email || !password || !name) {
			return validationErrorResponse('Email, password, and name are required');
		}

		// Check if any users exist
		const { data: existingUsers, error: checkError } = await supabase
			.from('users')
			.select('id')
			.limit(1);

		if (checkError) {
			console.error('Error checking existing users:', checkError);
			return errorResponse('Failed to check existing users', 500);
		}

		if (existingUsers && existingUsers.length > 0) {
			return conflictResponse('First user already exists');
		}

		// Create the user
		const { data: authData, error: authError } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: {
					name,
					role: 'admin'
				}
			}
		});

		if (authError) {
			console.error('Error creating user:', authError);
			return errorResponse('Failed to create user', 500);
		}

		if (!authData.user) {
			return errorResponse('Failed to create user', 500);
		}

		// Create user profile
		const { error: profileError } = await supabase
			.from('users')
			.insert({
				id: authData.user.id,
				email: authData.user.email!,
				name,
				role: 'admin',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			});

		if (profileError) {
			console.error('Error creating user profile:', profileError);
			return errorResponse('Failed to create user profile', 500);
		}

		// Create default user preferences
		const { error: preferencesError } = await supabase
			.from('user_preferences')
			.insert({
				user_id: authData.user.id,
				theme: 'system',
				language: 'en',
				notifications_enabled: true,
				email_notifications: true,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			});

		if (preferencesError) {
			console.error('Error creating user preferences:', preferencesError);
			return errorResponse('Failed to create user preferences', 500);
		}

		// Initialize realtime functionality
		console.log('🚀 Initializing realtime functionality during first user setup...');
		try {
			// await RealtimeSetupService.initialize();
			// const realtimeStatus = RealtimeSetupService.getStatus();
			console.log(`📡 Realtime initialization result: disabled`);
		} catch (realtimeError) {
			console.warn('⚠️ Realtime initialization failed, but continuing with setup:', realtimeError);
		}

		return successResponse({
			user: {
				id: authData.user.id,
				email: authData.user.email,
				name,
				role: 'admin'
			},
			message: 'First user created successfully. Please check your email to verify your account.'
		});

	} catch (error) {
		console.error('Error in first user setup:', error);
		return errorResponse(error);
	}
};