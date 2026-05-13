import {
	addDays,
	compareDateKeys,
	daysBetween,
	getWeekday,
	startOfWeek
} from './dates';
import type { Completion, Habit, HabitProgress } from './types';

export function isHabitVisibleOnDate(habit: Habit, dateKey: string) {
	const createdDateKey = habit.createdAt.slice(0, 10);
	if (habit.deletedAt || compareDateKeys(dateKey, createdDateKey) < 0) {
		return false;
	}

	if (habit.archivedAt && compareDateKeys(dateKey, habit.archivedAt.slice(0, 10)) >= 0) {
		return false;
	}

	if (habit.recurrence.type !== 'daysOfWeek') {
		return true;
	}

	if (!habit.recurrence.days.includes(getWeekday(dateKey))) {
		return false;
	}

	if (habit.recurrence.interval <= 1) {
		return true;
	}

	const createdWeekStart = startOfWeek(createdDateKey);
	const viewedWeekStart = startOfWeek(dateKey);
	const weeks = Math.floor(daysBetween(createdWeekStart, viewedWeekStart) / 7);
	return weeks >= 0 && weeks % habit.recurrence.interval === 0;
}

export function getCompletionWindow(habit: Habit, dateKey: string) {
	if (habit.recurrence.type === 'days') {
		return {
			startDate: addDays(dateKey, -(Math.max(1, habit.recurrence.interval) - 1)),
			endDate: dateKey
		};
	}

	if (habit.recurrence.type === 'weeks') {
		return {
			startDate: addDays(startOfWeek(dateKey), -(Math.max(1, habit.recurrence.interval) - 1) * 7),
			endDate: dateKey
		};
	}

	return {
		startDate: dateKey,
		endDate: dateKey
	};
}

export function countCompletionsForHabit(
	habit: Habit,
	completions: Completion[],
	dateKey: string
) {
	const window = getCompletionWindow(habit, dateKey);
	return completions.filter(
		(completion) =>
			completion.habitId === habit.id &&
			completion.completedOn >= window.startDate &&
			completion.completedOn <= window.endDate
	).reduce((sum, completion) => sum + Math.max(0, completion.count), 0);
}

export function buildHabitProgress(
	habits: Habit[],
	completions: Completion[],
	dateKey: string
): HabitProgress[] {
	return habits
		.filter((habit) => isHabitVisibleOnDate(habit, dateKey))
		.map((habit) => {
			const target = Math.max(1, habit.targetCount);
			const count = Math.min(target, countCompletionsForHabit(habit, completions, dateKey));
			const ratio = count / target;
			return {
				habit,
				count,
				target,
				ratio,
				complete: ratio >= 1
			};
		});
}

export function getCompletionScore(progress: HabitProgress[]) {
	if (progress.length === 0) {
		return 0;
	}

	return progress.reduce((sum, item) => sum + item.ratio, 0) / progress.length;
}
