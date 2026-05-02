import test from 'node:test';
import assert from 'node:assert/strict';
import { beginAuthRequestId, isLatestAuthRequest } from '../src/lib/auth/auth-request.ts';

test('auth request ids reject stale anonymous session results after login starts', () => {
	const initialSessionProbeId = beginAuthRequestId(0);
	const loginVerifyId = beginAuthRequestId(initialSessionProbeId);

	assert.equal(isLatestAuthRequest(loginVerifyId, initialSessionProbeId), false);
	assert.equal(isLatestAuthRequest(loginVerifyId, loginVerifyId), true);
});
