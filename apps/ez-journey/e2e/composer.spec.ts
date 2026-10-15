import { expect, test } from 'playwright/test';

test.use({ baseURL: 'http://127.0.0.1:1353' });

async function startWithAnonymousEntry(page: import('playwright/test').Page) {
	let authenticated = false;
	const uploadedEntries: unknown[] = [];
	await page.route('**/v1/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.endsWith('/auth/session')) {
			const user = authenticated
				? {
						sessionId: 'session-a',
						userId: 'user-a',
						email: 'journey@example.com',
						username: 'journey-user',
						createdAt: 1,
						lastUsedAt: 1,
						active: true
					}
				: null;
			await route.fulfill({ json: { activeSession: user, sessions: user ? [user] : [] } });
			return;
		}
		if (url.pathname.endsWith('/journey/entries') && route.request().method() === 'POST') {
			const body = route.request().postDataJSON();
			uploadedEntries.push(body);
			await route.fulfill({ json: body });
			return;
		}
		if (url.pathname.endsWith('/journey/entries')) {
			await route.fulfill({ json: { entries: [], nextCursor: null } });
			return;
		}
		await route.fulfill({ json: {} });
	});

	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('journey', 3);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction('entries', 'readwrite');
		tx.objectStore('entries').put({
			id: 'offline-before-login',
			userId: 'anonymous',
			text: 'Saved before signing in',
			createdAt: '2026-10-14T12:00:00.000Z',
			updatedAt: '2026-10-14T12:00:00.000Z',
			deletedAt: null,
			lastSyncedAt: null,
			lastRemoteChangeAt: null
		});
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	});
	authenticated = true;
	await page.reload();
	await expect(page.getByRole('dialog')).toContainText('Add local entries to this account?');
	return { uploadedEntries };
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await expect(editor).toBeVisible();
	await expect(editor).toBeFocused();
	await expect(page.getByText('Your saved entries will appear here.')).toHaveCount(0);
});

async function expectNoPageOverflow(page: import('playwright/test').Page) {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
		.toBeLessThanOrEqual(1);
}

test('expands only when the cursor reaches a fourth visual line', async ({ page }) => {
	await page.setViewportSize({ width: 520, height: 900 });
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await expect(editor).toHaveAttribute('data-placeholder', 'What’s on your mind?');
	await expect(page.getByText('ez journey', { exact: true })).toHaveCount(0);
	const navbarWidth = (await page.locator('.navbar-content').boundingBox())?.width ?? 0;
	const viewportWidth = page.viewportSize()?.width ?? 0;
	expect(navbarWidth).toBeGreaterThan(viewportWidth * 0.95);
	await editor.click();
	await editor.pressSequentially('A quiet walk after lunch');
	await expect(page.locator('.composer')).not.toHaveClass(/expanded/);
	await editor.pressSequentially(' and a few more words'.repeat(12));

	await expect(page.locator('.composer')).toHaveClass(/expanded/);
	await expect(page.locator('.composer')).toHaveCSS('overflow-y', 'visible');
	await expect(page.locator('.editor-wrap')).toHaveCSS('overflow-y', 'visible');
	await expect(editor).toHaveCSS('padding-top', '64px');
	await expect(page.getByRole('button', { name: 'Save and submit entry' })).toBeVisible();
	await expect
		.poll(async () => (await page.locator('.composer').boundingBox())?.y ?? 0)
		.toBeCloseTo(44, 0);
	const editorSurface = await page.locator('.editor-wrap').boundingBox();
	expect(editorSurface?.width).toBe(Math.min(680, viewportWidth - 48));
	expect(editorSurface?.x).toBeCloseTo((viewportWidth - (editorSurface?.width ?? 0)) / 2, 0);
	await page.getByRole('button', { name: 'Minimize entry' }).click();
	await expect(page.locator('.composer')).not.toHaveClass(/expanded/);
	await expect(editor).toContainText('A quiet walk after lunch');
	await editor.click();
	await expect(page.locator('.composer')).toHaveClass(/expanded/);
});

test('expands at three line breaks, collapses below the threshold, and submits', async ({
	page
}) => {
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await editor.click();
	await editor.pressSequentially('First line');
	await editor.press('Enter');
	await editor.press('Enter');
	await editor.press('Enter');
	await expect(page.locator('.composer')).toHaveClass(/expanded/);
	await expect
		.poll(() =>
			page
				.locator('.composer')
				.evaluate((element) =>
					element
						.getAnimations()
						.some((animation) => animation.effect?.getKeyframes().some((frame) => 'width' in frame))
				)
		)
		.toBe(true);
	await editor.press('Backspace');
	await expect(page.locator('.composer')).not.toHaveClass(/expanded/);
	await editor.press('Enter');
	await expect(page.locator('.composer')).toHaveClass(/expanded/);
	await editor.pressSequentially('Last line');
	await page.getByRole('button', { name: 'Save and submit entry' }).click();
	await expect(page.locator('.composer')).not.toHaveClass(/expanded/);
	await expect(editor).toHaveText('');
});

