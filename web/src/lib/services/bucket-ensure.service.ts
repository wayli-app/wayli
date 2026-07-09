/**
 * Ensures required storage buckets exist.
 * Uses the Fluxbase admin API (which creates both the DB row AND the directory).
 * Idempotent — safe to call on every load; silently ignores if already exists.
 */

import { fluxbase } from '$lib/fluxbase';

const REQUIRED_BUCKETS = [
	{ name: 'trip-images', public: true },
	{ name: 'temp-files', public: false }
];

export async function ensureStorageBuckets(): Promise<void> {
	let existing: string[] = [];

	try {
		const { data, error } = await fluxbase.admin.storage.listBuckets();
		if (!error && data) {
			existing = (data as unknown as any[]).map((b) => b.name || b.id);
		}
	} catch {
		// Can't list — try to create anyway (idempotent on the server side)
	}

	for (const bucket of REQUIRED_BUCKETS) {
		if (existing.includes(bucket.name)) continue;

		try {
			const { error } = await fluxbase.admin.storage.createBucket(bucket.name);
			if (!error) {
				console.log(`[buckets] Created bucket: ${bucket.name}`);
			}
		} catch {
			// Already exists or no permission — silently skip
		}
	}
}
