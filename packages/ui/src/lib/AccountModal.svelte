<script lang="ts" context="module">
	export interface AccountEntry {
		sessionId: string;
		userId: string;
		email: string | null;
		username: string;
		active: boolean;
	}
</script>

<script lang="ts">
	import Button from './Button.svelte';
	import Modal from './Modal.svelte';

	export let accounts: AccountEntry[] = [];
	export let message = '';
	export let busy = false;
	export let syncBusy = false;
	export let busySessionId: string | null = null;
	export let onClose: () => void = () => {};
	export let onSelectAccount: (sessionId: string) => void = () => {};
	export let onLogoutAccount: (sessionId: string, userId: string) => void = () => {};
	export let onAddAccount: () => void = () => {};

	function getAccountInitial(account: AccountEntry) {
		return account.username.trim().slice(0, 1).toUpperCase() || '?';
	}
</script>

<Modal title="Accounts" {onClose}>
	<div class="account-list">
		{#each accounts as account (account.sessionId)}
			<div class:active={account.active} class="account-row">
				<button
					class="account-select"
					type="button"
					disabled={busy || syncBusy || busySessionId !== null}
					on:click={() => onSelectAccount(account.sessionId)}
				>
					<span class="account-avatar" aria-hidden="true">
						{getAccountInitial(account)}
					</span>
					<span class="account-copy">
						<span class="account-name">{account.username}</span>
						{#if account.email && account.email !== account.username}
							<span class="account-meta">{account.email}</span>
						{/if}
					</span>
				</button>
				<button
					class="account-remove"
					type="button"
					aria-label={`Logout ${account.username}`}
					disabled={busy || syncBusy || busySessionId !== null}
					on:click={() => onLogoutAccount(account.sessionId, account.userId)}
				>
					x
				</button>
			</div>
		{/each}
	</div>
	{#if message}
		<p class="auth-message">{message}</p>
	{/if}
	<svelte:fragment slot="actions">
		<div class="account-actions">
			<Button size="sm" on:click={onAddAccount}>Sign into another account</Button>
		</div>
	</svelte:fragment>
</Modal>

<style>
	.auth-message {
		margin: var(--space-2) 0 0;
		font-size: var(--font-size-md);
		color: var(--color-muted);
	}

	.account-list {
		max-height: min(18rem, 55vh);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-right: var(--space-1);
	}

	.account-row {
		display: grid;
		grid-template-columns: 1fr 2rem;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background-color: var(--color-bg);
		transition: var(--theme-transition);
	}

	.account-row.active {
		border-color: var(--color-fg);
		background-color: var(--color-hover);
	}

	.account-select,
	.account-remove {
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.account-select {
		min-width: 0;
		display: grid;
		grid-template-columns: 2rem 1fr;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		text-align: left;
	}

	.account-avatar {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-round);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-panel);
		border: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
		color: var(--color-fg);
		transition: var(--theme-transition);
	}

	.account-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.account-name,
	.account-meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account-name {
		font-size: var(--font-size-sm);
		color: var(--color-fg);
	}

	.account-meta {
		font-size: var(--font-size-xs);
		color: var(--color-muted);
	}

	.account-actions {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.account-remove {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-round);
		color: var(--color-muted);
	}

	.account-select:disabled,
	.account-remove:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
</style>
