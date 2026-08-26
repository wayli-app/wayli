/**
 * Fitness beta opt-in store.
 *
 * The fitness feature (FIT import + analysis dashboard) is an opt-in beta. The
 * flag lives in `user_preferences.preferences.beta_features.fitness` and is
 * read once per session; gated UI (nav entry, FIT import support, location-data
 * cross-references) subscribes to this store.
 */

import { fluxbase } from '$lib/fluxbase';

const fitnessBetaState = $state<{ enabled: boolean; loaded: boolean }>({
	enabled: false,
	loaded: false
});

let loadPromise: Promise<void> | null = null;

export function isFitnessBetaEnabled(): boolean {
	return fitnessBetaState.enabled;
}

export function isFitnessBetaLoaded(): boolean {
	return fitnessBetaState.loaded;
}

/**
 * Load the opt-in flag once per session. Idempotent — concurrent callers
 * share the same request.
 */
export async function loadFitnessBeta(): Promise<void> {
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

			fitnessBetaState.enabled = prefs?.preferences?.beta_features?.fitness === true;
		} catch (error) {
			console.warn('[FitnessBeta] Failed to load opt-in flag:', error);
		} finally {
			fitnessBetaState.loaded = true;
		}
	})();

	return loadPromise;
}

/**
 * Persist the opt-in flag and update the store. Read-modify-writes the
 * preferences jsonb; creates the preferences row when the user has none yet
 * (an UPDATE alone would silently affect 0 rows and lose the toggle).
 */
export async function setFitnessBeta(enabled: boolean): Promise<void> {
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
	const preferences = {
		...current,
		beta_features: { ...(current.beta_features ?? {}), fitness: enabled }
	};

	if (prefs) {
		const { error } = await fluxbase
			.from<Record<string, any>>('user_preferences')
			.update({ preferences, updated_at: new Date().toISOString() })
			.eq('id', userId);
		if (error) {
			throw new Error(error.message || 'Failed to update fitness beta opt-in');
		}
	} else {
		const { error } = await fluxbase
			.from<Record<string, any>>('user_preferences')
			.insert({ id: userId, preferences });
		if (error) {
			// Lost a race with another tab creating the row — update instead.
			const { error: updateError } = await fluxbase
				.from<Record<string, any>>('user_preferences')
				.update({ preferences, updated_at: new Date().toISOString() })
				.eq('id', userId);
			if (updateError) {
				throw new Error(updateError.message || 'Failed to update fitness beta opt-in');
			}
		}
	}

	fitnessBetaState.enabled = enabled;
}
