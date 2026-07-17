import { fluxbase } from '$lib/fluxbase';

export type LinkPreview = {
	title: string | null;
	description: string | null;
	image: string | null;
	site_name: string | null;
	url: string;
	rating: string | null;
};

let cache = new Map<string, { data: LinkPreview | null; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
	if (!url || !url.startsWith('http')) return null;

	const cached = cache.get(url);
	if (cached && Date.now() - cached.ts < CACHE_TTL) {
		return cached.data;
	}

	try {
		const resp = await fetch('/api/link-preview', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url })
		});

		if (!resp.ok) {
			cache.set(url, { data: null, ts: Date.now() });
			return null;
		}

		const data = (await resp.json()) as LinkPreview;
		cache.set(url, { data, ts: Date.now() });
		return data;
	} catch {
		cache.set(url, { data: null, ts: Date.now() });
		return null;
	}
}
