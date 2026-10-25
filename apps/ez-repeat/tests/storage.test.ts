import test from 'node:test';
import assert from 'node:assert/strict';
import { RepeatStorage } from '../src/lib/repeat/storage.ts';

test('memory storage persists session mutations', async () => {
	RepeatStorage.resetForTests();
	const seeded = await RepeatStorage.loadSnapshot('anonymous');

	assert.deepEqual(seeded, { habits: [], completions: [] });

	await RepeatStorage.addHabit({
		id: 'habit-test',
		userId: 'anonymous',
		title: 'Test habit',
		targetCount: 1,
		recurrence: { type: 'days', interval: 1 },
		createdAt: '2026-05-12T00:00:00.000',
		updatedAt: '2026-05-12T00:00:00.000',
		archivedAt: null,
		deletedAt: null,
		replacesHabitId: null,
		lastSyncedAt: null
	});
	for (let count = 0; count < 5; count += 1) {
		await RepeatStorage.incrementCompletion({
			userId: 'anonymous',
			habitId: 'habit-test',
			completedOn: '2026-05-12',
			count: 1,
			createdAt: '2026-05-12T00:00:00.000',
			updatedAt: '2026-05-12T00:00:00.000',
			lastSyncedAt: null
		});
	}

	const updated = await RepeatStorage.loadSnapshot('anonymous');
	assert.equal(
		updated.habits.some((habit) => habit.id === 'habit-test'),
		true
	);
	assert.equal(
		updated.completions.find(
			(completion) => completion.habitId === 'habit-test' && completion.completedOn === '2026-05-12'
		)?.count,
		5
	);

	await RepeatStorage.decrementCompletion('habit-test', '2026-05-12', '2026-05-13T00:00:00.000');
	const undone = await RepeatStorage.loadSnapshot('anonymous');
	assert.equal(undone.completions[0]?.count, 4);

	await RepeatStorage.deleteHabit('habit-test', '2026-05-13T00:00:00.000');
	const deleted = await RepeatStorage.loadSnapshot('anonymous');
	assert.equal(
		deleted.habits.some((habit) => habit.id === 'habit-test' && habit.deletedAt !== null),
		true
	);
});