test('app menu toggles theme and opens the shared login flow', async ({ page }) => {
	await page.route('**/v1/auth/session', (route) =>
		route.fulfill({ json: { activeSession: null, sessions: [] } })
	);
	await page.evaluate(() => localStorage.setItem('ez-journey-theme', 'light'));
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeFocused();
	await page.getByRole('button', { name: 'Open app menu' }).click();
	const menu = page.getByRole('menu', { name: 'App menu' });
	const themeItem = page.getByRole('menuitem', { name: 'Dark mode' });
	const menuBorder = await menu.evaluate((element) => getComputedStyle(element).borderTopColor);
	expect(menuBorder).not.toBe('rgba(0, 0, 0, 0)');
	await themeItem.hover();
	await expect
		.poll(() => themeItem.evaluate((element) => getComputedStyle(element).backgroundColor))
		.toBe('rgba(0, 0, 0, 0.1)');
	await themeItem.click();
	await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
	await expect(page.getByRole('button', { name: 'Open app menu' }).locator('svg path')).toHaveCSS(
		'fill',
		'rgb(241, 241, 236)'
	);

	await page.getByRole('button', { name: 'Open app menu' }).click();
	await page.getByRole('menuitem', { name: 'Login' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page.getByRole('dialog')).toContainText('Email');
});

test('sign-in offers to add anonymous entries and declining keeps them local', async ({ page }) => {
	const { uploadedEntries } = await startWithAnonymousEntry(page);
	await page.getByRole('button', { name: 'No', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /open journal entry/i })).toHaveCount(0);
	const owners = await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('journey', 3);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction('entries', 'readonly');
		const entries = await new Promise<Array<{ userId: string }>>((resolve, reject) => {
			const request = tx.objectStore('entries').getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return entries.map(({ userId }) => userId);
	});
	expect(owners).toEqual(['anonymous']);
	expect(uploadedEntries).toEqual([]);
});

test('choosing to add anonymous entries claims and syncs them to the signed-in account', async ({
	page
}) => {
	const { uploadedEntries } = await startWithAnonymousEntry(page);
	await page.getByRole('button', { name: 'Yes, add entries' }).click();
	await expect(page.getByRole('button', { name: /open journal entry/i })).toContainText(
		'Saved before signing in'
	);
	await expect.poll(() => uploadedEntries.length).toBe(1);
	expect(uploadedEntries[0]).toMatchObject({
		id: 'offline-before-login',
		user_id: 'user-a',
		text: 'Saved before signing in'
	});
});

test('saved entries appear in the timeline and open as editable full-screen entries', async ({
	page
}) => {
	await page.evaluate(() => localStorage.setItem('ez-journey-theme', 'light'));
	await page.reload();
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await expect(editor).toBeFocused();
	await editor.pressSequentially('A moment worth keeping');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	const entryCard = page.getByRole('button', { name: /open journal entry/i });
	await expect(entryCard).toContainText('A moment worth keeping');
	const restingCardStyle = await entryCard.evaluate((element) => ({
		background: getComputedStyle(element).backgroundColor,
		border: getComputedStyle(element).borderTopColor
	}));
	expect(restingCardStyle.border).not.toBe(restingCardStyle.background);
	await entryCard.hover();
	const hoveredCardBackground = await entryCard.evaluate(
		(element) => getComputedStyle(element).backgroundColor
	);
	expect(hoveredCardBackground).not.toBe(restingCardStyle.background);
	await expect(entryCard.locator('time')).toHaveCount(1);
	await expect(entryCard).not.toContainText(/October|September|November/);
	await expect(page.locator('.day-heading')).toHaveCount(1);
	await expect(page.locator('.day-dot')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.14)');
	await entryCard.click();

	const fullScreenEditor = page.locator('.entry-editor.fullscreen');
	await expect(fullScreenEditor).toBeVisible();
	await expect(fullScreenEditor).toHaveCSS('overflow-y', 'hidden');
	await expect(page.locator('.entry-content')).toHaveCSS('overflow-y', 'visible');
	const viewportWidth = page.viewportSize()?.width ?? 0;
	const editorWidth = Math.min(680, viewportWidth - 48);
	const entrySurfaceLocator = page.locator('.entry-content');
	await expect
		.poll(async () => (await entrySurfaceLocator.boundingBox())?.x ?? 0)
		.toBeCloseTo((viewportWidth - editorWidth) / 2, 0);
	const entrySurface = await entrySurfaceLocator.boundingBox();
	expect(entrySurface?.width).toBe(editorWidth);
	const entryText = fullScreenEditor.getByRole('textbox', { name: 'Markdown editor' });
	await entryText.pressSequentially(' and more');
	await page.getByRole('button', { name: 'Save journal entry' }).click();
	await expect(page.locator('.entry-editor')).toHaveCount(0);
	await expect(entryCard).toContainText('A moment worth keeping and more');
});

