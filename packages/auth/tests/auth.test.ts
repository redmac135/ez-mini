import test from 'node:test';
import assert from 'node:assert/strict';
import { authFetch, configureAuth, createAuthClient, getSession } from '../src/index.ts';

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

test('auth client surfaces API error messages', async () => {
	const client = createAuthClient({
		apiUrl: 'https://api.example.test',
		fetch: async () => Response.json({ error: 'Invalid code.' }, { status: 400 })
	});

	await assert.rejects(() => client.verify('a@example.com', '12345678'), /Invalid code/);
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
