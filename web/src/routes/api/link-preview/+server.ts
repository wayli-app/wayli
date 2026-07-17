import type { RequestHandler } from './$types';
import metascraper from 'metascraper';
import msTitle from 'metascraper-title';
import msDescription from 'metascraper-description';
import msImage from 'metascraper-image';
import msLogo from 'metascraper-logo';
import msPublisher from 'metascraper-publisher';

const ms = metascraper([msTitle(), msDescription(), msImage(), msLogo(), msPublisher()]);

async function tryMicrolink(url: string): Promise<Response | null> {
	try {
		const microResp = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!microResp.ok) return null;
		const microData = await microResp.json();
		if (microData.status !== 'success' || !microData.data) return null;

		const d = microData.data;
		return new Response(
			JSON.stringify({
				title: d.title || null,
				description: d.description || null,
				image: d.image?.url || d.logo?.url || null,
				site_name: d.publisher || new URL(url).hostname.replace('www.', ''),
				url,
				rating: null,
				method: 'microlink'
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	let url: string;
	try {
		const body = await request.json();
		url = body.url;
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid request' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!url || !url.startsWith('http')) {
		return new Response(JSON.stringify({ error: 'Invalid URL' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);

		const resp = await fetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml',
				'Accept-Language': 'en-US,en;q=0.9'
			},
			signal: controller.signal,
			redirect: 'follow'
		});
		clearTimeout(timeout);

		if (!resp.ok) {
			const microResult = await tryMicrolink(url);
			if (microResult) return microResult;

			return new Response(
				JSON.stringify({ error: `Fetch failed: ${resp.status}`, method: 'direct-failed' }),
				{ status: 502, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const html = await resp.text();

		// Detect bot challenge pages
		const isChallengePage =
			html.includes('challenge-container') ||
			html.includes('challenge.js') ||
			html.includes('cf-challenge') ||
			(html.includes('<title></title>') && html.length < 5000);

		if (isChallengePage) {
			const microResult = await tryMicrolink(url);
			if (microResult) return microResult;

			const hostname = new URL(url).hostname.replace('www.', '');
			return new Response(
				JSON.stringify({
					title: hostname,
					description: null,
					image: null,
					site_name: hostname,
					url,
					rating: null,
					method: 'hostname-fallback'
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Use metascraper for extraction (95.5% accuracy)
		const metadata = await ms({ url, html });

		const preview = {
			title: metadata.title || null,
			description: metadata.description || null,
			image: metadata.image || null,
			site_name: metadata.publisher || null,
			url,
			rating: null,
			method: 'metascraper'
		};

		return new Response(JSON.stringify(preview), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch {
		const microResult = await tryMicrolink(url);
		if (microResult) return microResult;

		return new Response(JSON.stringify({ error: 'Failed to fetch', method: 'error' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
