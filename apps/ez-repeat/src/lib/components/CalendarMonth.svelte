<script lang="ts">
	import CalendarDayCell from './CalendarDayCell.svelte';
	import type { CalendarMonth } from '$lib/repeat/calendar';

	export let month: CalendarMonth;
	export let onSelectDate: (dateKey: string) => void = () => {};

	$: blanks = Array.from({ length: month.leadingBlanks }, (_value, index) => index);
</script>

<section class="calendar-month" data-year={month.year} data-month={month.key}>
	<h2>{month.label}</h2>
	<div class="month-grid" aria-label={`${month.label} ${month.year}`}>
		{#each blanks as index (index)}
			<div class="day-placeholder" aria-hidden="true"></div>
		{/each}
		{#each month.days as day (day.dateKey)}
			<CalendarDayCell {day} onSelect={onSelectDate} />
		{/each}
	</div>
</section>

<style>
	.calendar-month {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	h2 {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-normal);
		line-height: var(--line-height-tight);
	}

	.month-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--space-1);
	}

	.day-placeholder {
		aspect-ratio: 1;
	}
</style>
