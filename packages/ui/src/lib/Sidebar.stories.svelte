<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Sidebar from './Sidebar.svelte';
	const { Story } = defineMeta({ title: 'Components/Layouts/Sidebar', component: Sidebar });
</script>

<Story name="Open navigation" args={{ open: true }}>
	{#snippet template(args)}
		<Sidebar {...args}
			><h2>Navigation</h2>
			<Button>Documents</Button><Button>Settings</Button></Sidebar
		>
	{/snippet}
</Story>
