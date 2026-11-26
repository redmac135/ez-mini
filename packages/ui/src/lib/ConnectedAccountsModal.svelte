<script lang="ts">
	import Button from './Button.svelte';
	import ConfirmModal from './ConfirmModal.svelte';
	import Modal from './Modal.svelte';
	type OAuthProvider = 'github' | 'azure';
	type AuthIdentity = {
		id: string;
		provider: string;
		displayName: string | null;
		email: string | null;
		createdAt: string | null;
	};

	export let identities: AuthIdentity[] = [];
	export let primaryEmail: string | null = null;
	export let onChangeEmail: ((email: string) => Promise<void>) | undefined = undefined;
	export let loading = false;
	export let loadError = '';
	export let busyProvider: OAuthProvider | null = null;
	export let busyIdentityId: string | null = null;
	export let displayName = '';
	export let displayNameDraft = '';
	export let displayNameSaving = false;
	export let onExportData: (() => void) | undefined = undefined;
	export let exportDataDisabled = false;
	export let onClose: () => void = () => {};
	export let onRetry: () => void = () => {};
	export let onConnect: (provider: OAuthProvider) => void = () => {};
	export let onUnlink: (identityId: string) => void = () => {};
	export let onDisplayNameInput: (value: string) => void = () => {};
	export let onSaveDisplayName: () => void = () => {};
	export let onCancelDisplayName: () => void = () => {};

	let pendingUnlink: AuthIdentity | null = null;
	let emailDialogOpen = false;
	let emailDraft = '';
	let emailError = '';
	let emailSending = false;
	let emailSent = false;

	async function submitEmailChange() {
		if (!onChangeEmail || emailSending) return;
		emailSending = true;
		emailError = '';
		try {
			await onChangeEmail(emailDraft.trim());
			emailSent = true;
		} catch (error) {
			emailError = error instanceof Error ? error.message : 'Unable to change email. Please retry.';
		} finally {
			emailSending = false;
		}
	}
	$: githubIdentity = identities.find((identity) => identity.provider === 'github');
	$: microsoftIdentity = identities.find((identity) => identity.provider === 'azure');
	$: usableIdentityCount = identities.filter((identity) =>
		['email', 'github', 'azure'].includes(identity.provider)
	).length;

	function getProviderName(provider: string) {
		if (provider === 'azure') return 'Microsoft';
		if (provider === 'email') return 'Email';
		if (provider === 'github') return 'GitHub';
		return provider.slice(0, 1).toUpperCase() + provider.slice(1);
	}
</script>

