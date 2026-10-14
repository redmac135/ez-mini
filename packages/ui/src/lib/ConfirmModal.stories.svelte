<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import ConfirmModal from './ConfirmModal.svelte';
	const { Story } = defineMeta({
		title: 'Components/Patterns/Confirm Modal',
		component: ConfirmModal
	});
</script>

<script lang="ts">
	let isOpen = true;

	function close() {
		isOpen = false;
	}
</script>

<Story
	name="Confirming closes the dialog"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Delete' }));
		await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
	}}
>
	{#snippet template()}
		{#if isOpen}
			<ConfirmModal
				title="Delete habit"
				message="Delete this habit and its history?"
				actionLabel="Delete"
				danger
				onCancel={close}
				onConfirm={close}
			/>
		{/if}
	{/snippet}
</Story>
