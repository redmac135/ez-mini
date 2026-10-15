import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest, type Env } from '../src/index.ts';
import { sessionKey } from '../src/auth/session-store.ts';

class MemoryKv {
	private values = new Map<string, string>();

	async get(key: string, type?: 'json') {
		const value = this.values.get(key) ?? null;
		return type === 'json' && value ? JSON.parse(value) : value;
	}

	async put(key: string, value: string) {
		this.values.set(key, value);
	}

	async delete(key: string) {
		this.values.delete(key);
	}

	async list({ prefix }: { prefix?: string }) {
		return {
			keys: [...this.values.keys()]
				.filter((key) => !prefix || key.startsWith(prefix))
				.map((name) => ({ name }))
		};
	}
}

const deviceId = 'profile-device';
const sessionId = 'profile-session';
const env = {
	SESSIONS: new MemoryKv(),
	SUPABASE_URL: 'https://supabase.example.test',
	SUPABASE_PUBLISHABLE_KEY: 'publishable'
} as unknown as Env;

test.beforeEach(async () => {
	env.SESSIONS = new MemoryKv() as unknown as KVNamespace;
	await env.SESSIONS.put(
		sessionKey(deviceId, sessionId),
		JSON.stringify({
			sessionId,
			deviceId,
			userId: 'user-profile',
			email: 'person@example.com',
			supabaseAccessToken: 'access-profile',
			supabaseRefreshToken: 'refresh-profile',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 1,
			lastUsedAt: 1
		})
	);
});

test('profile defaults to connected provider username and then email', async () => {
	mockFetch(async (request) => {
		assert.equal(new URL(request.url).pathname, '/auth/v1/user');
		assert.equal(request.headers.get('authorization'), 'Bearer access-profile');
		return Response.json({
			id: 'user-profile',
			email: 'person@example.com',
			user_metadata: {},
			identities: [
				{ identity_id: 'g', provider: 'github', identity_data: { user_name: 'person-dev' } }
			]
		});
	});
	const response = await requestProfile('GET');
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { displayName: 'person-dev', customDisplayName: null });
});

test('profile updates Supabase user metadata and limits display name length', async () => {
	let updateBody: unknown;
	mockFetch(async (request) => {
		assert.equal(request.method, 'PUT');
		updateBody = await request.json();
		return Response.json({
			id: 'user-profile',
			email: 'person@example.com',
			user_metadata: { display_name: 'Taylor Zhao' },
			identities: []
		});
	});
	const saved = await requestProfile('PUT', { displayName: '  Taylor Zhao  ' });
	assert.equal(saved.status, 200);
	assert.deepEqual(updateBody, { data: { display_name: 'Taylor Zhao' } });
	assert.deepEqual(await saved.json(), {
		displayName: 'Taylor Zhao',
		customDisplayName: 'Taylor Zhao'
	});
	const sessions = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=${sessionId}`
			}
		}),
		env
	);
	const sessionBody = (await sessions.json()) as { activeSession: { username: string } };
	assert.equal(sessionBody.activeSession.username, 'Taylor Zhao');

	const tooLong = await requestProfile('PUT', { displayName: 'x'.repeat(81) });
	assert.equal(tooLong.status, 400);
	assert.deepEqual(await tooLong.json(), {
		error: 'Display name must be 80 characters or fewer.'
	});
});

test('profile routes require an active session', async () => {
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/profile'),
		env
	);
	assert.equal(response.status, 401);
});

async function requestProfile(method: 'GET' | 'PUT', body?: unknown) {
	return handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/profile', {
			method,
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=${sessionId}`,
				...(body ? { 'content-type': 'application/json' } : {})
			},
			body: body ? JSON.stringify(body) : undefined
		}),
		env
	);
}

function mockFetch(handler: (request: Request) => Promise<Response> | Response) {
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
		handler(new Request(input, init))) as typeof fetch;
}
