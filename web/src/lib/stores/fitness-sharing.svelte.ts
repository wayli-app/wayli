/**
 * Fitness sharing settings store — the global default audience for
 * activities and the privacy-zone radius.
 *
 * Lives at `user_preferences.preferences.fitness_sharing`
 * (`{ default: 'private'|'friends'|'public', privacy_radius_m: number }`);
 * per-activity overrides (NULL = inherit) resolve server-side via
 * effective_activity_visibility(). The radius is applied by the
 * get-public-activity-track / get-public-trip-track RPCs, which drop tracker
 * points within that distance of the user's home address and trip-exclusion
 * zones before serving them to any viewer.
 */

import { fluxbase } from '$lib/fluxbase';

export type FitnessAudience = 'private' | 'friends' | 'public';

export interface FitnessSharingSettings {
	default: FitnessAudience;
	privacy_radius_m: number;
}

const DEFAULTS: FitnessSharingSettings = { default: 'private', privacy_radius_m: 250 };

const state = $state<{ settings: FitnessSharingSettings; loaded: boolean }>({
	settings: { ...DEFAULTS },
	loaded: false
});

let loadPromise: Promise<void> | null = null;

export function fitnessSharing(): FitnessSharingSettings {
	return state.settings;
}

export function fitnessSharingLoaded(): boolean {
	return state.loaded;
}

/**
 * Load the settings once per session. Idempotent — concurrent callers share
 * the same request.
 */
export async function loadFitnessSharing(): Promise<void> {
	if (loadPromise) return loadPromise;

	loadPromise = (async () => {
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			if (!userData?.user) return;

			const { data: prefs } = await fluxbase
				.from<Record<string, any>>('user_preferences')
				.select('preferences')
				.eq('id', userData.user.id)
				.maybeSingle();

			const raw = prefs?.preferences?.fitness_sharing ?? {};
			state.settings = {
				default: raw.default === 'friends' || raw.default === 'public' ? raw.default : 'private',
				privacy_radius_m:
					typeof raw.privacy_radius_m === 'number' &&
					raw.privacy_radius_m >= 50 &&
					raw.privacy_radius_m <= 2000
						? Math.round(raw.privacy_radius_m)
						: DEFAULTS.privacy_radius_m
			};
		} catch (error) {
			console.warn('[FitnessSharing] Failed to load settings:', error);
		} finally {
			state.loaded = true;
		}
	})();

	return loadPromise;
}

/**
 * Persist a change (read-modify-writes the preferences jsonb, preserving
 * every other key) and update the store.
 */
export async function saveFitnessSharing(update: Partial<FitnessSharingSettings>): Promise<void> {
	const { data: userData } = await fluxbase.auth.getUser();
	if (!userData?.user) {
		throw new Error('User not authenticated');
	}
	const userId = userData.user.id;

	const { data: prefs } = await fluxbase
		.from<Record<string, any>>('user_preferences')
		.select('preferences')
		.eq('id', userId)
		.maybeSingle();

	const current = (prefs?.preferences ?? {}) as Record<string, any>;
	const merged: FitnessSharingSettings = { ...state.settings, ...update };
	const preferences = {
		...current,
		fitness_sharing: { ...current.fitness_sharing, ...update }
	};

	const { error } = await fluxbase
		.from<Record<string, any>>('user_preferences')
		.update({ preferences, updated_at: new Date().toISOString() })
		.eq('id', userId);
	if (error) {
		throw new Error(error.message || 'Failed to save fitness sharing settings');
	}

	state.settings = merged;
}

/**
 * The current user's username (from user_profiles), used to build public
 * share links of the shape /u/{username}/fitness/{id}.
 */
export async function currentUsername(): Promise<string | null> {
	const { data: userData } = await fluxbase.auth.getUser();
	if (!userData?.user) return null;
	const { data: profile } = await fluxbase
		.from<Record<string, any>>('user_profiles')
		.select('username')
		.eq('id', userData.user.id)
		.maybeSingle();
	return profile?.username ?? null;
}

/**
 * Set (or clear, when null) a single activity's audience override.
 * null = follow the global default.
 */
export async function setActivityVisibility(
	activityId: string,
	visibility: FitnessAudience | null
): Promise<void> {
	const { error } = await fluxbase
		.from<Record<string, any>>('fitness_activities')
		.update({ visibility })
		.eq('id', activityId);
	if (error) {
		throw new Error(error.message || 'Failed to update activity sharing');
	}
}
