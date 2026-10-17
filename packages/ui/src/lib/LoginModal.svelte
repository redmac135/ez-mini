<script lang="ts">
	import Button from './Button.svelte';
	import Modal from './Modal.svelte';
	import OtpInput from './OtpInput.svelte';
	import TextInput from './TextInput.svelte';
	type OAuthProvider = 'github' | 'azure';

	export let step: 'email' | 'otp' = 'email';
	export let embedded = false;
	export let email = '';
	export let otp = '';
	export let message = '';
	export let loginSubmitting = false;
	export let otpVerifying = false;
	export let otpShake = false;
	export let resendCooldownRemaining = 0;
	export let oauthBusyProvider: OAuthProvider | null = null;
	export let onClose: () => void = () => {};
	export let onSubmitEmail: (value: string) => void = () => {};
	export let onVerifyOtp: (value: string) => void = () => {};
	export let onResendOtp: () => void = () => {};
	export let onBackToEmail: () => void = () => {};
	export let onOAuthSignIn: (provider: OAuthProvider) => void = () => {};
</script>

<Modal title="Login" {embedded} {onClose}>
	{#if step === 'email'}
		<label class="auth-field">
			<span>Email</span>
			<TextInput
				bind:value={email}
				type="email"
				placeholder="you@example.com"
				autocomplete="email"
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						onSubmitEmail(email);
					}
				}}
			/>
		</label>
		<div class="provider-options" aria-label="Other sign-in options">
			<div class="provider-divider"><span>or continue with</span></div>
			<button
				class="provider-button"
				type="button"
				disabled={loginSubmitting || oauthBusyProvider !== null}
				on:click={() => onOAuthSignIn('github')}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><path
						d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.1c-3.1.68-3.76-1.32-3.76-1.32-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1 1.76-.27 2.18-.7.1-.72.39-1.2.71-1.48-2.48-.28-5.1-1.24-5.1-5.52 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.12-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.29-2.63 5.24-5.13 5.51.4.35.76 1.02.76 2.06v3.05c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"
					/></svg
				>
				{oauthBusyProvider === 'github' ? 'Connecting…' : 'GitHub'}
			</button>
			<button
				class="provider-button"
				type="button"
				disabled={loginSubmitting || oauthBusyProvider !== null}
				on:click={() => onOAuthSignIn('azure')}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><path fill="#f25022" d="M1 1h10v10H1z" /><path fill="#7fba00" d="M13 1h10v10H13z" /><path
						fill="#00a4ef"
						d="M1 13h10v10H1z"
					/><path fill="#ffb900" d="M13 13h10v10H13z" /></svg
				>
				{oauthBusyProvider === 'azure' ? 'Connecting…' : 'Microsoft'}
			</button>
		</div>
	{:else}
		<div class="auth-field">
			<span>Code sent to {email.trim()}</span>
			<OtpInput
				value={otp}
				disabled={otpVerifying}
				shake={otpShake}
				onChange={(nextValue) => (otp = nextValue)}
				onComplete={onVerifyOtp}
			/>
		</div>
	{/if}
	{#if message}
		<p class="auth-message">{message}</p>
	{/if}
	<svelte:fragment slot="actions">
		{#if step === 'otp'}
			<Button
				disabled={resendCooldownRemaining > 0 || loginSubmitting || otpVerifying}
				onclick={onResendOtp}
			>
				{#if resendCooldownRemaining > 0}
					Resend code ({resendCooldownRemaining}s)
				{:else}
					Resend code
				{/if}
			</Button>
			<Button disabled={otpVerifying} onclick={onBackToEmail}>Back</Button>
			<div class="auth-status" aria-live="polite">
				{otpVerifying ? 'Verifying…' : ''}
			</div>
		{:else}
			<Button onclick={onClose}>Cancel</Button>
			<Button variant="primary" disabled={loginSubmitting} onclick={() => onSubmitEmail(email)}>
				{loginSubmitting ? 'Sending…' : 'Send Email'}
			</Button>
		{/if}
	</svelte:fragment>
</Modal>

<style>
	.auth-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--font-size-2xs);
	}

	.auth-message {
		margin: var(--space-2) 0 0;
		font-size: var(--font-size-md);
		color: var(--color-muted);
	}

	.auth-status {
		min-width: 4.5rem;
		text-align: right;
		font: inherit;
		font-size: var(--font-size-xs);
		color: var(--color-muted);
	}

	.provider-options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.provider-divider {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-xs);
		color: var(--color-muted);
	}

	.provider-divider::before,
	.provider-divider::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--color-border);
	}

	.provider-button {
		min-height: 2.5rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-bg);
		color: var(--color-fg);
		font: inherit;
		cursor: pointer;
	}

	.provider-button:hover:not(:disabled) {
		background: var(--color-hover);
	}
	.provider-button:disabled {
		cursor: wait;
		opacity: 0.6;
	}
	.provider-button svg {
		display: block;
		flex: 0 0 1rem;
		width: 1rem;
		height: 1rem;
		fill: currentColor;
	}
</style>
