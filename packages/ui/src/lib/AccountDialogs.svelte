<script lang="ts">
	import { onMount } from 'svelte';
	import AccountModal from './AccountModal.svelte';
	import LoginModal from './LoginModal.svelte';

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
		loginStep: 'email' | 'otp';
		emailDraft: string;
		otpDraft: string;
		loginSubmitting: boolean;
		otpVerifying: boolean;
		otpShake: boolean;
		resendCooldownRemaining: number;
	}

	interface AccountDialogController {
		subscribe(run: (state: AccountDialogState) => void): () => void;
		openLoginFlow(): void;
		closeLoginModal(): void;
		closeAccountModal(): void;
		submitLogin(email?: string): Promise<void>;
		verifyOtpCode(code: string): Promise<void>;
		resendOtpCode(): Promise<void>;
		backToEmail(): void;
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

{#if state?.loginModalOpen}
	<LoginModal
		step={state.loginStep}
		email={state.emailDraft}
		otp={state.otpDraft}
		message={state.authMessage}
		loginSubmitting={state.loginSubmitting}
		otpVerifying={state.otpVerifying}
		otpShake={state.otpShake}
		resendCooldownRemaining={state.resendCooldownRemaining}
		onClose={controller.closeLoginModal}
		onSubmitEmail={(email) => void controller.submitLogin(email)}
		onVerifyOtp={(code) => void controller.verifyOtpCode(code)}
		onResendOtp={() => void controller.resendOtpCode()}
		onBackToEmail={controller.backToEmail}
	/>
{/if}

{#if state?.accountModalOpen}
	<AccountModal
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
{/if}
