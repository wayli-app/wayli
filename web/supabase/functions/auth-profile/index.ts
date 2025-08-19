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

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		if (req.method === 'GET') {
			// Get user profile from user_profiles table
			let { data: profile, error: profileError } = await supabase
				.from('user_profiles')
				.select('*')
				.eq('id', user.id)
				.single();

			// If profile doesn't exist, create one with default values
			if (profileError && profileError.code === 'PGRST116') {
				// No rows returned
				logInfo('Creating new user profile', 'AUTH-PROFILE', { userId: user.id });

				// Check if this is the first user (make them admin)
				const { count: userCount } = await supabase
					.from('user_profiles')
					.select('*', { count: 'exact', head: true });

				const isFirstUser = userCount === 0;
				const defaultRole = isFirstUser ? 'admin' : 'user';

				// Create profile with default role
				const { data: newProfile, error: createError } = await supabase
					.from('user_profiles')
					.insert({
						id: user.id,
						role: defaultRole,
						first_name: user.user_metadata?.first_name || '',
						last_name: user.user_metadata?.last_name || '',
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					})
					.select()
					.single();

				if (createError) {
					logError(createError, 'AUTH-PROFILE');
					return errorResponse('Failed to create profile', 500);
				}

				profile = newProfile;
				profileError = null;

				// Also update user metadata to include the role
				if (isFirstUser) {
					const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
						user_metadata: {
							...user.user_metadata,
							role: defaultRole
						}
					});

					if (metadataError) {
						logError(metadataError, 'AUTH-PROFILE');
						console.warn('Failed to update user metadata with role, but profile was created');
					}
				}
			} else if (profileError) {
				logError(profileError, 'AUTH-PROFILE');
				return errorResponse('Failed to fetch profile', 500);
			}

			// Combine profile data with email
			const completeProfile = {
				...profile,
				email: user.email || ''
			};

			return successResponse(completeProfile);
		}

		if (req.method === 'POST') {
			logInfo('Updating user profile', 'AUTH-PROFILE', { userId: user.id });

			const body = await parseJsonBody<{
				first_name: string;
				last_name: string;
				email: string;
				home_address?: string | Record<string, unknown>;
			}>(req);

			// Validate required fields
			const requiredFields = ['first_name', 'last_name', 'email'];
			const missingFields = validateRequiredFields(body, requiredFields);

			if (missingFields.length > 0) {
				return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
			}

			// Update profile in user_profiles table
			const { data: updatedProfile, error: updateError } = await supabase
				.from('user_profiles')
				.update({
					first_name: body.first_name,
					last_name: body.last_name,
					home_address: body.home_address,
					updated_at: new Date().toISOString()
				})
				.eq('id', user.id)
				.select()
				.single();

			if (updateError) {
				logError(updateError, 'AUTH-PROFILE');
				return errorResponse('Failed to update profile', 500);
			}

			// Update email in auth.users if it changed
			if (body.email && body.email !== user.email) {
				const { error: emailUpdateError } = await supabase.auth.admin.updateUserById(user.id, {
					email: String(body.email || '')
				});

				if (emailUpdateError) {
					logError(emailUpdateError, 'AUTH-PROFILE');
					return errorResponse('Failed to update email', 500);
				}
			}

			// Combine updated profile with email
			const completeProfile = {
				...updatedProfile,
				email: String(body.email || user.email || '')
			};

			logSuccess('Profile updated successfully', 'AUTH-PROFILE', { userId: user.id });
			return successResponse(completeProfile);
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'AUTH-PROFILE');
		return errorResponse('Internal server error', 500);
	}
});
