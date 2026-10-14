<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LoginModal from './LoginModal.svelte';
	const { Story } = defineMeta({ title: 'Components/Patterns/Login Modal', component: LoginModal });
</script>

<Story name="Email entry" args={{ step: 'email', email: 'reader@example.com' }}>
	{#snippet template(args)}<LoginModal
			{...args}
			onClose={() => {}}
			onSubmitEmail={() => {}}
		/>{/snippet}
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
