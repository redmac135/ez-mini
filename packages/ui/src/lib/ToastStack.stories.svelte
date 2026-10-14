<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import ToastStack from './ToastStack.svelte';
	const { Story } = defineMeta({ title: 'Components/Patterns/Toast Stack', component: ToastStack });
	const initialNotices = [
		{ id: 1, message: 'Changes saved on this device.' },
		{ id: 2, message: 'Your account is back in sync.' }
	];
</script>

<script lang="ts">
	let notices = [...initialNotices];

	function dismiss(id: number) {
		notices = notices.filter((notice) => notice.id !== id);
	}
</script>

<Story
	name="Stacked notices can be dismissed"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Changes saved on this device.' }));
		await expect(canvas.queryByText('Changes saved on this device.')).not.toBeInTheDocument();
	}}
>
	{#snippet template()}<ToastStack {notices} onDismiss={dismiss} />{/snippet}
</Story>
