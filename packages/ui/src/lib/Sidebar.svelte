<script lang="ts">
	export let open = false;
	export let label = 'Navigation';
	export let mobileFullScreen = false;
</script>

<aside class:open class:mobileFullScreen class="sidebar" aria-label={label}>
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

	@media (max-width: 720px) {
		.sidebar.mobileFullScreen {
			width: 100vw;
		}
	}
</style>
