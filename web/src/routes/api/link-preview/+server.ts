import type { RequestHandler } from './$types';

function extractMeta(html: string, property: string): string | null {
	let match = html.match(
		new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
	);
	if (match) return match[1].trim();
	match = html.match(
		new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i')
	);
	if (match) return match[1].trim();
	return null;
}

function extractRating(html: string): string | null {
	const jsonLdMatch = html.match(
		/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
	);
	if (jsonLdMatch) {
		try {
			const data = JSON.parse(jsonLdMatch[1].trim());
			const rating = data.aggregateRating?.ratingValue || data.rating?.ratingValue;
			if (rating) return String(rating);
		} catch {}
	}
	return extractMeta(html, 'rating:value') || extractMeta(html, 'rating');
}

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
				rating: null
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
			// Try microlink fallback
			const microResult = await tryMicrolink(url);
			if (microResult) return microResult;

			return new Response(JSON.stringify({ error: `Fetch failed: ${resp.status}` }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const html = await resp.text();
		const headEnd = html.indexOf('</head>');
		const head = headEnd > 0 ? html.substring(0, headEnd) : html.substring(0, 10000);

		// Detect bot challenge pages (booking.com, Cloudflare-protected sites)
		const isChallengePage =
			html.includes('challenge-container') ||
			html.includes('challenge.js') ||
			html.includes('cf-challenge') ||
			(html.includes('<title></title>') && !extractMeta(head, 'og:title'));

		if (isChallengePage) {
			// Try microlink (runs headless browser, can bypass challenges)
			const microResult = await tryMicrolink(url);
			if (microResult) return microResult;

			// Final fallback: hostname only
			const hostname = new URL(url).hostname.replace('www.', '');
			return new Response(
				JSON.stringify({
					title: hostname,
					description: null,
					image: null,
					site_name: hostname,
					url,
					rating: null
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			);
		}

		const title =
			extractMeta(head, 'og:title') ||
			extractMeta(head, 'twitter:title') ||
			(head.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);

		const preview = {
			title,
			description:
				extractMeta(head, 'og:description') ||
				extractMeta(head, 'twitter:description') ||
				extractMeta(head, 'description'),
			image: extractMeta(head, 'og:image') || extractMeta(head, 'twitter:image'),
			site_name: extractMeta(head, 'og:site_name'),
			url,
			rating: extractRating(html)
		};

		return new Response(JSON.stringify(preview), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch {
		// Last resort: try microlink
		const microResult = await tryMicrolink(url);
		if (microResult) return microResult;

		return new Response(JSON.stringify({ error: 'Failed to fetch' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
