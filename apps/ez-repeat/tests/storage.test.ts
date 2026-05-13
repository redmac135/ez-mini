import test from 'node:test';
import assert from 'node:assert/strict';
import { RepeatStorage } from '../src/lib/repeat/storage.ts';

test('memory storage seeds mock data and persists session mutations', async () => {
	RepeatStorage.resetForTests();
	await RepeatStorage.resetWithMockData();
	const seeded = await RepeatStorage.loadSnapshot();

	assert.ok(seeded.habits.length > 0);

	await RepeatStorage.addHabit({
		id: 'habit-test',
		userId: 'anonymous',
		title: 'Test habit',
		targetCount: 1,
		recurrence: { type: 'days', interval: 1 },
		createdAt: '2026-05-12T00:00:00.000',
		archivedAt: null,
		deletedAt: null
	});
	await RepeatStorage.addCompletion({
		id: 'completion-test',
		userId: 'anonymous',
		habitId: 'habit-test',
		completedAt: '2026-05-12'
	});

	const updated = await RepeatStorage.loadSnapshot();
	assert.equal(updated.habits.some((habit) => habit.id === 'habit-test'), true);
	assert.equal(updated.completions.some((completion) => completion.id === 'completion-test'), true);

	await RepeatStorage.deleteHabit('habit-test');
	const deleted = await RepeatStorage.loadSnapshot();
	assert.equal(deleted.habits.some((habit) => habit.id === 'habit-test'), false);
	assert.equal(deleted.completions.some((completion) => completion.habitId === 'habit-test'), false);
});
