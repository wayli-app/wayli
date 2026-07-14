/**
 * Ensures required storage buckets exist.
 * Caches result so it only runs once per session.
 * Also exported as lazyBucketEnsure for upload error recovery.
 */

import { fluxbase } from '$lib/fluxbase';

const REQUIRED_BUCKETS = ['trip-images', 'temp-files'];
let ensured = false;

export async function ensureStorageBuckets(): Promise<void> {
	if (ensured) return;

	for (const name of REQUIRED_BUCKETS) {
		try {
			// Check if bucket exists first
			const { data } = await fluxbase.storage.listBuckets();
			if (data?.some((b: any) => b.id === name || b.name === name)) continue;

			const { error } = await fluxbase.admin.storage.createBucket(name);
			if (!error) {
				console.log(`[buckets] Created bucket: ${name}`);
			}
		} catch {
			// Already exists, no permission, or admin API unavailable
		}
	}

	ensured = true;
}

/**
 * Call this when an upload fails — resets cache and retries bucket creation.
 */
export async function lazyBucketEnsure(): Promise<void> {
	ensured = false;
	await ensureStorageBuckets();
}
