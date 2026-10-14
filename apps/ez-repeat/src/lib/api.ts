import { env } from '$env/dynamic/public';
import { createApiError, createAuthClient, type AuthClient } from '@ez/auth';
import type { RemoteRepeatCompletionRow, RemoteRepeatHabitRow, RepeatApi } from '$lib/repeat/sync';

const API_FETCH_TIMEOUT_MS = 8000;
const apiUrl = env.PUBLIC_EZ_API_URL?.trim() ?? '';

export const auth: AuthClient | null = apiUrl
	? createAuthClient({ apiUrl, fetch: fetchWithTimeout })
	: null;

export const repeatApi: RepeatApi | null = auth
	? {
			async listHabits(options = {}) {
				return readJson(
					await auth.authFetch(`/repeat/habits${buildSinceQuery(options.since)}`, {
						signal: options.signal
					})
				);
			},
			async upsertHabit(habit, options = {}) {
				return readJson(
					await auth.authFetch('/repeat/habits', {
						method: 'POST',
						body: JSON.stringify(habit),
						signal: options.signal
					})
				);
			},
			async listCompletions(options = {}) {
				return readJson(
					await auth.authFetch(`/repeat/completions${buildSinceQuery(options.since)}`, {
						signal: options.signal
					})
				);
			},
			async upsertCompletion(completion, options = {}) {
				return readJson(
					await auth.authFetch('/repeat/completions', {
						method: 'POST',
						body: JSON.stringify(completion),
						signal: options.signal
					})
				);
			}
		}
	: null;

async function readJson<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => null)) as unknown;
	if (!response.ok) {
		throw createApiError(response.status, body);
	}

	return body as T;
}

function buildSinceQuery(since?: string | null) {
	if (!since) {
		return '';
	}
	const params = new URLSearchParams({ since });
	return `?${params}`;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
	const timeoutSignal = AbortSignal.timeout(API_FETCH_TIMEOUT_MS);
	const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
	return fetch(input, { ...init, signal });
}

export type { RemoteRepeatCompletionRow, RemoteRepeatHabitRow };
