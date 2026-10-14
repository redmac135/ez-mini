<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CalendarDayCell from './CalendarDayCell.svelte';
	const { Story } = defineMeta({
		title: 'Apps/ez-repeat/Components/Calendar Day Cell',
		component: CalendarDayCell
	});
	const day = { dateKey: '2026-10-14', day: 14, score: 0.72, isToday: true, isSelected: true };
</script>

<Story name="Today, selected, and activity">
	{#snippet template()}<div class="cell">
			<CalendarDayCell {day} onSelect={() => {}} />
		</div>{/snippet}
</Story>

<style>
	.cell {
		width: 4rem;
	}
</style>
