<script lang="ts">
	export let label = 'Menu';
	export let verticalOffset = '0.25rem';
</script>

<div
	class="floating-menu"
	role="menu"
	aria-label={label}
	style={`top: calc(100% + ${verticalOffset})`}
>
	<slot />
</div>

<style>
	.floating-menu {
		position: absolute;
		right: 0;
		z-index: 2;
		min-width: 8.5rem;
		padding: var(--space-1);
		background-color: var(--color-panel);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		box-shadow: 0 12px 30px var(--color-shadow);
		display: flex;
		flex-direction: column;
		font-size: var(--font-size-sm);
		color: var(--color-fg);
		transition: var(--theme-transition);
	}

	.floating-menu :global(button) {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		border: 0;
		border-radius: var(--radius-1);
		background-color: transparent;
		font: inherit;
		color: inherit;
		cursor: pointer;
		transition: var(--theme-transition);
	}

	.floating-menu :global(.menu-stat) {
		padding: var(--space-2) var(--space-3);
		color: var(--color-muted);
	}

	.floating-menu :global(button:hover) {
		background: var(--color-hover);
	}
</style>
