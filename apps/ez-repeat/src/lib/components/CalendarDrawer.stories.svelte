<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CalendarDrawer from './CalendarDrawer.svelte';
	const { Story } = defineMeta({
		title: 'Apps/ez-repeat/Components/Calendar Drawer',
		component: CalendarDrawer
	});
</script>

<Story
	name="Open calendar"
	args={{
		open: true,
		todayDate: '2026-10-14',
		selectedDate: '2026-10-14',
		habits: [],
		completions: []
	}}
>
	{#snippet template(args)}<CalendarDrawer {...args} onSelectDate={() => {}} />{/snippet}
</Story>
