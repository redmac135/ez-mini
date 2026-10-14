<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import AccountLoading from './AccountLoading.svelte';

	const { Story } = defineMeta({
		title: 'Components/Patterns/Account Loading',
		component: AccountLoading,
		parameters: { layout: 'fullscreen' }
	});
</script>

<script lang="ts">
	let canceling = false;

	function cancelSwitch() {
		canceling = true;
	}
</script>

<Story
	name="Fast switch hides loading controls"
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('dialog', { name: 'Switching account' })).toBeVisible();
		await expect(
			canvas.queryByRole('status', { name: 'Loading account data' })
		).not.toBeInTheDocument();
		await expect(canvas.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
	}}
>
	{#snippet template()}
		<AccountLoading {canceling} onCancel={cancelSwitch} />
	{/snippet}
</Story>

<Story
	name="Slow switch reveals a minimal cancel action"
	play={async ({ canvas, userEvent }) => {
		const dialog = canvas.getByRole('dialog', { name: 'Switching account' });
		await expect(dialog).toBeVisible();
		await expect(
			canvas.queryByRole('status', { name: 'Loading account data' })
		).not.toBeInTheDocument();
		await expect(canvas.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
		await new Promise((resolve) => window.setTimeout(resolve, 1100));
		await expect(canvas.getByRole('status', { name: 'Loading account data' })).toBeVisible();
		const cancel = canvas.getByRole('button', { name: 'Cancel' });
		await expect(cancel).toBeVisible();
		await expect(window.getComputedStyle(cancel).borderTopWidth).toBe('0px');
		await userEvent.click(cancel);
		await expect(canvas.getByRole('button', { name: 'Canceling…' })).toBeDisabled();
	}}
>
	{#snippet template()}
		<AccountLoading {canceling} onCancel={cancelSwitch} />
	{/snippet}
</Story>
