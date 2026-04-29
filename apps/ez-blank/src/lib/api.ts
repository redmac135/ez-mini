import { env } from '$env/dynamic/public';
import { configureAuth } from '@ez/auth';
import type { PagesApi } from '$lib/editor/sync';

const apiUrl = env.PUBLIC_EZ_API_URL;

export const auth = apiUrl ? configureAuth({ apiUrl }) : null;

export const pagesApi: PagesApi | null = auth
	? {
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
		}
	: null;

async function readJson<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => null)) as unknown;
	if (!response.ok) {
		throw new Error(readErrorMessage(body) ?? `Request failed with ${response.status}`);
	}

	return body as T;
}

function readErrorMessage(body: unknown) {
	if (body && typeof body === 'object' && 'error' in body) {
		const error = (body as { error?: unknown }).error;
		return typeof error === 'string' ? error : null;
	}

	return null;
}
