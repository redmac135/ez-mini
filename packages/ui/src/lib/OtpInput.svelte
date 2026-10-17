<script lang="ts">
	const OTP_LENGTH = 8;
	let {
		value = $bindable(''),
		disabled = false,
		shake = false,
		onChange,
		onComplete
	}: {
		value?: string;
		disabled?: boolean;
		shake?: boolean;
		onChange?: (value: string) => void;
		onComplete?: (value: string) => void;
	} = $props();

	let focused = $state(false);
	let digits = $derived(Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? ''));

	function handleInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const nextValue = target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
		target.value = nextValue;
		value = nextValue;
		onChange?.(nextValue);

		if (nextValue.length === OTP_LENGTH) {
			onComplete?.(nextValue);
		}
	}
</script>

<div class:shake class:focused class:disabled class="otp-input">
	<div class="otp-digits" aria-hidden="true">
		{#each digits as digit, index (index)}
			<span
				class:active={focused && value.length < OTP_LENGTH && index === value.length}
				class="otp-digit"
			>
				{digit}
			</span>
		{/each}
	</div>
	<input
		class="otp-field"
		type="text"
		inputmode="numeric"
		autocomplete="one-time-code"
		pattern="[0-9]*"
		autocapitalize="off"
		spellcheck="false"
		aria-label="8-digit verification code"
		{value}
		{disabled}
		oninput={handleInput}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
	/>
</div>

<style>
	.otp-input {
		position: relative;
		width: 100%;
		max-width: 28rem;
		margin-inline: auto;
	}

	.otp-digits {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: var(--space-1);
		width: 100%;
	}

	.otp-digit {
		min-width: 0;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background-color: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--font-size-otp);
		text-align: center;
		box-sizing: border-box;
		transition: var(--theme-transition);
	}

	.otp-digit.active {
		border-color: var(--color-fg);
	}

	.otp-field {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		border-radius: var(--radius-2);
		background: transparent;
		color: transparent;
		caret-color: transparent;
		font-size: 16px;
		opacity: 0;
		cursor: text;
	}

	.otp-field:disabled {
		cursor: default;
	}

	.otp-input.shake {
		animation: otp-shake var(--duration-shake) var(--ease-standard);
	}

	.otp-input.focused .otp-digit {
		transition: none;
	}

	.otp-input.disabled .otp-digit {
		opacity: 0.55;
	}

	@keyframes otp-shake {
		0%,
		100% {
			transform: translateX(0);
		}

		20% {
			transform: translateX(calc(-1 * var(--space-3)));
		}

		40% {
			transform: translateX(var(--space-2));
		}

		60% {
			transform: translateX(calc(-1 * var(--space-2)));
		}

		80% {
			transform: translateX(var(--space-1));
		}
	}
</style>
