import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookies, setCookie, clearCookie } from '../src/http/cookies.ts';
import { getCorsHeaders, stripApiPrefix } from '../src/http/cors.ts';
import { ApiError } from '../src/http/errors.ts';
import { firstRow, readJson } from '../src/http/json.ts';
import type { Env } from '../src/index.ts';

const env = { COOKIE_DOMAIN: '.ethanzhao.ca', CORS_ORIGINS: 'https://app.example.test' } as Env;

test('cookie helpers parse encoded values and add production cookie attributes', () => {
	const cookies = parseCookies('a=one; encoded=hello%20world; empty=');
	const headers = new Headers();

	setCookie(headers, 'session', 'value with spaces', env);
	clearCookie(headers, 'session', env);

	assert.equal(cookies.get('a'), 'one');
	assert.equal(cookies.get('encoded'), 'hello world');
	assert.equal(cookies.get('empty'), '');
	assert.match(headers.get('set-cookie') ?? '', /Domain=.ethanzhao.ca/);
	assert.match(headers.get('set-cookie') ?? '', /Secure/);
	assert.match(headers.get('set-cookie') ?? '', /Max-Age=0/);
});

test('CORS only reflects configured origins', () => {
	const allowed = getCorsHeaders(
		new Request('https://api.example.test', { headers: { origin: 'https://app.example.test' } }),
		env
	);
	const denied = getCorsHeaders(
		new Request('https://api.example.test', { headers: { origin: 'https://evil.example.test' } }),
		env
	);

	assert.equal(allowed.get('access-control-allow-origin'), 'https://app.example.test');
	assert.equal(allowed.get('vary'), 'Origin');
	assert.equal(allowed.get('access-control-allow-methods'), 'GET,POST,PATCH,OPTIONS');
	assert.equal(denied.get('access-control-allow-origin'), null);
});

test('API prefix stripping is stable for root and nested paths', () => {
	assert.equal(stripApiPrefix('/v1'), '/');
	assert.equal(stripApiPrefix('/v1/pages/page-a'), '/pages/page-a');
	assert.equal(stripApiPrefix('/health'), '/health');
});

test('JSON helpers reject malformed bodies and missing rows consistently', async () => {
	await assert.rejects(
		() =>
			readJson(
				new Request('https://api.example.test', {
					method: 'POST',
					body: '{bad-json'
				})
			),
		(error: unknown) => error instanceof ApiError && error.status === 400
	);

	assert.deepEqual(firstRow([{ id: 'row-a' }]), { id: 'row-a' });
	assert.throws(() => firstRow([]), /Row not found/);
});
