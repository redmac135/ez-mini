<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Icon from './Icon.svelte';
	const { Story } = defineMeta({ title: 'Components/Primitives/Icon', component: Icon });
	const names = [
		'archive-box',
		'bars-3',
		'calendar-days',
		'check',
		'chevron-left',
		'chevron-right',
		'ellipsis-horizontal',
		'pencil-square',
		'plus',
		'trash',
		'x-mark'
	] as const;
</script>

<Story name="Icon set">
	{#snippet template()}
		<div class="icons">
			{#each names as name (name)}<div><Icon {name} /><code>{name}</code></div>{/each}
		</div>
	{/snippet}
</Story>

<style>
	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
		gap: var(--space-3);
		color: var(--color-fg);
	}
	.icons div {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	code {
		font-size: var(--font-size-xs);
	}
</style>
