/**
 * Snap a GPS track to the road network via Valhalla.
 *
 * Powers the "Snap to roads" view toggle on the Location Data page: the client
 * sends the points currently in view (with their transport modes) and gets
 * back road-matched segments, one per transport-mode run, tagged with the mode
 * so the page can keep its mode-colored rendering. Pure view-layer — nothing
 * is persisted and tracker_data is never touched.
 *
 * Gated per-user by the road-snapping beta opt-in
 * (beta_features.valhalla_routes — account settings); a failed match for a
 * run falls back to that run's raw points so a partial Valhalla outage
 * degrades instead of erroring.
 *
 * Body: { "points": [{ "lat": number, "lng": number, "mode": string|null }] }
 * Response: { "matched": boolean, "segments": [{ "mode", "matched", "points": [{lat,lng}] }] }
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 * @fluxbase:timeout 60
 */

// The '_shared/…' import form resolves against server-side shared modules:
// `fluxbase functions sync` registers every FLAT file in functions/_shared/
// (nested directories are not picked up — that's why these copies live at the
// top level). The geometry + Valhalla client are mirrored copies of the jobs
// modules; keep them in sync with the jobs (and web) copies. The beta check
// below mirrors
// jobs/_shared/services/trip-route/trip-route.service.ts#isUserValhallaRoutesOptedIn.
import {
	costingForRunMode,
	downsampleSegments,
	splitIntoModeRuns
} from '_shared/trip-route-geometry';
import { traceAttributes } from '_shared/valhalla.service';
import type { FluxbaseClient } from '../jobs/types';

/** Per-user road-snapping beta opt-in (beta_features.valhalla_routes). */
async function isUserValhallaRoutesOptedIn(
	fluxbase: FluxbaseClient,
	userId: string
): Promise<boolean> {
	try {
		const { data, error } = await fluxbase
			.from('user_preferences')
			.select('preferences')
			.eq('id', userId)
			.maybeSingle();
		if (error) return false;
		return (data as any)?.preferences?.beta_features?.valhalla_routes === true;
	} catch {
		return false;
	}
}

/** Bounds request size (and Valhalla work) — the UI narrows the range beyond this. */
const MAX_POINTS = 5000;

/** Bounds response size — snapped shapes are denser than the input trace. */
const MAX_RESPONSE_POINTS = 12000;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

async function handler(
	req: Request,
	fluxbase: FluxbaseClient,
	_fluxbaseService: FluxbaseClient,
	_utils?: { getExecutionContext?: () => { user?: { id: string } } }
): Promise<Response> {
	const ctx = _utils?.getExecutionContext?.();
	if (!ctx?.user?.id) return json({ error: 'Unauthorized' }, 401);

	const body = await req.json().catch(() => null);
	const raw = Array.isArray((body as any)?.points) ? (body as any).points : null;
	if (!raw || raw.length < 2) {
		return json({ error: 'points array with at least 2 points required' }, 400);
	}
	if (raw.length > MAX_POINTS) {
		return json(
			{ error: `Too many points (${raw.length}) — narrow the range (max ${MAX_POINTS})` },
			400
		);
	}

	// Normalize + drop malformed points.
	const points: Array<{ lat: number; lng: number; transport_mode: string | null }> = raw
		.map((p: any) => ({
			lat: Number(p?.lat),
			lng: Number(p?.lng),
			transport_mode: (p?.mode as string | null | undefined) ?? null
		}))
		.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	if (points.length < 2) return json({ error: 'No valid points' }, 400);

	if (!(await isUserValhallaRoutesOptedIn(fluxbase, ctx.user.id))) {
		return json({ error: 'Road-snapping beta is not enabled for this account' }, 403);
	}

	const runs = splitIntoModeRuns(points);
	if (runs.length === 0) return json({ matched: false, segments: [] });

	const segments: Array<{ mode: string | null; matched: boolean; points: Array<{ lat: number; lng: number }> }> =
		[];
	let anyMatched = false;

	for (const run of runs) {
		let shape: Array<{ lat: number; lng: number }> = [];
		let matched = false;
		try {
			const result = await traceAttributes(
				run.points.map((p) => ({ lat: p.lat, lon: p.lng })),
				costingForRunMode(run.mode),
				fluxbase
			);
			shape = result.shape.map((s) => ({ lat: s.lat, lng: s.lon }));
			matched = result.matched && shape.length > 1;
		} catch (err) {
			console.warn(
				`[snap-track] Valhalla match failed for a ${run.mode ?? 'unknown'} run, using raw points:`,
				err instanceof Error ? err.message : err
			);
		}
		if (shape.length < 2) {
			shape = run.points.map((p) => ({ lat: p.lat, lng: p.lng }));
		}
		if (matched) anyMatched = true;
		segments.push({ mode: run.mode, matched, points: shape });
	}

	const thinned = downsampleSegments(
		segments.map((s) => s.points),
		MAX_RESPONSE_POINTS
	);
	return json({
		matched: anyMatched,
		segments: segments.map((s, i) => ({ mode: s.mode, matched: s.matched, points: thinned[i] }))
	});
}

export default handler;
