/**
 * Road snapping for the Location Data page ("Snap to roads" toggle).
 *
 * Thin client for the `snap-track` Fluxbase function: sends the points
 * currently in view and gets back road-matched segments per transport-mode
 * run. Pure view layer — nothing is persisted, and results are cached
 * in-memory per view key (range + newest point) so re-toggling is instant and
 * freshly loaded data naturally invalidates the cache.
 */

import { fluxbase } from '$lib/fluxbase';

export interface RoadSnapPoint {
	lat: number;
	lng: number;
	mode: string | null;
}

export interface RoadSnapSegment {
	mode: string | null;
	matched: boolean;
	points: Array<{ lat: number; lng: number }>;
}

export interface RoadSnapResult {
	matched: boolean;
	segments: RoadSnapSegment[];
}

/** Small LRU-ish cache — the page computes the key from its current view. */
const cache = new Map<string, RoadSnapResult>();
const CACHE_LIMIT = 20;

export async function snapTrack(
	points: RoadSnapPoint[],
	cacheKey: string
): Promise<RoadSnapResult> {
	const hit = cache.get(cacheKey);
	if (hit) return hit;

	const { data, error } = await fluxbase.functions.invoke('snap-track', {
		method: 'POST',
		body: { points },
		namespace: 'wayli'
	});
	if (error) throw new Error(error.message || 'Road matching failed');

	// Functions may wrap the payload ({ success, data }) — unwrap defensively.
	const result = ((data as any)?.data ?? data) as RoadSnapResult;
	if (!result || !Array.isArray(result.segments)) {
		throw new Error('Unexpected road-matching response');
	}

	if (cache.size >= CACHE_LIMIT) {
		cache.delete(cache.keys().next().value as string);
	}
	cache.set(cacheKey, result);
	return result;
}
