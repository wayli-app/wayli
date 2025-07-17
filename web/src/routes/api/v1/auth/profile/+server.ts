import type { RequestHandler } from '@sveltejs/kit';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { UserProfileService } from '$lib/services/user-profile.service';
import type { UserProfile } from '$lib/types/user.types';

// Expose supabase client for preferences fetch in a type-safe way
const getSupabaseClient = () =>
	(
		UserProfileService as unknown as {
			supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>;
		}
	).supabase;

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Get current user from session
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}

		const user = session.user;

		// Get user profile from user_profiles
		const profile = await UserProfileService.getUserProfile(user.id);
		if (!profile) {
			return errorResponse('User profile not found', 404);
		}

		// Check if user is admin
		const isAdmin = await UserProfileService.isUserAdmin(user.id);

		// Get user preferences from user_preferences table
		const { data: preferences, error: prefError } = await getSupabaseClient()
			.from('user_preferences')
			.select('*')
			.eq('id', user.id)
			.single();
		if (prefError || !preferences) {
			return errorResponse('User preferences not found', 404);
		}

		// Check if 2FA is enabled (still from user_metadata for now)
		const two_factor_enabled = !!user.user_metadata?.totp_enabled;

		return successResponse({
			profile,
			preferences,
			two_factor_enabled,
			isAdmin,
			user: {
				id: user.id,
				email: user.email,
				email_confirmed_at: user.email_confirmed_at,
				created_at: user.created_at
			}
		});
	} catch (error) {
		console.error('Error fetching user profile:', error);
		return errorResponse('Failed to fetch user profile', 500);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const { first_name, last_name, full_name, avatar_url, home_address } = body;

		// Get current user from session
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}

		const user = session.user;

		// Update user_profiles table
		const updates: Partial<UserProfile> = {};
		if (first_name !== undefined) updates.first_name = first_name;
		if (last_name !== undefined) updates.last_name = last_name;
		if (full_name !== undefined) updates.full_name = full_name;
		if (avatar_url !== undefined) updates.avatar_url = avatar_url;
		if (home_address !== undefined) updates.home_address = home_address;

		const updated = await UserProfileService.updateUserProfile(user.id, updates);
		if (!updated) {
			return errorResponse('Failed to update profile', 500);
		}

		// Get updated profile
		const updatedProfile = await UserProfileService.getUserProfile(user.id);

		return successResponse({
			message: 'Profile updated successfully',
			profile: updatedProfile
		});
	} catch (error) {
		console.error('Profile update error:', error);
		return errorResponse('Failed to update profile', 500);
	}
};
