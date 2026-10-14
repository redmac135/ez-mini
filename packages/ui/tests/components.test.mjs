import assert from 'node:assert/strict';
import { after, test } from 'node:test';
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

function cleanSvelteMarkers(html) {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

test('AccountModal renders the local account action', async () => {
	const { default: AccountModal } = await vite.ssrLoadModule('/src/lib/AccountModal.svelte');
	const { render } = await vite.ssrLoadModule('svelte/server');
	const { body } = render(AccountModal, { props: { localActive: false } });
	const renderedHtml = cleanSvelteMarkers(body);

	assert.match(renderedHtml, /<button[^>]*>Use local account<\/button>/);
	assert.match(renderedHtml, /<button[^>]*>Sign into another account<\/button>/);
});

test('AccountLoading renders the full-screen dialog without quick-switch controls', async () => {
	const { default: AccountLoading } = await vite.ssrLoadModule('/src/lib/AccountLoading.svelte');
	const { render } = await vite.ssrLoadModule('svelte/server');
	const { body } = render(AccountLoading);
	const renderedHtml = cleanSvelteMarkers(body);

	assert.match(renderedHtml, /<dialog[^>]*aria-label="Switching account"[^>]*aria-busy="true"/);
	assert.doesNotMatch(renderedHtml, /Loading account data|>Cancel</);
});
