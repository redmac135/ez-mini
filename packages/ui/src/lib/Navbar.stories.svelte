<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Navbar from './Navbar.svelte';
	const { Story } = defineMeta({ title: 'Components/Layouts/Navbar', component: Navbar });
</script>

<Story name="Visible and hidden">
	{#snippet template()}
		<div class="stage">
			<Navbar visible><Button>Menu</Button></Navbar>
			<p>Visible navigation chrome</p>
			<Navbar visible={false}><Button>Hidden</Button></Navbar>
		</div>
	{/snippet}
</Story>

<style>
	.stage {
		position: relative;
		width: min(34rem, 80vw);
		height: 7rem;
		padding: var(--space-5);
		border: 1px solid var(--color-border);
		color: var(--color-fg);
		font-family: var(--font-family-mono);
	}
</style>
