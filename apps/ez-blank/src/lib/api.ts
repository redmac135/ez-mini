import { PUBLIC_EZ_API_URL } from '$env/static/public';
import { configureAuth, createApiError } from '@ez/auth';
import type { PagesApi } from '$lib/editor/sync';

const apiUrl = PUBLIC_EZ_API_URL.trim();
const API_FETCH_TIMEOUT_MS = 8000;

if (!apiUrl) {
	throw new Error('PUBLIC_EZ_API_URL is required.');
}

export const auth = configureAuth({ apiUrl, fetch: fetchWithTimeout });

export const pagesApi: PagesApi = {
	async listPages(options = {}) {
		const params = new URLSearchParams();
		if (options.since) {
			params.set('since', options.since);
		}
		return readJson(await auth.authFetch(`/pages${params.size > 0 ? `?${params}` : ''}`));
	},
	async upsertPage(page) {
		return readJson(
			await auth.authFetch('/pages', {
				method: 'POST',
				body: JSON.stringify(page)
			})
		);
	},
	async getSettings() {
		return readJson(await auth.authFetch('/settings'));
	},
	async updateSettings(settings) {
		return readJson(
			await auth.authFetch('/settings', {
				method: 'PATCH',
				body: JSON.stringify(settings)
			})
		);
	}
};

async function readJson<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => null)) as unknown;
	if (!response.ok) {
		throw createApiError(response.status, body);
	}

	return body as T;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
	const timeoutSignal = AbortSignal.timeout(API_FETCH_TIMEOUT_MS);
	const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
	return fetch(input, { ...init, signal });
}
