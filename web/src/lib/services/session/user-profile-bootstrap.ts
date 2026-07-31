/**
 * Ensures a `user_profiles` row exists for the authenticated user.
 *
 * Background: Wayli used to rely on a Postgres trigger (`on_auth_user_created`
 * on `auth.users`) to insert a profile on signup. That trigger could not
 * survive the migration to Fluxbase's declarative schema — Fluxbase owns and
 * re-applies the `auth` schema on every restart, wiping any trigger Wayli
 * attaches to `auth.users`. The trigger was dropped (see commit history) with
 * no replacement, so every signup since has silently lacked a profile row —
 * breaking the admin check and storage RLS for new users.
 *
 * This is the app-side replacement: call `ensureUserProfile()` from every auth
 * entry point (signup, OAuth callback, email-verification completion). It's
 * idempotent and restart-safe (application code, not DB state Fluxbase can
 * wipe). First-user-admin assignment is handled here too (atomic: if no other
 * profile exists yet, this user becomes admin), mirroring the original
 * `handle_new_user` / `set_first_user_admin` trigger intent.
 */

import { fluxbase } from '$lib/fluxbase';

export interface EnsureProfileInput {
	/** The authenticated user's id (auth.users.id). */
	userId: string;
	/** Optional metadata, typically from auth user_metadata at signup. */
	first_name?: string;
	last_name?: string;
	full_name?: string;
}

/**
 * Insert a `user_profiles` row for the user if one doesn't already exist.
 * Returns the existing-or-created profile row, or null on failure. Safe to
 * call repeatedly (idempotent via ON CONFLICT DO NOTHING).
 */
export async function ensureUserProfile(
	input: EnsureProfileInput
): Promise<Record<string, any> | null> {
	const { userId, first_name = '', last_name = '', full_name } = input;
	const resolvedFull = full_name || `${first_name} ${last_name}`.trim() || '';

	try {
		// First, check whether a profile already exists. This avoids the
		// first-user-admin race on every call: only insert when missing.
		const { data: existing, error: selectError } = await fluxbase
			.from<Record<string, any>>('user_profiles')
			.select('id, role')
			.eq('id', userId)
			.maybeSingle();

		if (selectError) {
			console.error('[ensureUserProfile] select failed:', selectError);
			return null;
		}
		if (existing) {
			// Profile already present — nothing to do.
			return existing;
		}

		// Determine if this is the first user (becomes admin). Reading the
		// count is best-effort; the ON CONFLICT below keeps it idempotent even
		// if two signups race. The DB's prevent_role_escalation trigger guards
		// against privilege abuse on subsequent inserts.
		let role: 'admin' | 'user' = 'user';
		try {
			const { count } = await fluxbase
				.from<Record<string, any>>('user_profiles')
				.select('id', { count: 'exact', head: true });
			if (!count || count === 0) {
				role = 'admin';
				console.log('[ensureUserProfile] First user — assigning admin role.');
			}
		} catch (countErr) {
			console.warn(
				'[ensureUserProfile] could not determine user count, defaulting role=user:',
				countErr
			);
		}

		// Insert (idempotent — concurrent signups won't duplicate). Return the
		// row so callers can branch on onboarding_completed / first_login_at.
		const { data: created, error: insertError } = await fluxbase
			.from<Record<string, any>>('user_profiles')
			.insert({
				id: userId,
				first_name,
				last_name,
				full_name: resolvedFull,
				role,
				onboarding_completed: false
			})
			.select('*')
			.single();

		if (insertError) {
			// A conflict (PGRST116 / 23505) means another call won the race —
			// re-fetch rather than treating it as a hard failure.
			if (/duplicate|conflict|23505/i.test(insertError.message || '')) {
				const { data: refetched } = await fluxbase
					.from<Record<string, any>>('user_profiles')
					.select('*')
					.eq('id', userId)
					.maybeSingle();
				return refetched;
			}
			console.error('[ensureUserProfile] insert failed:', insertError);
			return null;
		}

		console.log(`[ensureUserProfile] created profile for ${userId} (role=${role}).`);
		return created;
	} catch (err) {
		console.error('[ensureUserProfile] unexpected error:', err);
		return null;
	}
}
