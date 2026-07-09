/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Wayli service worker — caches static assets only.
// Navigation requests and API calls always go to the network (no stale content).

/* eslint-disable @typescript-eslint/no-explicit-any */
const CACHE_NAME = 'wayli-assets-v2';

const sw = self as any;

sw.addEventListener('install', (event: any) => {
	sw.skipWaiting();
});

sw.addEventListener('activate', (event: any) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
			)
	);
	sw.clients.claim();
});

sw.addEventListener('fetch', (event: any) => {
	const { request } = event;

	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Never intercept: API calls, auth, realtime, or cross-origin
	if (
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/rest/') ||
		url.pathname.startsWith('/realtime/') ||
		url.hostname !== location.hostname
	) {
		return;
	}

	// Cache-first ONLY for static assets (JS, CSS, fonts, images from /static/)
	// These have hashed filenames from Vite so they're safe to cache long-term.
	if (
		(request.destination === 'style' ||
			request.destination === 'script' ||
			request.destination === 'font') &&
		url.pathname.startsWith('/_app/') // Vite's hashed assets
	) {
		event.respondWith(
			caches.match(request).then(
				(cached) =>
					cached ||
					fetch(request).then((response) => {
						const copy = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
						return response;
					})
			)
		);
	}

	// Everything else (navigation, images, manifest) goes straight to network.
	// No caching of HTML pages — always fresh content.
});
