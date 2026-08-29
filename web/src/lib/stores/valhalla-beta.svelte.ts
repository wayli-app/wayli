/**
 * Valhalla road-snapping beta opt-in store.
 *
 * Road-snapped routes (Valhalla-matched trip tracks + the "Snap to roads"
 * view on the Location Data page) is an opt-in beta. The flag lives in
 * `user_preferences.preferences.beta_features.valhalla_routes` and is read
 * once per session; gated UI (the snap toggle, trip-map snapped rendering)
 * and the server-side jobs/function all key off it.
 */

import { fluxbase } from '$lib/fluxbase';

const valhallaBetaState = $state<{ enabled: boolean; loaded: boolean }>({
	enabled: false,
	loaded: false
});

let loadPromise: Promise<void> | null = null;

export function isValhallaBetaEnabled(): boolean {
	return valhallaBetaState.enabled;
}

export function isValhallaBetaLoaded(): boolean {
	return valhallaBetaState.loaded;
}

/**
 * Load the opt-in flag once per session. Idempotent — concurrent callers
 * share the same request.
 */
export async function loadValhallaBeta(): Promise<void> {
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

			valhallaBetaState.enabled = prefs?.preferences?.beta_features?.valhalla_routes === true;
		} catch (error) {
			console.warn('[ValhallaBeta] Failed to load opt-in flag:', error);
		} finally {
			valhallaBetaState.loaded = true;
		}
	})();

	return loadPromise;
}

/**
 * Persist the opt-in flag and update the store. Read-modify-writes the
 * preferences jsonb; creates the preferences row when the user has none yet
 * (an UPDATE alone would silently affect 0 rows and lose the toggle).
 */
export async function setValhallaBeta(enabled: boolean): Promise<void> {
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
		beta_features: { ...(current.beta_features ?? {}), valhalla_routes: enabled }
	};

	if (prefs) {
		const { error } = await fluxbase
			.from<Record<string, any>>('user_preferences')
			.update({ preferences, updated_at: new Date().toISOString() })
			.eq('id', userId);
		if (error) {
			throw new Error(error.message || 'Failed to update road-snapping beta opt-in');
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
				throw new Error(updateError.message || 'Failed to update road-snapping beta opt-in');
			}
		}
	}

	valhallaBetaState.enabled = enabled;
}
