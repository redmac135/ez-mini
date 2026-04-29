<script lang="ts">
	export let title: string;
	export let dismissible = true;
	export let onClose: () => void = () => {};

	const headingId = `modal-${Math.random().toString(36).slice(2, 10)}`;
</script>

{#if dismissible}
	<button class="modal-scrim" type="button" aria-label="Close dialog" on:click={onClose}></button>
{:else}
	<div class="modal-scrim" aria-hidden="true"></div>
{/if}

<div class="modal" role="dialog" aria-modal="true" aria-labelledby={headingId}>
	<h2 id={headingId}>{title}</h2>
	<div class="modal-body">
		<slot />
	</div>
	<div class="modal-actions">
		<slot name="actions" />
	</div>
</div>

<style>
	.modal-scrim {
		position: fixed;
		inset: 0;
		z-index: 30;
		border: 0;
		background: var(--color-scrim);
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 31;
		width: min(24rem, calc(100vw - 2rem));
		padding: var(--space-4);
		box-sizing: border-box;
		background: var(--color-panel);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		box-shadow: 0 18px 50px var(--color-shadow);
		transform: translate(-50%, -50%);
	}

	h2,
	.modal-body :global(p) {
		margin: 0;
	}

	h2 {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-normal);
	}

	.modal-body {
		margin-top: var(--space-2);
		font-size: var(--font-size-md);
		color: var(--color-muted);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
</style>
