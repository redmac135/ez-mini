<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ToastStack from './ToastStack.svelte';
	const { Story } = defineMeta({ title: 'Components/Patterns/Toast Stack', component: ToastStack });
	const notices = [
		{ id: 1, message: 'Changes saved on this device.' },
		{ id: 2, message: 'Your account is back in sync.' }
	];
</script>

<Story name="Stacked notices" args={{ notices }}>
	{#snippet template(args)}<ToastStack {...args} onDismiss={() => {}} />{/snippet}
</Story>
