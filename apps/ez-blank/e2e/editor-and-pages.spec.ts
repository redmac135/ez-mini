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

for (const width of [375, 1024]) {
	test(`the page list scrolls independently with many pages at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 600 });
		for (let i = 0; i < 20; i++) {
			await openPages(page);
			await page.getByRole('button', { name: 'New page' }).click();
		}
		await openPages(page);
		const list = page.getByRole('navigation', { name: 'Page tabs' });
		const dimensions = await list.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
			return {
				height: element.clientHeight,
				scrollHeight: element.scrollHeight,
				top: element.scrollTop
			};
		});
		expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
		expect(dimensions.top).toBeGreaterThan(0);
		await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
		await list.getByRole('button', { name: 'Page menu for Untitled' }).last().click();
		const menu = page.getByRole('menu', { name: 'Page menu for Untitled' });
		await expect(menu.getByRole('button', { name: 'Delete' })).toBeVisible();
		const bounds = await menu.evaluate((element) => {
			const menuRect = element.getBoundingClientRect();
			const listRect = element.closest('nav')!.getBoundingClientRect();
			return { bottom: menuRect.bottom, listBottom: listRect.bottom };
		});
		expect(bounds.bottom).toBeLessThanOrEqual(bounds.listBottom + 1);
	});
}

for (const width of [375, 540]) {
	test(`count menu displays metrics at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 600 });
		await page.getByRole('button', { name: /Open count menu/ }).click();
		const menu = page.getByRole('menu', { name: 'Count display options' });
		for (const label of ['characters', 'lines', 'paragraphs']) {
			await expect(menu.getByRole('menuitemradio', { name: new RegExp(label) })).toBeVisible();
		}
		await expect(menu.getByRole('menuitemradio', { name: 'Shown' })).toHaveCount(0);
	});
}

test('Export PDF downloads a formatted PDF directly while offline', async ({ page, context }) => {
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	const longToken = 'unbroken-token-'.repeat(14);
	await editor.pressSequentially(
		`# Draft\n\n**bold** and *italic* and ***bold italic***\n\n${longToken}\n\n你好世界 😀 **after unicode**`
	);
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	const menu = page.getByRole('menu', { name: 'Editor settings' });
	if (process.env.MISTAKES_EVIDENCE_DIR) {
		const { mkdir } = await import('node:fs/promises');
		await mkdir(process.env.MISTAKES_EVIDENCE_DIR, { recursive: true });
		await page.screenshot({
			path: `${process.env.MISTAKES_EVIDENCE_DIR}/export-pdf-menu.png`,
			fullPage: true
		});
	}
	const countPosition = await menu
		.locator('[aria-label^="Cycle word count visibility"]')
		.evaluate((element) =>
			Array.from(element.parentElement!.querySelectorAll('button')).indexOf(
				element as HTMLButtonElement
			)
		);
	const exportButton = menu.getByRole('button', { name: 'Export PDF', exact: true });
	const exportPosition = await exportButton.evaluate((element) =>
		Array.from(element.parentElement!.querySelectorAll('button')).indexOf(
			element as HTMLButtonElement
		)
	);
	const loginPosition = await menu
		.getByRole('button', { name: 'Login' })
		.evaluate((element) =>
			Array.from(element.parentElement!.querySelectorAll('button')).indexOf(
				element as HTMLButtonElement
			)
		);
	expect(countPosition).toBeLessThan(exportPosition);
	expect(exportPosition).toBeLessThan(loginPosition);
	await context.setOffline(true);
	const pagesBeforeDownload = context.pages().length;
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
	const download = await downloadPromise;
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('menu')).toHaveCount(0);
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(() => context.pages().length).toBe(pagesBeforeDownload);
	const { readFile } = await import('node:fs/promises');
	const pdfPath = process.env.MISTAKES_EVIDENCE_DIR
		? `${process.env.MISTAKES_EVIDENCE_DIR}/${download.suggestedFilename()}`
		: (await download.path())!;
	if (process.env.MISTAKES_EVIDENCE_DIR) await download.saveAs(pdfPath);
	const pdf = await readFile(pdfPath);
	expect(download.suggestedFilename()).toBe('# Draft.pdf');
	expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
	expect(pdf.length).toBeGreaterThan(1000);
	const pdfContent = pdf.toString('latin1');
	const exportedText = Array.from(pdfContent.matchAll(/<([0-9a-f]+)> Tj/g), ([, hex]) =>
		Buffer.from(hex, 'hex').toString('latin1')
	).join('');
	expect(pdfContent).toContain('/MediaBox [0 0 595.28 841.89]');
	expect(pdfContent).toContain('/F2 24.00 Tf');
	expect(pdfContent).toContain('/F5 12.00 Tf');
	expect(pdfContent).toContain('/ActualText <feff4f60597d4e16754c>');
	expect(pdfContent).toContain('/ActualText <feffd83dde00>');
	expect(pdfContent).toContain('/Subtype /Image');
	const unicodeStateRestored = pdfContent.indexOf('ET EMC Q\nq ');
	const followingVisibleText = pdfContent.indexOf('/F2 12.00 Tf', unicodeStateRestored);
	expect(unicodeStateRestored).toBeGreaterThan(-1);
	expect(followingVisibleText).toBeGreaterThan(unicodeStateRestored);
	const imageStart = pdf.indexOf(Buffer.from('/Subtype /Image'));
	const imageHeaderEnd =
		pdf.indexOf(Buffer.from('>>\nstream\n'), imageStart) + '>>\nstream\n'.length;
	const imageLength = Number(
		pdf
			.subarray(imageStart, imageHeaderEnd)
			.toString('latin1')
			.match(/\/Length (\d+)/)?.[1]
	);
	const imageBase64 = pdf.subarray(imageHeaderEnd, imageHeaderEnd + imageLength).toString('base64');
	const cornerPixel = await page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/jpeg;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		context.drawImage(image, 0, 0);
		return Array.from(context.getImageData(0, 0, 1, 1).data);
	}, imageBase64);
	expect(cornerPixel.slice(0, 3)).toEqual([255, 255, 255]);
	expect(exportedText).toContain('Draft');
	expect(exportedText).toContain('bold');
	expect(exportedText).toContain(longToken);
	expect(exportedText).not.toContain('**');
	await context.setOffline(false);
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
	await openPages(page);
	await expect(page.getByRole('button', { name: 'Source page', exact: true })).toBeVisible();
});
