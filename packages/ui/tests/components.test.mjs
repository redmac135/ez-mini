import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url);

test('LoginModal exposes the shared auth flow states', async () => {
	const source = await readComponent('LoginModal.svelte');

	assert.match(source, /export let step: 'email' \| 'otp'/);
	assert.match(source, /export let message = ''/);
	assert.match(source, /export let loginSubmitting = false/);
	assert.match(source, /export let otpVerifying = false/);
	assert.match(source, /export let resendCooldownRemaining = 0/);
	assert.match(source, /onSubmitEmail\(email\)/);
	assert.match(source, /onVerifyOtp\(event\.detail\.value\)/);
});

test('AccountModal exposes account switching and logout controls', async () => {
	const source = await readComponent('AccountModal.svelte');

	assert.match(source, /export interface AccountEntry/);
	assert.match(source, /export let accounts: AccountEntry\[\] = \[\]/);
	assert.match(source, /export let busySessionId: string \| null = null/);
	assert.match(source, /onSelectAccount\(account\.sessionId\)/);
	assert.match(source, /onLogoutAccount\(account\.sessionId, account\.userId\)/);
	assert.match(source, /Sign into another account/);
});

test('ConfirmModal keeps destructive actions presentational', async () => {
	const source = await readComponent('ConfirmModal.svelte');

	assert.match(source, /export let danger = false/);
	assert.match(source, /variant=\{danger \? 'danger' : 'primary'\}/);
	assert.match(source, /onClose=\{onCancel\}/);
});

test('Workspace standardizes app content width and mobile padding', async () => {
	const source = await readComponent('Workspace.svelte');

	assert.match(source, /export let maxWidth = '680px'/);
	assert.match(source, /--workspace-max-width/);
	assert.match(source, /@media \(max-width: 560px\)/);
	assert.match(source, /var\(--space-5\)/);
});

async function readComponent(name) {
	return readFile(resolve(root.pathname, 'src/lib', name), 'utf8');
}
