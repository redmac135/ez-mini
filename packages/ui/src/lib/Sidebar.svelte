<script lang="ts">
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	export let open = false;
	export let label = 'Navigation';
	export let mobileFullScreen = false;
	export let inert = false;
	export let ariaHidden = false;
	export let closeLabel = 'Close navigation';
	export let onClose: () => void = () => {};
</script>

<aside
	class:open
	class:mobileFullScreen
	class="sidebar"
	aria-label={label}
	aria-hidden={ariaHidden}
	{inert}
>
	{#if open}
		<Button size="icon" ariaLabel={closeLabel} on:click={onClose}>
			<Icon name="x-mark" />
		</Button>
	{/if}
	<slot />
</aside>

<style>
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 25;
		width: min(18rem, 82vw);
		padding: calc(var(--space-8) + var(--space-1)) var(--space-4) var(--space-4);
		box-sizing: border-box;
		background-color: var(--color-panel);
		border-right: 1px solid var(--color-border);
		transform: translateX(-100%);
		transition:
			transform var(--duration-normal) var(--ease-standard),
			var(--theme-transition);
	}

	.sidebar.open {
		transform: translateX(0);
	}

	.sidebar > :global(button:first-child) {
		position: absolute;
		top: max(var(--space-3), env(safe-area-inset-top));
		left: max(var(--space-3), env(safe-area-inset-left));
		z-index: 1;
	}

	@media (max-width: 720px) {
		.sidebar.mobileFullScreen {
			width: 100vw;
		}
	}
</style>
