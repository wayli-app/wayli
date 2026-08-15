// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/valhalla-mapping.ts
//
// Maps Valhalla-matched edges to a transport mode. Pure functions — no I/O.
// These are the DEFINITIVE signals: a rail edge IS a train, a cycleway edge IS
// a bicycle. No speed heuristic can beat road-network ground truth.

import type { ValhallaEdge } from '../external/valhalla.service';
import type { TransportMode } from './states';

export interface ValhallaModeVerdict {
	mode: TransportMode;
	confidence: number;
	/** Machine-readable evidence for the detection_reason column. */
	evidence: string;
	/** Dominant street name(s) if available — useful for trip enrichment. */
	names?: string[];
}

/** Use types that indicate human-powered (non-motorized) movement. */
const WALKING_USES = new Set(['footway', 'steps', 'path', 'pedestrian_crossing', 'elevator']);
const CYCLING_USES = new Set(['cycleway', 'mountain_bike_path']);
/** Road classes that clearly indicate motorized traffic. */
const HIGH_SPEED_CLASSES = new Set(['motorway', 'trunk']);

/**
 * Determine the transport mode from the matched edges.
 *
 * The verdict is by weighted majority of edge length (longer edges count more —
 * a 10km motorway stretch outweighs a 50m driveway). Returns null when the
 * evidence is inconclusive (mixed usage, no dominant class) — the caller keeps
 * the Stage-1 HMM result in that case.
 *
 * Rules (checked in order of certainty):
 * 1. rail: true on the majority of edge length → train (definitive)
 * 2. walking-use majority → walking
 * 3. cycling-use majority → cycling
 * 4. high-speed road class + speed > 60 km/h majority → car
 * 5. otherwise → null (inconclusive, keep Stage-1)
 */
export function modeFromEdges(edges: ValhallaEdge[]): ValhallaModeVerdict | null {
	if (edges.length === 0) return null;

	// Weight by edge length (km); fall back to 1.0 when length is missing so
	// every edge counts equally.
	const weightOf = (e: ValhallaEdge): number => (typeof e.length === 'number' && e.length > 0 ? e.length : 1);
	const totalWeight = edges.reduce((sum, e) => sum + weightOf(e), 0);

	const weightedCount = (predicate: (e: ValhallaEdge) => boolean): number =>
		edges.reduce((sum, e) => (predicate(e) ? sum + weightOf(e) : sum), 0);

	// 1. Rail — definitive.
	const railWeight = weightedCount((e) => e.rail === true);
	if (railWeight / totalWeight > 0.5) {
		return {
			mode: 'train',
			confidence: 0.95,
			evidence: 'valhalla_rail_edge',
			names: dominantNames(edges, (e) => e.rail === true)
		};
	}

	// 2. Walking uses.
	const walkWeight = weightedCount((e) => WALKING_USES.has(e.use));
	if (walkWeight / totalWeight > 0.5) {
		return {
			mode: 'walking',
			confidence: 0.9,
			evidence: 'valhalla_footway_edge',
			names: dominantNames(edges, (e) => WALKING_USES.has(e.use))
		};
	}

	// 3. Cycling uses.
	const cycleWeight = weightedCount((e) => CYCLING_USES.has(e.use));
	if (cycleWeight / totalWeight > 0.5) {
		return {
			mode: 'cycling',
			confidence: 0.9,
			evidence: 'valhalla_cycleway_edge',
			names: dominantNames(edges, (e) => CYCLING_USES.has(e.use))
		};
	}

	// 4. High-speed motorized roads.
	const highSpeedWeight = weightedCount(
		(e) => HIGH_SPEED_CLASSES.has(e.road_class) && (e.speed ?? 0) > 60
	);
	if (highSpeedWeight / totalWeight > 0.5) {
		return {
			mode: 'car',
			confidence: 0.9,
			evidence: 'valhalla_motorway_edge',
			names: dominantNames(edges, (e) => HIGH_SPEED_CLASSES.has(e.road_class))
		};
	}

	// 5. Inconclusive — caller keeps the Stage-1 result.
	return null;
}

/**
 * Sum of matched edge lengths in meters (edge.length is in km).
 * More accurate than haversine sums over noisy GPS points.
 */
export function matchedDistanceMeters(edges: ValhallaEdge[]): number {
	return edges.reduce((sum, e) => sum + (typeof e.length === 'number' ? e.length * 1000 : 0), 0);
}

/** Collect the most frequent non-empty names from edges matching the predicate. */
function dominantNames(edges: ValhallaEdge[], predicate: (e: ValhallaEdge) => boolean): string[] | undefined {
	const counts = new Map<string, number>();
	for (const e of edges) {
		if (!predicate(e)) continue;
		for (const n of e.names ?? []) {
			if (n) counts.set(n, (counts.get(n) ?? 0) + weightOfSafe(e));
		}
	}
	const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
	return sorted.length > 0 ? sorted.slice(0, 2).map(([n]) => n) : undefined;
}

function weightOfSafe(e: ValhallaEdge): number {
	return typeof e.length === 'number' && e.length > 0 ? e.length : 1;
}