test('the app keeps page margins inside the viewport in every editor state', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/?demo=journey');
	const entryCards = page.getByRole('button', { name: /open journal entry/i });
	await expect(entryCards).toHaveCount(30);
	await expect
		.poll(() =>
			page
				.locator('.timeline-scroll')
				.evaluate((element) => element.scrollHeight > element.clientHeight)
		)
		.toBe(true);
	await expectNoPageOverflow(page);

	const composerEditor = page.getByRole('textbox', { name: 'Markdown editor' });
	await composerEditor.pressSequentially('A moment to save');
	await composerEditor.press('Enter');
	await composerEditor.press('Enter');
	await composerEditor.press('Enter');
	await expect(page.locator('.composer')).toHaveClass(/expanded/);
	await expectNoPageOverflow(page);

	await page.getByRole('button', { name: 'Save and submit entry' }).click();
	const entryCard = page.getByRole('button', { name: /open journal entry/i }).filter({
		hasText: 'A moment to save'
	});
	await expect(entryCard).toContainText('A moment to save');
	await expectNoPageOverflow(page);

	await entryCard.click();
	await expect(page.locator('.entry-editor.fullscreen')).toBeVisible();
	await expectNoPageOverflow(page);
});

test('backing out of a changed journal entry asks before discarding edits', async ({ page }) => {
	const composerEditor = page.getByRole('textbox', { name: 'Markdown editor' });
	await composerEditor.pressSequentially('A saved moment');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	const entryCard = page.getByRole('button', { name: /open journal entry/i });
	await expect(entryCard).toContainText('A saved moment');
	await entryCard.click();

	const entryEditor = page
		.locator('.entry-editor')
		.getByRole('textbox', { name: 'Markdown editor' });
	await entryEditor.pressSequentially(' with an unsaved addition');
	await page.getByRole('button', { name: 'Close journal entry' }).click();

	const confirmation = page.getByRole('dialog', { name: 'Discard changes?' });
	await expect(confirmation).toContainText(
		'Your changes to this journal entry haven’t been saved.'
	);
	await confirmation.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirmation).toHaveCount(0);
	await expect(entryEditor).toContainText('with an unsaved addition');

	await page.getByRole('button', { name: 'Close journal entry' }).click();
	await page
		.getByRole('dialog', { name: 'Discard changes?' })
		.getByRole('button', { name: 'Discard changes' })
		.click();
	await expect(page.locator('.entry-editor')).toHaveCount(0);
	await expect(entryCard).toContainText('A saved moment');
	await expect(entryCard).not.toContainText('unsaved addition');

	await entryCard.click();
	await page.getByRole('button', { name: 'Close journal entry' }).click();
	await expect(page.locator('.entry-editor')).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toHaveCount(0);
});

test('short drafts can be saved from the compact composer', async ({ page }) => {
	await page.evaluate(() => localStorage.setItem('ez-journey-theme', 'light'));
	await page.reload();
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await expect(editor).toBeFocused();
	const surfaceColors = await page.locator('.composer').evaluate((composer) => {
		const footer = composer.querySelector<HTMLElement>('.composer-footer')!;
		const divider = composer.querySelector<HTMLElement>('.composer-divider')!;
		return {
			composer: getComputedStyle(composer).backgroundColor,
			footer: getComputedStyle(footer).backgroundColor,
			divider: getComputedStyle(divider).backgroundColor,
			border: getComputedStyle(composer).borderTopColor,
			footerHeight: getComputedStyle(footer).height
		};
	});
	expect(surfaceColors.footer).toBe(surfaceColors.composer);
	expect(surfaceColors.divider).not.toBe(surfaceColors.composer);
	expect(surfaceColors.border).not.toBe(surfaceColors.composer);
	expect(surfaceColors.footerHeight).toBe('68px');
	await editor.pressSequentially('Quick note');
	await expect(page.locator('.composer')).not.toHaveClass(/expanded/);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('.composer')).not.toHaveClass(/expanded/);
	await expect(page.getByRole('button', { name: /open journal entry/i })).toContainText(
		'Quick note'
	);
	await page.reload();
	await expect(page.getByRole('button', { name: /open journal entry/i })).toContainText(
		'Quick note'
	);
});

test('development demo data loads more timeline pages on scroll', async ({ page }) => {
	await page.goto('/?demo=journey');
	const entryCards = page.getByRole('button', { name: /open journal entry/i });
	await expect(entryCards).toHaveCount(30);
	const scrollArea = page.locator('.timeline-scroll');
	await scrollArea.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(entryCards).toHaveCount(60);
	await expect(entryCards.first()).toContainText('I took the longer route home');
});
