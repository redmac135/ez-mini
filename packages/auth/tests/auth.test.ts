import test from 'node:test';
import assert from 'node:assert/strict';
import {
	AuthApiError,
	authFetch,
	configureAuth,
	createAuthClient,
	getSession,
	isUnauthorizedError
} from '../src/index.ts';

test('auth client sends credentials and normalizes API URL', async () => {
	const requests: Request[] = [];
	const client = createAuthClient({
		apiUrl: 'https://api.example.test/v1/',
		fetch: async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			return Response.json({ sent: true });
		}
	});

	await client.login('a@example.com');

	assert.equal(requests[0]?.url, 'https://api.example.test/v1/auth/login');
	assert.equal(requests[0]?.credentials, 'include');
	assert.equal(requests[0]?.method, 'POST');
	assert.equal(requests[0]?.headers.get('content-type'), 'application/json');
});

test('session lookup forwards an abort signal to fetch', async () => {
	let requestSignal: AbortSignal | null = null;
	const client = createAuthClient({
		apiUrl: 'https://api.example.test/v1',
		fetch: async (input, init) => {
			requestSignal = new Request(input, init).signal;
			return Response.json({ activeSession: null, sessions: [] });
		}
	});
	const controller = new AbortController();

	await client.getSession({ signal: controller.signal });

	assert.equal(requestSignal?.aborted, false);
	controller.abort();
	assert.equal(requestSignal?.aborted, true);
});

test('auth client surfaces API error messages', async () => {
	const client = createAuthClient({
		apiUrl: 'https://api.example.test',
		fetch: async () => Response.json({ error: 'Invalid code.' }, { status: 400 })
	});

	await assert.rejects(() => client.verify('a@example.com', '12345678'), /Invalid code/);
	await assert.rejects(
		() => client.verify('a@example.com', '12345678'),
		(error) => error instanceof AuthApiError && error.status === 400
	);
});

test('auth client surfaces plain-text upstream failures without a JSON parse error', async () => {
	const client = createAuthClient({
		apiUrl: 'https://api.example.test',
		fetch: async () =>
			new Response('Supabase request failed with Cloudflare error 1016 (HTTP 530).', {
				status: 502,
				headers: { 'content-type': 'text/plain' }
			})
	});

	await assert.rejects(
		() => client.login('a@example.com'),
		(error) =>
			error instanceof AuthApiError &&
			error.status === 502 &&
			error.message.includes('Cloudflare error 1016') &&
			!error.message.includes('JSON')
	);
});

test('auth client exposes broadcast relay URL', () => {
	const client = createAuthClient({
		apiUrl: 'https://api.example.test/v1/',
		fetch: async () => Response.json({})
	});

	assert.equal(client.getBroadcastRelayUrl(), 'https://api.example.test/v1/auth/broadcast-frame');
});

test('unauthorized helper recognizes expired session failures', () => {
	assert.equal(isUnauthorizedError(new AuthApiError(401, 'No active session.')), true);
	assert.equal(isUnauthorizedError(new Error('Session not found.')), true);
	assert.equal(isUnauthorizedError(new AuthApiError(500, 'No active session.')), false);
	assert.equal(isUnauthorizedError(new Error('Failed to fetch.')), false);
});

test('auth client appends logout query params and optional session body', async () => {
	const requests: Request[] = [];
	const client = createAuthClient({
		apiUrl: 'https://api.example.test/v1',
		fetch: async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			return Response.json({ activeSession: null, sessions: [] });
		}
	});

	await client.logout({ all: true, sessionId: 'session-a' });

	assert.equal(requests[0]?.url, 'https://api.example.test/v1/auth/logout?all=true');
	assert.equal(requests[0]?.method, 'POST');
	assert.deepEqual(await requests[0]?.json(), { sessionId: 'session-a' });
});

test('auth client can return to anonymous mode without removing saved sessions', async () => {
	let request: Request | null = null;
	const client = createAuthClient({
		apiUrl: 'https://api.example.test/v1',
		fetch: async (input, init) => {
			request = new Request(input, init);
			return Response.json({ activeSession: null, sessions: [] });
		}
	});

	await client.useAnonymous();

	assert.equal(request?.url, 'https://api.example.test/v1/auth/anonymous');
	assert.equal(request?.method, 'POST');
	assert.equal(request?.credentials, 'include');
});

test('configured default client is used by package-level helpers', async () => {
	const requests: Request[] = [];
	configureAuth({
		apiUrl: 'https://api.example.test/v1',
		fetch: async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			return Response.json({ activeSession: null, sessions: [] });
		}
	});

	await getSession();
	await authFetch('/pages');

	assert.equal(requests[0]?.url, 'https://api.example.test/v1/auth/session');
	assert.equal(requests[1]?.url, 'https://api.example.test/v1/pages');
	assert.equal(requests[1]?.credentials, 'include');
});

test('auth client requires a non-empty API URL', () => {
	assert.throws(() => createAuthClient({ apiUrl: '   ' }), /apiUrl is required/);
});
