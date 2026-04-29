/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE_NAME = `blank-${version}`;
const APP_SHELL = '/';
const ASSETS = [...build, ...files, ...prerendered];

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(ASSETS);
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
			fetch(event.request).catch(async () => (await caches.match(APP_SHELL)) ?? Response.error())
		);
		return;
	}

	if (ASSETS.includes(url.pathname)) {
		event.respondWith(
			caches.match(event.request).then((response) => response ?? fetch(event.request))
		);
	}
});
