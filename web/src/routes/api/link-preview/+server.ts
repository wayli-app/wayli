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
			headers: { 'User-Agent': 'Wayli/1.0 (Link Preview Bot)', Accept: 'text/html' },
			signal: controller.signal,
			redirect: 'follow'
		});
		clearTimeout(timeout);

		if (!resp.ok) {
			return new Response(JSON.stringify({ error: `Fetch failed: ${resp.status}` }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const html = await resp.text();
		const headEnd = html.indexOf('</head>');
		const head = headEnd > 0 ? html.substring(0, headEnd) : html.substring(0, 10000);

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
		return new Response(JSON.stringify({ error: 'Failed to fetch' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
