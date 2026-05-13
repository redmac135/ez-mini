<script lang="ts">
	export let selected = false;
	export let disabled = false;
	export let type: 'button' | 'submit' | 'reset' = 'button';
	export let ariaLabel = '';
</script>

<button
	class:selected
	{disabled}
	{type}
	aria-label={ariaLabel || undefined}
	aria-pressed={selected}
	on:click
>
	<slot />
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
