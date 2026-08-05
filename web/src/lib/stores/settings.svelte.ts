/**
 * Central settings store.
 *
 * Fetches all `wayli.*` settings in a single bulk request (the Fluxbase batch
 * endpoint supports a `prefix` filter that returns every visible key under a
 * namespace at once, RLS-filtered) and caches them for the lifetime of the
 * page. This replaces the ad-hoc `fluxbase.settings.get('wayli.x')` calls that
 * each fired their own request — and 404'd when the key was unset.
 *
 * Visibility is enforced server-side by RLS: anonymous callers only receive
 * `is_public` rows; authenticated callers receive non-secret rows. The store
 * simply surfaces whatever the server returned, so it never leaks settings the
 * caller isn't allowed to see.
 *
 * `loadPublicSettings()` is idempotent and safe to call from multiple places
 * (e.g. the root layout fires it once on mount); the first call wins and later
 * callers await the same promise.
 */

import { fluxbase } from '$lib/fluxbase';
import { browser } from '$app/environment';

// The namespace this app reads. All Wayli settings live under `wayli.*`.
const SETTING_PREFIX = 'wayli.';

// Keys that genuinely should be readable by anonymous (logged-out) visitors.
// The server must have these marked `is_public = true` for anon to receive
// them; see the admin settings page write path.
const PUBLIC_KEYS = [
	'wayli.community_enabled',
	'wayli.landing_redirect_username',
	'wayli.is_setup_complete',
	'wayli.public_trips_require_auth'
];

// Reactive cache. `null` = not loaded yet; `Record<string, unknown>` once
// populated (possibly empty if the caller can't see any keys). `loading` tracks
// the in-flight fetch so concurrent callers share one request.
const settingsState = $state<{
	values: Record<string, unknown> | null;
	loading: boolean;
}>({
	values: null,
	loading: false
});

let loadPromise: Promise<void> | null = null;

/**
 * Fetch all visible `wayli.*` settings once and cache them.
 *
 * Prefers the namespace `prefix` fetch (one request, no key list needed,
 * silently drops keys the caller can't read). Falls back to an explicit
 * `PUBLIC_KEYS` list when the installed SDK predates the `prefix` option, so
 * the store works before the Fluxbase SDK is bumped too.
 */
export async function loadPublicSettings(force = false): Promise<void> {
	if (!browser) return;

	// Already loaded (and not forced) — nothing to do.
	if (!force && settingsState.values !== null) return;
	// Already in flight — piggyback on the existing request.
	if (loadPromise && !force) return loadPromise;

	settingsState.loading = true;
	loadPromise = (async () => {
		try {
			// Try the prefix fetch first. `getMany` accepts (keys, options).
			const getMany = fluxbase.settings.getMany as any;
			const result =
				typeof getMany === 'function'
					? await getMany.call(fluxbase.settings, [], { prefix: SETTING_PREFIX })
					: {};
			settingsState.values = result ?? {};
		} catch {
			// Fallback: explicit key list (older SDK without prefix support, or
			// a server that hasn't been upgraded). Inaccessible/unset keys are
			// omitted by the batch endpoint — no 404s.
			try {
				const getMany = fluxbase.settings.getMany as any;
				const result =
					typeof getMany === 'function'
						? await getMany.call(fluxbase.settings, PUBLIC_KEYS)
						: {};
				settingsState.values = result ?? {};
			} catch {
				// Network/auth error — cache an empty map so callers get
				// fallbacks rather than re-fetching on every read.
				settingsState.values = {};
			}
		} finally {
			settingsState.loading = false;
		}
	})();

	return loadPromise;
}

/**
 * Read a cached setting value. Returns `fallback` when the key is absent
 * (unset, or not visible to this caller). Call `loadPublicSettings()` first
 * (the root layout does this on mount).
 */
export function getSetting<T = unknown>(key: string, fallback: T): T {
	const v = settingsState.values?.[key];
	return v === undefined ? fallback : (v as T);
}

/** True once the initial bulk fetch has completed (success or failure). */
export function settingsReady(): boolean {
	return settingsState.values !== null;
}

/** Reactive access to the whole settings map (for `$derived` consumers). */
export function allSettings(): Record<string, unknown> | null {
	return settingsState.values;
}
