<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HabitList from './HabitList.svelte';
	const { Story } = defineMeta({
		title: 'Apps/ez-repeat/Components/Habit List',
		component: HabitList
	});
	const habit = {
		id: 'read',
		userId: 'demo',
		title: 'Read a few pages',
		targetCount: 1,
		recurrence: { type: 'days', interval: 1 } as const,
		replacesHabitId: null,
		createdAt: '',
		updatedAt: '',
		archivedAt: null,
		deletedAt: null,
		lastSyncedAt: null
	};
	const progress = [
		{ habit, count: 0, target: 1, ratio: 0, complete: false },
		{
			habit: { ...habit, id: 'stretch', title: 'Stretch' },
			count: 1,
			target: 1,
			ratio: 1,
			complete: true
		}
	];
</script>

<Story name="Empty and populated">
	{#snippet template()}<div class="lists"><HabitList /><HabitList {progress} /></div>{/snippet}
</Story>

<style>
	.lists {
		width: min(32rem, 82vw);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		font-family: var(--font-family-mono);
	}
</style>
