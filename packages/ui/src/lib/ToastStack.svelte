<script lang="ts">
	import type { ToastNotice } from './toasts';

	export let toasts: ToastNotice[] = [];
	export let onDismiss: (id: number) => void = () => {};
</script>

{#if toasts.length > 0}
	<div class="toast-stack" aria-live="polite" aria-atomic="false">
		{#each toasts as toast (toast.id)}
			<button type="button" class="toast" on:click={() => onDismiss(toast.id)}>
				<span class="toast-message">{toast.message}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	.toast-stack {
		position: fixed;
		top: max(
			calc(var(--space-8) + var(--space-1)),
			calc(env(safe-area-inset-top) + var(--space-7))
		);
		right: max(var(--space-4), env(safe-area-inset-right));
		z-index: 40;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-3);
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		max-width: min(22rem, calc(100vw - 2rem));
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background-color: var(--color-panel);
		color: var(--color-fg);
		box-shadow: 0 18px 38px -24px var(--color-shadow);
		backdrop-filter: blur(12px);
		cursor: pointer;
		text-align: left;
		white-space: normal;
		font: inherit;
		font-family: inherit;
		appearance: none;
		-webkit-appearance: none;
		transition: var(--theme-transition);
	}

	.toast-message {
		min-width: 0;
		flex: 1;
		font-size: var(--font-size-md);
		line-height: var(--line-height-tight);
	}
</style>
