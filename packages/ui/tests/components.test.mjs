import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { render } from 'svelte/server';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const vite = await createServer({
	configFile: false,
	root: new URL('..', import.meta.url).pathname,
	plugins: [svelte()],
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'silent'
});

after(async () => {
	await vite.close();
});

async function readComponent(name) {
	return readFile(resolve(new URL('..', import.meta.url).pathname, 'src/lib', name), 'utf8');
}

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
	const { default: AccountModal } = await vite.ssrLoadModule('/src/lib/AccountModal.svelte');
	const { body } = render(AccountModal, { props: { localActive: false } });

	assert.match(body, /<button[^>]*>Use local account<\/button>/);
	assert.match(body, /<button[^>]*>Sign into another account<\/button>/);
});

test('AccountLoading blocks the workspace and exposes an accessible cancel action', async () => {
	const { default: AccountLoading } = await vite.ssrLoadModule('/src/lib/AccountLoading.svelte');
	const { body } = render(AccountLoading, { props: { accountName: 'user-b' } });

	assert.match(body, /<dialog[^>]*aria-modal="true"[^>]*aria-busy="true"/);
	assert.match(body, /Loading data for user-b/);
	assert.match(body, /<button[^>]*>Cancel and go back<\/button>/);
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
