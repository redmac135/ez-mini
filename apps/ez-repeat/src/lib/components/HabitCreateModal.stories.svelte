<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HabitCreateModal from './HabitCreateModal.svelte';
	const { Story } = defineMeta({
		title: 'Apps/ez-repeat/Components/Habit Create Modal',
		component: HabitCreateModal
	});
</script>

<Story
	name="Create habit"
	args={{
		initialValue: 'morning stretch twice a day',
		disclaimer: 'Describe a habit in plain language, then adjust its schedule.'
	}}
>
	{#snippet template(args)}<HabitCreateModal
			{...args}
			onCancel={() => {}}
			onCreate={() => {}}
		/>{/snippet}
</Story>

<Story
	name="Edit existing habit"
	args={{ title: 'Edit habit', submitLabel: 'Save', initialValue: 'Read every day' }}
>
	{#snippet template(args)}<HabitCreateModal
			{...args}
			onCancel={() => {}}
			onCreate={() => {}}
		/>{/snippet}
</Story>
