<script lang="ts">
	import Button from './Button.svelte';
	import Modal from './Modal.svelte';
	import OtpInput from './OtpInput.svelte';
	import TextInput from './TextInput.svelte';

	export let step: 'email' | 'otp' = 'email';
	export let email = '';
	export let otp = '';
	export let message = '';
	export let loginSubmitting = false;
	export let otpVerifying = false;
	export let otpShake = false;
	export let resendCooldownRemaining = 0;
	export let onClose: () => void = () => {};
	export let onSubmitEmail: (value: string) => void = () => {};
	export let onVerifyOtp: (value: string) => void = () => {};
	export let onResendOtp: () => void = () => {};
	export let onBackToEmail: () => void = () => {};
</script>

<Modal title="Login" {onClose}>
	{#if step === 'email'}
		<label class="auth-field">
			<span>Email</span>
			<TextInput
				bind:value={email}
				type="email"
				placeholder="you@example.com"
				autocomplete="email"
				on:keydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						onSubmitEmail(email);
					}
				}}
			/>
		</label>
	{:else}
		<div class="auth-field">
			<span>Code sent to {email.trim()}</span>
			<OtpInput
				value={otp}
				disabled={otpVerifying}
				shake={otpShake}
				on:change={(event) => (otp = event.detail.value)}
				on:complete={(event) => onVerifyOtp(event.detail.value)}
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
				on:click={onResendOtp}
			>
				{#if resendCooldownRemaining > 0}
					Resend code ({resendCooldownRemaining}s)
				{:else}
					Resend code
				{/if}
			</Button>
			<Button disabled={otpVerifying} on:click={onBackToEmail}>Back</Button>
			<div class="auth-status" aria-live="polite">
				{otpVerifying ? 'Verifying…' : ''}
			</div>
		{:else}
			<Button on:click={onClose}>Cancel</Button>
			<Button variant="primary" disabled={loginSubmitting} on:click={() => onSubmitEmail(email)}>
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
</style>
