/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Wayli service worker — caches the app shell for offline use.
// GPS data and API calls always go to the network (no stale location data).

/* eslint-disable @typescript-eslint/no-explicit-any */
const CACHE_NAME = 'wayli-shell-v1';
const SHELL_ASSETS = ['/', '/manifest.webmanifest'];

const sw = self as any;

sw.addEventListener('install', (event: any) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
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

	// Never cache API calls, auth, or realtime connections
	if (
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/rest/') ||
		url.pathname.startsWith('/realtime/') ||
		url.hostname !== location.hostname
	) {
		return;
	}

	// Network-first for navigation requests
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const copy = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
					return response;
				})
				.catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
		);
		return;
	}

	// Cache-first for static assets
	if (
		request.destination === 'style' ||
		request.destination === 'script' ||
		request.destination === 'image' ||
		request.destination === 'font'
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
});
