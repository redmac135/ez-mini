<script lang="ts">
	export let variant: 'ghost' | 'primary' | 'danger' = 'ghost';
	export let size: 'sm' | 'md' | 'icon' = 'md';
	export let type: 'button' | 'submit' | 'reset' = 'button';
	export let disabled = false;
</script>

<button
	class:primary={variant === 'primary'}
	class:danger={variant === 'danger'}
	class:icon={size === 'icon'}
	class:small={size === 'sm'}
	{type}
	{disabled}
	on:click
>
	<slot />
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
		border-radius: var(--radius-round);
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