<Modal title="Profile" {onClose}>
	{#if loadError}
		<div class="load-error" role="alert">
			<p>{loadError}</p>
			<Button size="sm" onclick={onRetry}>Retry</Button>
		</div>
	{/if}
	<section class="profile-section" aria-labelledby="display-name-heading">
		<h3 id="display-name-heading">Display name</h3>
		<input
			id="account-display-name"
			aria-labelledby="display-name-heading"
			aria-invalid={!displayNameDraft.trim()}
			class:invalid={!displayNameDraft.trim()}
			value={displayNameDraft}
			maxlength="80"
			autocomplete="nickname"
			disabled={loading || displayNameSaving}
			oninput={(event) => onDisplayNameInput(event.currentTarget.value)}
		/>
	</section>
	<section class="methods-section" aria-labelledby="login-methods-heading">
		<h3 id="login-methods-heading">Auth methods</h3>
		{#if loading}
			<p class="status" role="status">loading</p>
		{/if}
		<ul class="identity-list">
			<li>
				<div class="identity-copy">
					<strong>Email</strong>{#if primaryEmail}<span>{primaryEmail}</span>{/if}
				</div>
				<Button
					size="sm"
					disabled={loading || !onChangeEmail || busyProvider !== null || busyIdentityId !== null}
					onclick={() => {
						emailDraft = '';
						emailError = '';
						emailSent = false;
						emailDialogOpen = true;
					}}
				>
					{primaryEmail ? 'Change' : 'Connect'}
				</Button>
			</li>
			{#each [{ provider: 'github' as const, label: 'GitHub', identity: githubIdentity }, { provider: 'azure' as const, label: 'Microsoft', identity: microsoftIdentity }] as method (method.provider)}
				<li>
					<div class="identity-copy"><strong>{method.label}</strong></div>
					{#if method.identity}
						<Button
							size="sm"
							variant="danger"
							disabled={loading ||
								usableIdentityCount < 2 ||
								busyIdentityId !== null ||
								busyProvider !== null}
							onclick={() => (pendingUnlink = method.identity ?? null)}
						>
							{busyIdentityId === method.identity.id ? 'Disconnecting…' : 'Disconnect'}
						</Button>
					{:else}
						<Button
							size="sm"
							disabled={loading || busyProvider !== null || busyIdentityId !== null}
							onclick={() => onConnect(method.provider)}
						>
							{busyProvider === method.provider ? 'Connecting…' : 'Connect'}
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
	{#if onExportData}
		<section class="data-section" aria-labelledby="data-heading">
			<h3 id="data-heading">Data</h3>
			<Button size="sm" disabled={exportDataDisabled} onclick={onExportData}>Export data</Button>
		</section>
	{/if}
	<svelte:fragment slot="actions">
		<Button
			disabled={displayNameSaving || busyIdentityId !== null || busyProvider !== null}
			onclick={() => {
				onCancelDisplayName();
				onClose();
			}}>Cancel</Button
		>
		<Button
			variant="primary"
			disabled={loading ||
				displayNameSaving ||
				busyIdentityId !== null ||
				busyProvider !== null ||
				!displayNameDraft.trim() ||
				displayNameDraft.trim() === displayName}
			onclick={onSaveDisplayName}>{displayNameSaving ? 'Saving…' : 'Save'}</Button
		>
	</svelte:fragment>
</Modal>

{#if emailDialogOpen}
	<Modal
		title={primaryEmail ? 'Change email' : 'Connect email'}
		onClose={() => {
			if (!emailSending) emailDialogOpen = false;
		}}
	>
		{#if emailSent}
			<p>
				{primaryEmail
					? 'Confirm the links sent to both your current and new email addresses.'
					: 'Confirm the link sent to your email address.'}
			</p>
		{:else}
			<label class="email-label" for="new-account-email">Email address</label>
			<input
				id="new-account-email"
				class="email-input"
				type="email"
				autocomplete="email"
				bind:value={emailDraft}
				disabled={emailSending}
			/>
			{#if emailError}<p role="alert" class="email-error">{emailError}</p>{/if}
		{/if}
		<svelte:fragment slot="actions">
			<Button disabled={emailSending} onclick={() => (emailDialogOpen = false)}
				>{emailSent ? 'Done' : 'Cancel'}</Button
			>
			{#if !emailSent}<Button
					variant="primary"
					disabled={emailSending || !emailDraft.trim()}
					onclick={() => void submitEmailChange()}
					>{emailSending ? 'Sending…' : 'Send confirmation'}</Button
				>{/if}
		</svelte:fragment>
	</Modal>
{/if}

{#if pendingUnlink}
	<ConfirmModal
		title={`Disconnect ${getProviderName(pendingUnlink.provider)}?`}
		message="This login method will be removed from this account everywhere. You can still sign in with another login method."
		actionLabel="Disconnect"
		danger
		onCancel={() => (pendingUnlink = null)}
		onConfirm={() => {
			const identity = pendingUnlink;
			pendingUnlink = null;
			if (identity) onUnlink(identity.id);
		}}
	/>
{/if}

<style>
	.email-label {
		display: block;
		margin-bottom: var(--space-1);
	}
	.email-input {
		width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-bg);
		color: var(--color-fg);
		font: inherit;
	}
	.email-error {
		color: var(--color-danger);
	}
	.status {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--color-muted);
	}
	.load-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		color: var(--color-danger);
		font-size: var(--font-size-sm);
	}
	.load-error p {
		margin: 0;
	}
	.profile-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}
	.profile-section h3,
	.methods-section h3,
	.data-section h3 {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-normal);
		color: var(--color-fg);
	}
	.profile-section input {
		width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-bg);
		color: var(--color-fg);
		font: inherit;
	}
	.profile-section input:focus-visible {
		outline: 2px solid var(--color-fg);
		outline-offset: 2px;
	}
	.profile-section input.invalid {
		border-color: var(--color-danger);
	}
	.methods-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.data-section {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.identity-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 0;
		margin: 0;
	}
	.identity-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
	}
	.identity-list :global(button:not(.danger)) {
		background: var(--color-hover);
	}
	.identity-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.identity-copy strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
