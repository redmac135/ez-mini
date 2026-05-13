import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildHabitProgress,
	getCompletionScore,
	isHabitVisibleOnDate
} from '../src/lib/repeat/recurrence.ts';
import type { Completion, Habit } from '../src/lib/repeat/types.ts';

const baseHabit: Habit = {
	id: 'habit-1',
	userId: 'anonymous',
	title: 'Stretch',
	targetCount: 2,
	recurrence: { type: 'days', interval: 1 },
	createdAt: '2026-05-10T00:00:00.000',
	archivedAt: null,
	deletedAt: null
};

test('daily habits are visible after creation until archive date', () => {
	assert.equal(isHabitVisibleOnDate(baseHabit, '2026-05-09'), false);
	assert.equal(isHabitVisibleOnDate(baseHabit, '2026-05-10'), true);
	assert.equal(
		isHabitVisibleOnDate({ ...baseHabit, archivedAt: '2026-05-12T00:00:00.000' }, '2026-05-11'),
		true
	);
	assert.equal(
		isHabitVisibleOnDate({ ...baseHabit, archivedAt: '2026-05-12T00:00:00.000' }, '2026-05-12'),
		false
	);
});

test('daysOfWeek habits only appear on selected weekdays and interval weeks', () => {
	const habit: Habit = {
		...baseHabit,
		recurrence: { type: 'daysOfWeek', days: [1, 3], interval: 2 },
		createdAt: '2026-05-10T00:00:00.000'
	};

	assert.equal(isHabitVisibleOnDate(habit, '2026-05-11'), true);
	assert.equal(isHabitVisibleOnDate(habit, '2026-05-12'), false);
	assert.equal(isHabitVisibleOnDate(habit, '2026-05-18'), false);
	assert.equal(isHabitVisibleOnDate(habit, '2026-05-25'), true);
});

test('completion progress is capped and score averages visible habits', () => {
	const completions: Completion[] = [
		{ id: 'c1', userId: 'anonymous', habitId: 'habit-1', completedAt: '2026-05-12' },
		{ id: 'c2', userId: 'anonymous', habitId: 'habit-1', completedAt: '2026-05-12' },
		{ id: 'c3', userId: 'anonymous', habitId: 'habit-1', completedAt: '2026-05-12' },
		{ id: 'c4', userId: 'anonymous', habitId: 'habit-2', completedAt: '2026-05-12' }
	];
	const otherHabit: Habit = { ...baseHabit, id: 'habit-2', targetCount: 2 };
	const progress = buildHabitProgress([baseHabit, otherHabit], completions, '2026-05-12');

	assert.equal(progress[0]?.count, 2);
	assert.equal(progress[0]?.complete, true);
	assert.equal(progress[1]?.ratio, 0.5);
	assert.equal(getCompletionScore(progress), 0.75);
});

test('multi-day windows include previous days', () => {
	const habit: Habit = { ...baseHabit, targetCount: 1, recurrence: { type: 'days', interval: 2 } };
	const progress = buildHabitProgress(
		[habit],
		[{ id: 'c1', userId: 'anonymous', habitId: habit.id, completedAt: '2026-05-11' }],
		'2026-05-12'
	);

	assert.equal(progress[0]?.complete, true);
});
