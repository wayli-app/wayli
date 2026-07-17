/**
 * Link Preview Edge Function
 * Fetches Open Graph / Twitter Card metadata from a URL.
 * Returns: { title, description, image, site_name, url, rating? }
 *
 * @fluxbase:method GET
 * @fluxbase:timeout 10
 */

interface LinkPreviewRequest {
	url: string;
}

interface LinkPreview {
	title: string | null;
	description: string | null;
	image: string | null;
	site_name: string | null;
	url: string;
	rating: string | null;
}

function extractMeta(html: string, property: string): string | null {
	// Try og: property
	let match = html.match(
		new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
	);
	if (match) return match[1].trim();

	// Try reversed order (content before property)
	match = html.match(
		new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i')
	);
	if (match) return match[1].trim();

	return null;
}

function extractRating(html: string): string | null {
	// Try JSON-LD structured data
	const jsonLdMatch = html.match(
		/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
	);
	if (jsonLdMatch) {
		try {
			const data = JSON.parse(jsonLdMatch[1].trim());
			const rating = data.aggregateRating?.ratingValue || data.rating?.ratingValue;
			if (rating) return String(rating);
		} catch {
			// Invalid JSON
		}
	}

	// Try meta rating
	const metaRating = extractMeta(html, 'rating:value') || extractMeta(html, 'rating');
	return metaRating;
}

export async function handler(req: Request): Promise<Response> {
	let body: LinkPreviewRequest;
	try {
		body = await req.json();
	} catch {
		const url = new URL(req.url);
		const urlParam = url.searchParams.get('url');
		if (!urlParam) {
			return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		body = { url: urlParam };
	}

	const targetUrl = body.url;
	if (!targetUrl || !targetUrl.startsWith('http')) {
		return new Response(JSON.stringify({ error: 'Invalid URL' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);

		const resp = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'Wayli/1.0 (Link Preview Bot)',
				Accept: 'text/html'
			},
			signal: controller.signal,
			redirect: 'follow'
		});

		clearTimeout(timeout);

		if (!resp.ok) {
			return new Response(
				JSON.stringify({ error: `Failed to fetch: ${resp.status}` }),
				{ status: 502, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const html = await resp.text();

		// Extract only <head> for performance
		const headEnd = html.indexOf('</head>');
		const head = headEnd > 0 ? html.substring(0, headEnd) : html.substring(0, 10000);

		const preview: LinkPreview = {
			title: extractMeta(head, 'og:title') || extractMeta(head, 'twitter:title'),
			description:
				extractMeta(head, 'og:description') ||
				extractMeta(head, 'twitter:description') ||
				extractMeta(head, 'description'),
			image:
				extractMeta(head, 'og:image') ||
				extractMeta(head, 'twitter:image'),
			site_name: extractMeta(head, 'og:site_name'),
			url: targetUrl,
			rating: extractRating(html)
		};

		// Fallback: extract <title> tag if no og:title
		if (!preview.title) {
			const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
			if (titleMatch) preview.title = titleMatch[1].trim();
		}

		return new Response(JSON.stringify(preview), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return new Response(
			JSON.stringify({ error: 'Failed to fetch URL metadata' }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);
	}
}
