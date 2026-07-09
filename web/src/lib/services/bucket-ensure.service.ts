/**
 * Ensures required storage buckets exist.
 * Uses the Fluxbase admin API (POST /api/v1/storage/buckets/{name}).
 * Idempotent — safe to call on every load; silently ignores if already exists.
 */

import { fluxbase } from '$lib/fluxbase';

const REQUIRED_BUCKETS = ['trip-images', 'temp-files'];

export async function ensureStorageBuckets(): Promise<void> {
	for (const name of REQUIRED_BUCKETS) {
		try {
			const { error } = await fluxbase.admin.storage.createBucket(name);
			if (error) {
				// Already exists or no permission — both are fine
				continue;
			}
			console.log(`[buckets] Created bucket: ${name}`);
		} catch {
			// Already exists, no permission, or admin API unavailable
		}
	}
}
