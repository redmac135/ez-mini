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

async function pdfContents(path: string) {
	const { readFile } = await import('node:fs/promises');
	const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const bytes = new Uint8Array(await readFile(path));
	const pdf = await getDocument({ data: bytes, useSystemFonts: false }).promise;
	let text = '';
	let images = 0;
	for (let index = 1; index <= pdf.numPages; index++) {
		const pdfPage = await pdf.getPage(index);
		expect(pdfPage.view[2]).toBeCloseTo(595.28, 1);
		expect(pdfPage.view[3]).toBeCloseTo(841.89, 1);
		const content = await pdfPage.getTextContent();
		text += content.items.map((item) => ('str' in item ? item.str : '')).join('') + '\n';
		const operators = await pdfPage.getOperatorList();
		images += operators.fnArray.filter(
			(op) => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject
		).length;
	}
	await pdf.destroy();
	return { text, images, pages: pdf.numPages };
}

async function pdfiumText(path: string) {
	const { readFile } = await import('node:fs/promises');
	const { dirname, join } = await import('node:path');
	const { init } = await import('@embedpdf/pdfium');
	const { createRequire } = await import('node:module');
	const require = createRequire(import.meta.url);
	const wasmBinary = await readFile(
		join(dirname(require.resolve('@embedpdf/pdfium')), 'pdfium.wasm')
	);
	const pdfium = await init({ wasmBinary });
	pdfium.PDFiumExt_Init();
	const bytes = await readFile(path);
	const ptr = pdfium.pdfium._malloc(bytes.length);
	pdfium.pdfium.HEAPU8.set(bytes, ptr);
	const document = pdfium.FPDF_LoadMemDocument(ptr, bytes.length, '');
	const page = pdfium.FPDF_LoadPage(document, 0);
	const textPage = pdfium.FPDFText_LoadPage(page);
	const count = pdfium.FPDFText_CountChars(textPage);
	const buffer = pdfium.pdfium._malloc((count * 2 + 1) * 2);
	const length = pdfium.FPDFText_GetText(textPage, 0, count, buffer);
	const text = new TextDecoder('utf-16le').decode(
		pdfium.pdfium.HEAPU8.slice(buffer, buffer + (length - 1) * 2)
	);
	pdfium.pdfium._free(buffer);
	pdfium.FPDFText_ClosePage(textPage);
	pdfium.FPDF_ClosePage(page);
	pdfium.FPDF_CloseDocument(document);
	pdfium.pdfium._free(ptr);
	return text;
}

async function openExport(page: Page) {
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page
		.getByRole('menu', { name: 'Editor settings' })
		.getByRole('button', { name: 'Export', exact: true })
		.click();
	const dialog = page.getByRole('dialog', { name: 'Export' });
	await expect(dialog).toBeVisible();
	return dialog;
}

test('Export downloads selectable formatted AST text without opening a tab', async ({
	page,
	context
}) => {
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	const longToken = 'unbroken-token-'.repeat(14);
	await editor.fill(
		`# Draft\n\n**bold** and *italic* and ***bold italic***\n\n${longToken}\n\n你好世界 한국어 हिन्दी ह हिन्दी श्रद्धा श्री नमस्ते क्ष कि क़ שלום مرحبا 😀 **after unicode**\n\n1. one\n    - nested\n\`\`\`\ncode text\n\`\`\``
	);
	const dialog = await openExport(page);
	const toggle = dialog.getByRole('switch', { name: 'Formatted' });
	await expect(toggle).toBeChecked();
	await expect(toggle).toBeFocused();
	await expect(dialog.getByText('preview', { exact: false })).toHaveCount(0);
	const pagesBefore = context.pages().length;
	const downloadPromise = page.waitForEvent('download');
	await dialog.getByRole('button', { name: 'Save as PDF' }).click();
	const download = await downloadPromise;
	if (process.env.MISTAKES_EVIDENCE_DIR)
		await download.saveAs(process.env.MISTAKES_EVIDENCE_DIR + '/formatted.pdf');
	expect(download.suggestedFilename()).toBe('# Draft.pdf');
	await expect(dialog).toHaveCount(0);
	expect(context.pages()).toHaveLength(pagesBefore);
	const result = await pdfContents((await download.path())!);
	expect(result.text).toContain('Draft');
	expect(result.text).toContain('bold and italic and bold italic');
	expect(result.text.replace(/\s/g, '')).toContain(longToken);
	expect(result.text).toContain('你好世界');
	expect(result.text).toContain('😀');
	expect(result.text).toContain('한국어');
	// Devanagari extraction is a known reader limitation; see PDF_EXPORT.md.
	const pdfium = await pdfiumText((await download.path())!);
	expect(pdfium).toContain('你好世界');
	expect(result.text).toContain('שלום');
	expect(result.text).toContain('مرحبا');
	expect(result.text).toContain('after unicode');
	expect(result.text).toContain('nested');
	expect(result.text).toContain('code text');
	expect(result.text).not.toContain('**');
	expect(result.images).toBe(0);
});

test('Export literal Markdown wraps across A4 pages and supports keyboard focus', async ({
	page,
	context
}) => {
	const editor = page.getByRole('textbox', { name: 'Markdown editor' });
	const line = '# Heading **literal** 你好 😀';
	await editor.fill(Array.from({ length: 100 }, (_, i) => `${line} ${i}`).join('\n'));
	let dialog = await openExport(page);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Open editor settings' })).toBeFocused();
	dialog = await openExport(page);
	const toggle = dialog.getByRole('switch', { name: 'Formatted' });
	await page.keyboard.press('Space');
	await expect(toggle).not.toBeChecked();
	const pagesBefore = context.pages().length;
	const downloadPromise = page.waitForEvent('download');
	await dialog.getByRole('button', { name: 'Save as PDF' }).click();
	const download = await downloadPromise;
	const result = await pdfContents((await download.path())!);
	expect(result.pages).toBeGreaterThan(1);
	expect(result.text).toContain(line);
	expect(result.text).toContain('99');
	expect(result.images).toBe(0);
	expect(context.pages()).toHaveLength(pagesBefore);
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
