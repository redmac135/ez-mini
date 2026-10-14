<script lang="ts">
	import { onMount, tick } from 'svelte';

	export let label = 'Menu';
	export let verticalOffset = '0.25rem';
	export let onDismiss: () => void = () => {};

	let menu: HTMLDivElement | null = null;
	let alignLeft = false;

	async function updateAlignment() {
		await tick();
		if (!menu || typeof window === 'undefined') {
			return;
		}

		const parentRect = menu.parentElement?.getBoundingClientRect();
		if (!parentRect) {
			return;
		}

		const menuWidth = menu.offsetWidth;
		const rightAlignedLeft = parentRect.right - menuWidth;
		const leftAlignedRight = parentRect.left + menuWidth;
		alignLeft = rightAlignedLeft < 8 && leftAlignedRight <= window.innerWidth - 8;
	}

	onMount(() => {
		void updateAlignment();
		window.addEventListener('resize', updateAlignment);

		function handlePointerDown(event: PointerEvent) {
			const target = event.target;
			const anchor = menu?.parentElement;
			if (target instanceof Node && anchor?.contains(target)) return;
			onDismiss();
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') onDismiss();
		}

		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('resize', updateAlignment);
			document.removeEventListener('pointerdown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div
	bind:this={menu}
	class:align-left={alignLeft}
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
		max-width: calc(100vw - 1rem);
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

	.floating-menu.align-left {
		right: auto;
		left: 0;
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
		background-color: var(--color-hover);
	}

	.floating-menu :global(button:focus-visible) {
		background-color: var(--color-hover);
		outline: 2px solid var(--color-border);
		outline-offset: -2px;
	}
</style>
