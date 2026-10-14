<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import LoginModal from './LoginModal.svelte';
	const { Story } = defineMeta({ title: 'Components/Patterns/Login Modal', component: LoginModal });
</script>

<script lang="ts">
	let verifiedCode = $state('');
</script>

<Story name="Email entry" args={{ step: 'email', email: 'reader@example.com' }}>
	{#snippet template(args)}<LoginModal
			{...args}
			onClose={() => {}}
			onSubmitEmail={() => {}}
		/>{/snippet}
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
		<LoginModal
			{...args}
			onClose={() => {}}
			onVerifyOtp={(code) => (verifiedCode = code)}
		/>
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
