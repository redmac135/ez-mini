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

test('Ctrl+K search cancels a title draft and navigates to the selected page', async ({ page }) => {
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	await editor.pressSequentially('Source page');

	await openPages(page);
	await page.getByRole('button', { name: 'New page' }).click();
	await openPages(page);
	await page.getByRole('button', { name: 'Page menu for Untitled' }).click();
	await page.getByRole('button', { name: 'Edit title' }).click();
	const titleInput = page.getByRole('textbox', { name: 'Edit page title' });
	await titleInput.fill('Destination page');
	await titleInput.press('Enter');

	await page.getByRole('button', { name: 'Page menu for Source page' }).click();
	await page.getByRole('button', { name: 'Edit title' }).click();
	await page.getByRole('textbox', { name: 'Edit page title' }).fill('Unsaved draft');
	await page.keyboard.press('Control+k');

	const dialog = page.getByRole('dialog', { name: 'Search pages' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('textbox', { name: 'Search your pages' }).fill('Destination');
	await dialog.getByRole('button', { name: /Destination page/ }).click();

	await expect(dialog).not.toBeVisible();
	await expect(page.locator('.page-row.active .page-title')).toHaveText('Destination page');
	await expect(page.getByRole('button', { name: 'Source page', exact: true })).toBeVisible();
});
