/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE_NAME = `repeat-${version}`;
const APP_SHELL = '/';
const ASSETS = [...build, ...files, ...prerendered];
const CORE_ASSETS = Array.from(new Set([APP_SHELL, ...ASSETS]));

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset)));
		})
	);
	worker.skipWaiting();
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) =>
				Promise.all(
					cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
				)
			)
	);
	worker.clients.claim();
});

worker.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') {
		return;
	}

	const url = new URL(event.request.url);
	if (url.origin !== worker.location.origin) {
		return;
	}

	if (event.request.mode === 'navigate') {
		event.respondWith(
			caches.match(APP_SHELL).then((cachedShell) => {
				const refreshedShell = fetch(event.request)
					.then(async (response) => {
						if (response.ok) {
							const cache = await caches.open(CACHE_NAME);
							await cache.put(APP_SHELL, response.clone());
						}
						return response;
					})
					.catch(() => null);

				event.waitUntil(refreshedShell);
				return cachedShell ?? refreshedShell.then((response) => response ?? Response.error());
			})
		);
		return;
	}

	if (ASSETS.includes(url.pathname)) {
		event.respondWith(
			caches.match(event.request).then((cachedAsset) => {
				const refreshedAsset = fetch(event.request)
					.then(async (response) => {
						if (response.ok) {
							const cache = await caches.open(CACHE_NAME);
							await cache.put(event.request, response.clone());
						}
						return response;
					})
					.catch(() => null);

				event.waitUntil(refreshedAsset);
				return cachedAsset ?? refreshedAsset.then((response) => response ?? Response.error());
			})
		);
	}
});
