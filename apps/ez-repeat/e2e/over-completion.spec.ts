import { expect, test } from 'playwright/test';

test.use({ baseURL: 'http://127.0.0.1:1352' });

test('weekly over-completions persist, cycle their shades, and leave calendar shading capped', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Add habit' })).toBeVisible();
	await page.evaluate(async () => {
		const now = new Date();
		const dateKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
		const createdAt = `${dateKey}T00:00:00.000`;
		const request = indexedDB.open('repeat', 3);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains('habits')) {
				const habits = database.createObjectStore('habits', { keyPath: 'id' });
				habits.createIndex('userId', 'userId');
				habits.createIndex('updatedAt', 'updatedAt');
			}
			if (database.objectStoreNames.contains('completions')) {
				database.deleteObjectStore('completions');
			}
			const completions = database.createObjectStore('completions', {
				keyPath: ['habitId', 'completedOn']
			});
			completions.createIndex('userId', 'userId');
			completions.createIndex('updatedAt', 'updatedAt');
			completions.createIndex('habitId', 'habitId');
			completions.createIndex('completedOn', 'completedOn');
			if (!database.objectStoreNames.contains('settings')) {
				database.createObjectStore('settings', { keyPath: 'key' });
			}
		};
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const transaction = database.transaction('habits', 'readwrite');
		transaction.objectStore('habits').put({
			id: 'over-completion-e2e',
			userId: 'anonymous',
			title: 'Over-completion demo',
			targetCount: 4,
			recurrence: { type: 'weeks', interval: 1 },
			replacesHabitId: null,
			createdAt,
			updatedAt: createdAt,
			archivedAt: null,
			deletedAt: null,
			lastSyncedAt: null
		});
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		database.close();
	});
	await page.reload();

	const row = page.locator('.habit-row').filter({ hasText: 'Over-completion demo' });
	const status = row.locator('.status');
	await expect(status).toHaveText('0/4');

	for (let count = 1; count <= 4; count += 1) {
		await row.click();
		await expect(status).toHaveText(`${count}/4`);
	}

	await page.locator('.drawer-toggle').click();
	const calendarFill = page.locator('.day-cell.today .cell-fill');
	await expect(calendarFill).toBeVisible();
	const goalCalendarShade = await calendarFill.evaluate(
		(element) => getComputedStyle(element).backgroundColor
	);
	await page.locator('.drawer-toggle').click();

	for (let count = 5; count <= 13; count += 1) {
		await row.click();
		if (count === 8 || count === 12) {
			await expect(status).toHaveText(`4(+${count - 4})/4`);
			await page.waitForTimeout(240);
		} else {
			await expect(status).toHaveText(`4(+${count - 4})/4`);
		}
		if (count === 9) {
			await expect(row).toHaveClass(/shade-reset/);
		}
		if (count === 13) {
			await expect(row).toHaveClass(/full-h-reset/);
		}
	}

	await expect(row).toHaveAttribute(
		'aria-label',
		'Over-completion demo, 13 completed, 9 over goal of 4'
	);
	await row.evaluate((element) => {
		for (let index = 0; index < 20; index += 1) {
			element.click();
		}
	});
	await expect(status).toHaveText('4(+29)/4');
	await expect(row).toHaveAttribute(
		'aria-label',
		'Over-completion demo, 33 completed, 29 over goal of 4'
	);
	await page.reload();
	await expect(status).toHaveText('4(+29)/4');
	await row.click({ button: 'right' });
	await expect(status).toHaveText('4(+28)/4');

	await page.locator('.drawer-toggle').click();
	await expect(calendarFill).toBeVisible();
	const overCalendarShade = await calendarFill.evaluate(
		(element) => getComputedStyle(element).backgroundColor
	);
	expect(overCalendarShade).toBe(goalCalendarShade);
});
