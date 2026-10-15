<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'ghost',
		size = 'md',
		type = 'button',
		disabled = false,
		ariaLabel = '',
		ariaHaspopup = undefined,
		ariaExpanded = undefined,
		onclick,
		children
	}: {
		variant?: 'ghost' | 'primary' | 'danger';
		size?: 'sm' | 'md' | 'icon';
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		ariaLabel?: string;
		ariaHaspopup?: 'menu' | 'dialog' | 'listbox' | 'tree' | 'grid' | boolean;
		ariaExpanded?: boolean;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	} = $props();
</script>

<button
	class:primary={variant === 'primary'}
	class:danger={variant === 'danger'}
	class:icon={size === 'icon'}
	class:small={size === 'sm'}
	{type}
	{disabled}
	aria-label={ariaLabel || undefined}
	aria-haspopup={ariaHaspopup}
	aria-expanded={ariaExpanded}
	{onclick}
>
	{@render children?.()}
</button>

<style>
	button {
		border: 0;
		background: transparent;
		font: inherit;
		color: inherit;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-1);
		cursor: pointer;
		transition: var(--theme-transition);
	}

	button:hover {
		background: var(--color-hover);
	}

	button.primary {
		background: var(--color-fg);
		color: var(--color-bg);
	}

	button.primary:hover {
		background: var(--color-fg);
		opacity: 0.9;
	}

	button.danger {
		background: var(--color-danger);
		color: var(--color-on-danger);
	}

	button.danger:hover {
		background: color-mix(in srgb, var(--color-danger), black 10%);
	}

	button.icon {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: var(--radius-1);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	button.small {
		padding: var(--space-1) var(--space-2);
	}

	button:disabled {
		cursor: default;
		opacity: 0.55;
	}
</style>
