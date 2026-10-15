<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		selected = false,
		disabled = false,
		type = 'button',
		ariaLabel = '',
		onclick,
		children
	}: {
		selected?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		ariaLabel?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	} = $props();
</script>

<button
	class:selected
	{disabled}
	{type}
	aria-label={ariaLabel || undefined}
	aria-pressed={selected}
	{onclick}
>
	{@render children?.()}
</button>

<style>
	button {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-round);
		background: var(--color-panel);
		color: var(--color-muted);
		cursor: pointer;
		font: inherit;
		font-size: var(--font-size-sm);
		line-height: var(--line-height-tight);
		padding: var(--space-1) var(--space-3);
		transition: var(--theme-transition);
		white-space: nowrap;
	}

	button:hover {
		background: var(--color-hover);
		color: var(--color-fg);
	}

	button.selected {
		border-color: color-mix(in srgb, var(--color-fg), transparent 70%);
		color: var(--color-fg);
	}

	button:disabled {
		cursor: default;
		opacity: 0.55;
	}
</style>
