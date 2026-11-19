import { expect, test } from 'playwright/test';

test('skewed edits and edits made during a sync remain visible and reach the server', async ({
	page
}) => {
	const timestamp = '2099-01-01T00:00:00.000Z';
	const account = {
		sessionId: 'session-a',
		userId: 'user-a',
		email: 'a@example.test',
		username: 'A',
		createdAt: 1,
		lastUsedAt: 2,
		active: true
	};
	let remote = {
		id: 'page-a',
		user_id: 'user-a',
		title: 'baseline',
		content: 'baseline',
		created_at: timestamp,
		updated_at: timestamp,
		deleted_at: null as string | null,
		revision: 1
	};
	let cursor = 1;
	let firstWriteStarted = false;
	let releaseFirstWrite!: () => void;
	const firstWriteGate = new Promise<void>((resolve) => {
		releaseFirstWrite = resolve;
	});
	await page.addInitScript(
		async ({ timestamp }) => {
			await new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('blank', 1);
				request.onupgradeneeded = () => {
					const pages = request.result.createObjectStore('pages', { keyPath: ['userId', 'id'] });
					pages.createIndex('userId', 'userId');
					pages.createIndex('updatedAt', ['userId', 'updatedAt']);
					const settings = request.result.createObjectStore('settings', {
						keyPath: ['userId', 'key']
					});
					settings.createIndex('userId', 'userId');
				};
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const tx = request.result.transaction('pages', 'readwrite');
					tx.objectStore('pages').put({
						id: 'page-a',
						userId: 'user-a',
						title: 'baseline',
						content: 'baseline',
						selectionStart: 0,
						selectionEnd: 0,
						createdAt: timestamp,
						updatedAt: timestamp,
						deletedAt: null,
						lastSyncedAt: timestamp,
						lastKnownRemoteUpdatedAt: timestamp,
						lastKnownRemoteDeletedAt: null,
						serverRevision: 1,
						editGeneration: 0,
						syncStatus: 'synced',
						isEphemeral: false
					});
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				};
			});
		},
		{ timestamp }
	);
	await page.route('http://localhost:1350/v1/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.endsWith('/auth/session') || url.pathname.endsWith('/auth/accounts')) {
			await route.fulfill({ json: { activeSession: account, sessions: [account] } });
		} else if (url.pathname.endsWith('/pages/sync') && route.request().method() === 'GET') {
			const since = url.searchParams.get('since');
			await route.fulfill({
				json: {
					pages: since !== null && Number(since) >= cursor ? [] : [remote],
					cursor: String(cursor)
				}
			});
		} else if (url.pathname.endsWith('/pages/sync') && route.request().method() === 'POST') {
			const payload = route.request().postDataJSON();
			if (!firstWriteStarted) {
				firstWriteStarted = true;
				await firstWriteGate;
			}
			if (payload.expected_revision !== remote.revision) {
				await route.fulfill({ json: { conflict: true, page: remote } });
			} else {
				remote = { ...payload, revision: remote.revision + 1 };
				cursor++;
				await route.fulfill({ json: { conflict: false, page: remote } });
			}
		} else {
			await route.fulfill({ json: null });
		}
	});
	await page.goto('/');
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await expect(editor).toContainText('baseline');
	await editor.fill('first edit');
	await expect.poll(() => firstWriteStarted, { timeout: 10000 }).toBe(true);
	await editor.fill('later edit');
	releaseFirstWrite();
	await expect.poll(() => remote.content, { timeout: 12000 }).toBe('later edit');
	await expect(editor).toContainText('later edit');
	if (process.env.EVIDENCE_SCREENSHOT) {
		await page.screenshot({ path: process.env.EVIDENCE_SCREENSHOT, fullPage: true });
	}
});
