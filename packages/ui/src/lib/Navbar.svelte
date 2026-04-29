<script lang="ts">
	export let visible = true;
</script>

<div class:visible class="navbar-shell">
	<div class="navbar">
		<slot />
	</div>
</div>

<style>
	.navbar-shell {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 20;
		padding: max(var(--space-3), env(safe-area-inset-top))
			max(var(--space-3), env(safe-area-inset-right)) 0
			max(var(--space-3), env(safe-area-inset-left));
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--duration-normal) var(--ease-standard);
	}

	.navbar-shell.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.navbar {
		position: relative;
		width: 100%;
		box-sizing: border-box;
		min-height: 2rem;
	}
</style>
