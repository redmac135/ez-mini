import { expect, test, type Page } from 'playwright/test';

async function openPages(page: Page) {
	await page.mouse.move(10, 10);
	await page.getByRole('button', { name: 'Open pages' }).click();
}

test.beforeEach(async ({ page }) => {
	await page.route('http://localhost:1350/v1/**', async (route) => {
		if (route.request().url().endsWith('/auth/session')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ activeSession: null, sessions: [] })
			});
			return;
		}

		await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
	});
	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
});

test('typing, ordered list numbering, and list indentation work in the editor', async ({
	page
}) => {
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });

	await editor.pressSequentially('1. first');
	await editor.press('Enter');
	await editor.pressSequentially('second');
	await editor.press('Enter');
	await editor.pressSequentially('third');

	const lines = editor.locator('.line');
	await expect(lines).toHaveText(['1. first', '2. second', '3. third']);

	await editor.press('Control+Home');
	await editor.press('ArrowDown');
	await editor.press('Home');
	await editor.press('Tab');

	await expect(lines).toHaveText(['1. first', '    1. second', '2. third']);
});

test('new pages become active, and deleting the active page selects a remaining page', async ({
	page
}) => {
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await editor.pressSequentially('First page');
	await expect(page.locator('.page-row.active .page-title')).toHaveText('First page');

	await openPages(page);
	await page.getByRole('button', { name: 'New page' }).click();
	await expect(editor.locator('.line')).toHaveText('');
	await expect(page.locator('.page-row.active .page-title')).toHaveText('Untitled');
	await editor.pressSequentially('Second page');
	await expect(page.locator('.page-row.active .page-title')).toHaveText('Second page');

	await openPages(page);
	await page.getByRole('button', { name: 'First page', exact: true }).click();
	await expect(editor.locator('.line')).toHaveText('First page');

	await openPages(page);
	await page.getByRole('button', { name: 'Second page', exact: true }).click();
	await openPages(page);
	await page.getByRole('button', { name: 'Page menu for Second page' }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(page.locator('.page-row.active .page-title')).toHaveText('First page');
	await expect(editor.locator('.line')).toHaveText('First page');
	await expect(page.locator('.page-title')).toHaveText(['First page']);
});
