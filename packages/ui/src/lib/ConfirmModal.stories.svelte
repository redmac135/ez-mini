<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ConfirmModal from './ConfirmModal.svelte';
	const { Story } = defineMeta({
		title: 'Components/Patterns/Confirm Modal',
		component: ConfirmModal
	});
</script>

<Story
	name="Destructive confirmation"
	args={{
		title: 'Delete habit',
		message: 'Delete this habit and its history?',
		actionLabel: 'Delete',
		danger: true
	}}
>
	{#snippet template(args)}<ConfirmModal
			{...args}
			onCancel={() => {}}
			onConfirm={() => {}}
		/>{/snippet}
</Story>
