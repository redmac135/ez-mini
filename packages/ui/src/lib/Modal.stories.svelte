<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Modal from './Modal.svelte';
	const { Story } = defineMeta({ title: 'Components/Patterns/Modal', component: Modal });
</script>

<Story name="Basic dialog" args={{ title: 'Rename page' }}>
	{#snippet template(args)}
		<Modal {...args} onClose={() => {}}
			><p>Choose a clear title for this page.</p>
			<svelte:fragment slot="actions"
				><Button>Cancel</Button><Button variant="primary">Save</Button></svelte:fragment
			></Modal
		>
	{/snippet}
</Story>
