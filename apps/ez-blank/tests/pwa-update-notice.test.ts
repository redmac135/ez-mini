import test from 'node:test';
import assert from 'node:assert/strict';
import {
	APP_UPDATED_NOTICE,
	consumeQueuedAppUpdatedNotice,
	queueAppUpdatedNotice
} from '../src/lib/pwa-update-notice.ts';

class MemoryStorage {
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

test('PWA update notice is queued and consumed once', () => {
	const storage = new MemoryStorage();

	queueAppUpdatedNotice(storage);
	assert.equal(consumeQueuedAppUpdatedNotice(storage), APP_UPDATED_NOTICE);
	assert.equal(consumeQueuedAppUpdatedNotice(storage), null);
});
