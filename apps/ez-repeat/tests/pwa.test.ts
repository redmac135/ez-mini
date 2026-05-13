import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
	APP_UPDATED_NOTICE,
	consumeQueuedAppUpdatedNotice,
	queueAppUpdatedNotice
} from '../src/lib/pwa-update-notice.ts';

test('pwa update notice can be queued and consumed', () => {
	const storage = new MemoryStorage();

	queueAppUpdatedNotice(storage);

	assert.equal(consumeQueuedAppUpdatedNotice(storage), APP_UPDATED_NOTICE);
	assert.equal(consumeQueuedAppUpdatedNotice(storage), null);
});

test('app shell includes manifest and favicon links', async () => {
	const source = await readFile(resolve('src/app.html'), 'utf8');

	assert.match(source, /manifest\.webmanifest/);
	assert.match(source, /apple-touch-icon\.png/);
	assert.match(source, /favicon-32x32\.png/);
	assert.match(source, /favicon-16x16\.png/);
});

test('settings theme toggle does not close the floating menu', async () => {
	const source = await readFile(resolve('src/routes/+page.svelte'), 'utf8');
	const toggleThemeBody = source.match(/async function toggleTheme\(\) \{(?<body>[\s\S]*?)\n\t\}/)
		?.groups?.body;

	assert.ok(toggleThemeBody);
	assert.doesNotMatch(toggleThemeBody, /settingsMenuOpen\s*=\s*false/);
});

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
	private values = new Map<string, string>();

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}

	removeItem(key: string) {
		this.values.delete(key);
	}
}
