<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import LoginModal from './LoginModal.svelte';
	const { Story } = defineMeta({ title: 'Components/Patterns/Login Modal', component: LoginModal });
</script>

<script lang="ts">
	let verifiedCode = $state('');
	let submittedEmail = $state('');
	let selectedProvider = $state('');
</script>

<Story
	name="Submits the entered email"
	args={{ step: 'email', email: '' }}
	play={async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText('Email'), 'reader@example.com');
		await userEvent.click(canvas.getByRole('button', { name: 'Send Email' }));
		await expect(canvas.getByText('Submitted email: reader@example.com')).toBeInTheDocument();
	}}
>
	{#snippet template(args)}
		<LoginModal {...args} onClose={() => {}} onSubmitEmail={(email) => (submittedEmail = email)} />
		<p aria-live="polite">
			{submittedEmail ? `Submitted email: ${submittedEmail}` : 'No email submitted'}
		</p>
	{/snippet}
</Story>

<Story
	name="Starts GitHub sign-in"
	args={{ step: 'email', email: '' }}
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'GitHub' }));
		await expect(canvas.getByText('Starting GitHub sign-in')).toBeVisible();
	}}
>
	{#snippet template(args)}
		<LoginModal
			{...args}
			onClose={() => {}}
			onSubmitEmail={() => {}}
			onOAuthSignIn={(provider) => (selectedProvider = provider)}
		/>
		<p aria-live="polite">
			{selectedProvider
				? `Starting ${selectedProvider === 'azure' ? 'Microsoft' : 'GitHub'} sign-in`
				: 'No provider selected'}
		</p>
	{/snippet}
</Story>

<Story name="Microsoft sign-in in progress" args={{ step: 'email', oauthBusyProvider: 'azure' }}>
	{#snippet template(args)}
		<LoginModal {...args} onClose={() => {}} onSubmitEmail={() => {}} />
	{/snippet}
</Story>

<Story
	name="Completes verification when all digits are entered"
	args={{ step: 'otp', email: 'reader@example.com', otp: '' }}
	play={async ({ canvas, userEvent }) => {
		for (const [index, digit] of [...'12345678'].entries()) {
			await userEvent.type(canvas.getByLabelText(`Digit ${index + 1}`), digit);
		}
		await expect(canvas.getByText('Verified code: 12345678')).toBeInTheDocument();
	}}
>
	{#snippet template(args)}
		<LoginModal {...args} onClose={() => {}} onVerifyOtp={(code) => (verifiedCode = code)} />
		<p aria-live="polite">{verifiedCode ? `Verified code: ${verifiedCode}` : 'Waiting for code'}</p>
	{/snippet}
</Story>

<Story
	name="One time code"
	args={{ step: 'otp', email: 'reader@example.com', otp: '381', resendCooldownRemaining: 20 }}
>
	{#snippet template(args)}<LoginModal
			{...args}
			onClose={() => {}}
			onVerifyOtp={() => {}}
			onResendOtp={() => {}}
			onBackToEmail={() => {}}
		/>{/snippet}
</Story>
