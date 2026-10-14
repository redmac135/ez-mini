<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CalendarMonth from './CalendarMonth.svelte';
	import { buildCalendarMonth } from '$lib/repeat/calendar';
	const { Story } = defineMeta({
		title: 'Apps/ez-repeat/Components/Calendar Month',
		component: CalendarMonth
	});
	const month = buildCalendarMonth('2026-10', [], [], '2026-10-14', '2026-10-14');
</script>

<Story name="October 2026">
	{#snippet template()}<div class="month">
			<CalendarMonth {month} onSelectDate={() => {}} />
		</div>{/snippet}
</Story>

<style>
	.month {
		width: min(22rem, 82vw);
		font-family: var(--font-family-mono);
	}
</style>
