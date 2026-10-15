import { env } from '$env/dynamic/public';
import { createApiError, createAuthClient, type AuthClient } from '@ez/auth';
import type { JourneyApi, RemoteJourneyEntry } from '$lib/journey/sync';

const API_FETCH_TIMEOUT_MS = 8000;
const apiUrl = env.PUBLIC_EZ_API_URL?.trim() ?? '';

export const auth: AuthClient | null = apiUrl
	? createAuthClient({ apiUrl, fetch: fetchWithTimeout })
	: null;

export const journeyApi: JourneyApi | null = auth
	? {
			async listEntries(options = {}) {
				const entries: RemoteJourneyEntry[] = [];
				let cursor: { created_at: string; id: string } | null = null;
				do {
					const params = new URLSearchParams({ limit: '100' });
					if (options.since) params.set('since', options.since);
					if (cursor) {
						params.set('before_created_at', cursor.created_at);
						params.set('before_id', cursor.id);
					}
					const page = await readJson<{
						entries: RemoteJourneyEntry[];
						nextCursor: { created_at: string; id: string } | null;
					}>(await auth.authFetch(`/journey/entries?${params}`));
					entries.push(...page.entries);
					cursor = page.nextCursor;
				} while (cursor);
				return entries;
			},
			async upsertEntry(entry) {
				return readJson(
					await auth.authFetch('/journey/entries', {
						method: 'POST',
						body: JSON.stringify(entry)
					})
				);
			}
		}
	: null;

async function readJson<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => null)) as unknown;
	if (!response.ok) throw createApiError(response.status, body);
	return body as T;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
	const timeoutSignal = AbortSignal.timeout(API_FETCH_TIMEOUT_MS);
	const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
	return fetch(input, { ...init, signal });
}

export type { RemoteJourneyEntry };
