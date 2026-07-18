/**
 * Discover places via Pelias geocoder.
 *
 * Used by the AI supervisor's Action agent to answer "where can I find X near Y"
 * questions. The supervisor's SQL agent can't make HTTP calls, so this function
 * wraps the Pelias search/nearby endpoints and returns JSON.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 * @fluxbase:timeout 15
 */

import type { FluxbaseClient } from '../jobs/types';

declare const secrets: {
	get(key: string): string | undefined;
	getRequired(key: string): string;
	getUser(key: string): string | undefined;
	getSystem(key: string): string | undefined;
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

async function getPeliasEndpoint(fluxbase: FluxbaseClient): Promise<string> {
	try {
		const { data, error } = await fluxbase
			.from('app.settings')
			.select('value')
			.eq('key', 'wayli.pelias_endpoint')
			.single();
		if (!error && data) {
			const v = (data as any).value;
			if (typeof v === 'string') return v.replace(/\/+$/, '');
			if (v && typeof v === 'object' && 'value' in v && typeof v.value === 'string') {
				return v.value.replace(/\/+$/, '');
			}
		}
	} catch {
		/* fall through */
	}
	return 'https://pelias.wayli.app';
}

interface PeliasFeature {
	type: 'Feature';
	geometry: { type: 'Point'; coordinates: [number, number] };
	properties: {
		name?: string;
		label?: string;
		layer?: string;
		country?: string;
		region?: string;
		county?: string;
		locality?: string;
		neighbourhood?: string;
		category?: string[];
		distance?: number;
		gid?: string;
	};
}

interface PeliasResponse {
	features: PeliasFeature[];
}

function mapFeature(f: PeliasFeature) {
	const p = f.properties || {};
	const [lng, lat] = f.geometry?.coordinates ?? [null, null];
	return {
		name: p.name || p.label,
		layer: p.layer,
		country: p.country,
		region: p.region,
		city: p.locality,
		neighbourhood: p.neighbourhood,
		categories: p.category ?? [],
		latitude: lat,
		longitude: lng,
		distance_km: p.distance,
		gid: p.gid
	};
}

async function handler(
	req: Request,
	fluxbase: FluxbaseClient,
	_fluxbaseService: FluxbaseClient,
	_utils?: { getExecutionContext?: () => { user?: { id: string } } }
): Promise<Response> {
	const ctx = _utils?.getExecutionContext?.();
	if (!ctx?.user?.id) return json({ error: 'Unauthorized' }, 401);

	const url = new URL(req.url);
	const params = req.method === 'POST' ? await req.json().catch(() => ({})) : Object.fromEntries(url.searchParams);

	const query = (params.query ?? params.text ?? params.q)?.toString().trim();
	if (!query) {
		return json({ error: 'query (or text) parameter required' }, 400);
	}

	const endpoint = await getPeliasEndpoint(fluxbase);
	const size = Math.min(Math.max(parseInt(params.size ?? params.limit ?? '10', 10) || 10, 1), 40);

	// Build Pelias URL. If lat/lng provided, use /nearby; otherwise /search.
	const peliasUrl = new URL(endpoint);
	if (params.lat != null && params.lng != null) {
		peliasUrl.pathname = '/v1/nearby';
		peliasUrl.searchParams.set('point', `${params.lat},${params.lng}`);
	} else {
		peliasUrl.pathname = '/v1/search';
	}
	peliasUrl.searchParams.set('text', query);
	peliasUrl.searchParams.set('size', String(size));

	try {
		const resp = await fetch(peliasUrl.toString(), {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(10_000)
		});
		if (!resp.ok) {
			return json({ error: `Pelias returned ${resp.status}` }, 502);
		}
		const data = (await resp.json()) as PeliasResponse;
		return json({
			count: data.features?.length ?? 0,
			places: (data.features ?? []).map(mapFeature)
		});
	} catch (err: any) {
		return json({ error: `Pelias fetch failed: ${err?.message ?? err}` }, 502);
	}
}

export default handler;
