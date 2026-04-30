import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const designFiles = [
	'packages/design/colors.css',
	'packages/design/spacing.css',
	'packages/design/radius.css',
	'packages/design/animation.css',
	'packages/design/typography.css'
];

async function read(path) {
	return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('design package exports only generic tokens', async () => {
	const designCss = (await Promise.all(designFiles.map(read))).join('\n');

	assert.equal(designCss.includes('--color-editor'), false);
	assert.equal(designCss.includes('--size-editor'), false);
	assert.equal(designCss.includes('--font-size-editor'), false);
	assert.equal(designCss.includes('--line-height-editor'), false);
});

test('editor-specific tokens live with the editor component', async () => {
	const editorCss = await read('apps/ez-blank/src/lib/Editor.svelte');

	assert.equal(editorCss.includes('--editor-caret-color'), true);
	assert.equal(editorCss.includes('--editor-selection-color'), true);
	assert.equal(editorCss.includes('--editor-max-width'), true);
});

test('token entrypoints include animation tokens', async () => {
	const tokensCss = await read('packages/design/tokens.css');
	const indexCss = await read('packages/design/index.css');

	assert.match(tokensCss, /@import '\.\/index\.css';/);
	assert.match(indexCss, /@import '\.\/animation\.css';/);
});

test('PWA support uses SvelteKit native service worker instead of the Vite plugin', async () => {
	const viteConfig = await read('apps/ez-blank/vite.config.ts');
	const serviceWorker = await read('apps/ez-blank/src/service-worker.ts');
	const layout = await read('apps/ez-blank/src/routes/+layout.svelte');
	const manifest = JSON.parse(await read('apps/ez-blank/static/manifest.webmanifest'));

	assert.equal(viteConfig.includes('@vite-pwa/sveltekit'), false);
	assert.equal(serviceWorker.includes('$service-worker'), true);
	assert.equal(layout.includes('controllerchange'), true);
	assert.equal(layout.includes('queueAppUpdatedNotice'), true);
	assert.equal(manifest.display, 'standalone');
	assert.equal(manifest.icons.length >= 2, true);
});

test('service worker serves cached app shell before remote navigation fetches', async () => {
	const serviceWorker = await read('apps/ez-blank/src/service-worker.ts');

	assert.match(serviceWorker, /caches\.match\(APP_SHELL\)/);
	assert.match(serviceWorker, /event\.waitUntil\(refreshedShell\)/);
	assert.equal(serviceWorker.includes('fetch(event.request).catch'), false);
});

test('Worker Wrangler config disables generated preview and workers.dev URLs', async () => {
	const apiWrangler = await read('apps/api/wrangler.toml');

	assert.match(apiWrangler, /workers_dev = false/);
	assert.match(apiWrangler, /preview_urls = false/);
});
