<script lang="ts">
	import { onMount } from 'svelte';
	import AccountModal from './AccountModal.svelte';
	import ConnectedAccountsModal from './ConnectedAccountsModal.svelte';
	import LoginModal from './LoginModal.svelte';
	import Modal from './Modal.svelte';
	type OAuthProvider = 'github' | 'azure';
	type AuthIdentity = {
		id: string;
		provider: string;
		displayName: string | null;
		email: string | null;
		createdAt: string | null;
	};

	interface AccountDialogSession {
		sessionId: string;
		userId: string;
		email: string | null;
		username: string;
		active: boolean;
	}

	interface AccountDialogState {
		sessions: AccountDialogSession[];
		authBusy: boolean;
		accountBusySessionId: string | null;
		authMessage: string;
		loginModalOpen: boolean;
		accountModalOpen: boolean;
		loginLookup: 'idle' | 'loading' | 'failed';
		loginStep: 'email' | 'otp';
		emailDraft: string;
		otpDraft: string;
		loginSubmitting: boolean;
		otpVerifying: boolean;
		otpShake: boolean;
		resendCooldownRemaining: number;
		oauthBusyProvider: OAuthProvider | null;
		connectedAccountsOpen: boolean;
		identities: AuthIdentity[];
		identitiesLoading: boolean;
		identityBusyId: string | null;
		displayName: string;
		displayNameDraft: string;
		displayNameSaving: boolean;
	}

	interface AccountDialogController {
		subscribe(run: (state: AccountDialogState) => void): () => void;
		openLoginFlow(): void;
		openLoginOrAccountList(): Promise<void>;
		closeLoginModal(): void;
		closeAccountModal(): void;
		submitLogin(email?: string): Promise<void>;
		verifyOtpCode(code: string): Promise<void>;
		resendOtpCode(): Promise<void>;
		backToEmail(): void;
		startOAuthSignIn(provider: OAuthProvider): void;
		closeConnectedAccounts(): void;
		connectOAuthProvider(provider: OAuthProvider): void;
		unlinkOAuthIdentity(identityId: string): Promise<void>;
		saveDisplayName(): Promise<void>;
		setDisplayNameDraft(value: string): void;
		cancelDisplayNameEdit(): void;
		selectAccountSession(sessionId: string): Promise<void>;
		useAnonymousAccount(): Promise<void>;
		logoutAccountSession(sessionId: string, userId: string): Promise<void>;
	}

	let {
		controller,
		syncBusy = false,
		onLogoutAccount
	}: {
		controller: AccountDialogController;
		syncBusy?: boolean;
		onLogoutAccount?: (sessionId: string, userId: string) => void;
	} = $props();

	let state = $state<AccountDialogState | null>(null);

	onMount(() => controller.subscribe((nextState) => (state = nextState)));
</script>

{#if state && (state.loginModalOpen || state.accountModalOpen)}
	<Modal
		title={state.loginLookup === 'loading'
			? 'Loading account'
			: state.loginLookup === 'failed'
				? 'Unable to load account'
				: state.accountModalOpen
					? 'Accounts'
					: 'Login'}
		onClose={state.accountModalOpen ? controller.closeAccountModal : controller.closeLoginModal}
	>
		{#if state.loginLookup === 'loading'}
			<div class="lookup-state" aria-busy="true">
				<div class="spinner" role="status" aria-label="Loading account"></div>
				<button class="lookup-action" type="button" onclick={controller.closeLoginModal}
					>Cancel</button
				>
			</div>
		{:else if state.loginLookup === 'failed'}
			<div class="lookup-state">
				<button
					class="retry"
					type="button"
					aria-label="Retry loading account"
					onclick={() => void controller.openLoginOrAccountList()}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M20 7v5h-5M4 17v-5h5m-3.1-3a7 7 0 0111.7-2L20 12M4 12l2.4 5a7 7 0 0011.7-2" />
					</svg>
				</button>
				<p class="lookup-error" role="alert">{state.authMessage}</p>
				<button class="lookup-action" type="button" onclick={controller.closeLoginModal}
					>Cancel</button
				>
			</div>
		{:else if state.accountModalOpen}
			<AccountModal
				embedded
				accounts={state.sessions}
				message={state.authMessage}
				busy={state.authBusy}
				{syncBusy}
				busySessionId={state.accountBusySessionId}
				localActive={!state.sessions.some((session) => session.active)}
				onClose={controller.closeAccountModal}
				onSelectAccount={(sessionId) => void controller.selectAccountSession(sessionId)}
				onUseLocalAccount={() => void controller.useAnonymousAccount()}
				onLogoutAccount={(sessionId, userId) => {
					if (onLogoutAccount) onLogoutAccount(sessionId, userId);
					else void controller.logoutAccountSession(sessionId, userId);
				}}
				onAddAccount={controller.openLoginFlow}
			/>
		{:else}
			<LoginModal
				embedded
				step={state.loginStep}
				email={state.emailDraft}
				otp={state.otpDraft}
				message={state.authMessage}
				loginSubmitting={state.loginSubmitting}
				otpVerifying={state.otpVerifying}
				otpShake={state.otpShake}
				resendCooldownRemaining={state.resendCooldownRemaining}
				oauthBusyProvider={state.oauthBusyProvider}
				onClose={controller.closeLoginModal}
				onSubmitEmail={(email) => void controller.submitLogin(email)}
				onVerifyOtp={(code) => void controller.verifyOtpCode(code)}
				onResendOtp={() => void controller.resendOtpCode()}
				onBackToEmail={controller.backToEmail}
				onOAuthSignIn={controller.startOAuthSignIn}
			/>
		{/if}
	</Modal>
{/if}

{#if state?.connectedAccountsOpen}
	<ConnectedAccountsModal
		identities={state.identities}
		loading={state.identitiesLoading}
		busyProvider={state.oauthBusyProvider}
		busyIdentityId={state.identityBusyId}
		displayName={state.displayName}
		displayNameDraft={state.displayNameDraft}
		displayNameSaving={state.displayNameSaving}
		message={state.authMessage}
		onClose={controller.closeConnectedAccounts}
		onConnect={controller.connectOAuthProvider}
		onUnlink={(identityId) => void controller.unlinkOAuthIdentity(identityId)}
		onDisplayNameInput={controller.setDisplayNameDraft}
		onSaveDisplayName={controller.saveDisplayName}
		onCancelDisplayName={controller.cancelDisplayNameEdit}
	/>
{/if}

<style>
	.lookup-state {
		min-height: 7rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
	}

	.spinner {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-fg);
		border-radius: var(--radius-round);
		animation: spin 0.8s linear infinite;
	}

	.lookup-action {
		border: 0;
		padding: var(--space-1) var(--space-2);
		background: transparent;
		color: var(--color-muted);
		font: inherit;
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.lookup-action:hover {
		color: var(--color-fg);
		text-decoration: underline;
	}

	.retry {
		width: 2.5rem;
		height: 2.5rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-round);
		background: transparent;
		color: var(--color-fg);
		cursor: pointer;
	}

	.retry:hover {
		background: var(--color-hover);
	}

	.retry svg {
		width: 1.25rem;
		height: 1.25rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.lookup-error {
		max-width: 22rem;
		margin: 0;
		color: var(--color-danger);
		font-size: var(--font-size-sm);
		text-align: center;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
