<script lang="ts">
	import HabitRow from './HabitRow.svelte';
	import type { HabitProgress } from '$lib/repeat/types';

	export let progress: HabitProgress[] = [];
	export let editMode = false;
	export let onComplete: (progress: HabitProgress) => void = () => {};
	export let onUndo: (progress: HabitProgress) => void = () => {};
	export let onArchive: (progress: HabitProgress) => void = () => {};
	export let onDelete: (progress: HabitProgress) => void = () => {};
</script>

<div class="habit-list">
	{#each progress as item (item.habit.id)}
		<HabitRow
			progress={item}
			{editMode}
			{onComplete}
			{onUndo}
			{onArchive}
			{onDelete}
		/>
	{/each}
</div>

<style>
	.habit-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
	}
</style>
