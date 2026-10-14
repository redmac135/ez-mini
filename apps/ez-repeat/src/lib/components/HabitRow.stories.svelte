<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HabitRow from './HabitRow.svelte';
	const { Story } = defineMeta({
		title: 'Apps/ez-repeat/Components/Habit Row',
		component: HabitRow
	});
	const habit = {
		id: 'walk',
		userId: 'demo',
		title: 'Walk outside',
		targetCount: 2,
		recurrence: { type: 'days', interval: 1 } as const,
		replacesHabitId: null,
		createdAt: '',
		updatedAt: '',
		archivedAt: null,
		deletedAt: null,
		lastSyncedAt: null
	};
	const progress = { habit, count: 1, target: 2, ratio: 0.5, complete: false };
	const complete = { ...progress, count: 2, ratio: 1, complete: true };
</script>

<Story name="Progress states">
	{#snippet template()}<div class="rows">
			<HabitRow {progress} /><HabitRow progress={complete} /><HabitRow {progress} editMode />
		</div>{/snippet}
</Story>

<style>
	.rows {
		width: min(32rem, 82vw);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		font-family: var(--font-family-mono);
	}
</style>
