<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	const { Story } = defineMeta({ title: 'Components/Primitives/Button', component: Button });
</script>

<Story name="Variants and sizes">
	{#snippet template()}
		<div class="row">
			<Button>Ghost</Button><Button variant="primary">Primary</Button><Button variant="danger"
				>Danger</Button
			>
			<Button size="sm">Small</Button><Button size="icon" ariaLabel="More actions">•••</Button>
			<Button disabled>Disabled</Button>
		</div>
	{/snippet}
</Story>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
</style>
