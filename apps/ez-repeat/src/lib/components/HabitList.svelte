<script lang="ts">
	import HabitRow from './HabitRow.svelte';
	import type { HabitProgress } from '$lib/repeat/types';

	export let progress: HabitProgress[] = [];
	export let editMode = false;
	export let onComplete: (progress: HabitProgress) => void = () => {};
	export let onUndo: (progress: HabitProgress) => void = () => {};
	export let onEdit: (progress: HabitProgress) => void = () => {};
	export let onArchive: (progress: HabitProgress) => void = () => {};
	export let onDelete: (progress: HabitProgress) => void = () => {};
</script>

<div class="habit-list">
	{#if progress.length === 0}
		<div class="empty-habit">No habits for today</div>
	{:else}
		{#each progress as item (item.habit.id)}
			<HabitRow progress={item} {editMode} {onComplete} {onUndo} {onEdit} {onArchive} {onDelete} />
		{/each}
	{/if}
</div>

<style>
	.habit-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
	}

	.empty-habit {
		min-height: 3.25rem;
		box-sizing: border-box;
		border: 1px dotted color-mix(in srgb, var(--color-fg), transparent 55%);
		border-radius: var(--radius-2);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-muted);
		font-size: var(--font-size-lg);
		text-align: center;
		padding: var(--space-3) var(--space-4);
	}
</style>
