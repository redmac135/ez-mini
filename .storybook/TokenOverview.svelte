<script lang="ts">
	const groups = [
		{
			title: 'Color',
			tokens: [
				'--color-bg',
				'--color-fg',
				'--color-muted',
				'--color-subtle',
				'--color-panel',
				'--color-border',
				'--color-shadow',
				'--color-hover',
				'--color-scrim',
				'--color-danger',
				'--color-on-danger',
				'--color-selection',
				'--color-code'
			]
		},
		{
			title: 'Spacing',
			tokens: Array.from({ length: 9 }, (_value, index) => `--space-${index}`)
		},
		{
			title: 'Radius',
			tokens: ['--radius-0', '--radius-1', '--radius-2', '--radius-round']
		},
		{
			title: 'Typography',
			tokens: [
				'--font-family-mono',
				'--font-size-2xs',
				'--font-size-xs',
				'--font-size-sm',
				'--font-size-md',
				'--font-size-lg',
				'--font-size-xl',
				'--font-size-otp',
				'--line-height-tight',
				'--font-weight-normal',
				'--font-weight-bold',
				'--letter-spacing-count'
			]
		},
		{
			title: 'Animation',
			tokens: [
				'--duration-fast',
				'--duration-normal',
				'--duration-slow',
				'--duration-shake',
				'--ease-standard',
				'--ease-in-out'
			]
		}
	];
</script>

<main>
	<h1>Design tokens</h1>
	<p>
		Shared CSS variables from <code>@ez/design</code>. Switch the Storybook theme to inspect colors.
	</p>
	{#each groups as group (group.title)}
		<section>
			<h2>{group.title}</h2>
			<div class="token-grid">
				{#each group.tokens as token (token)}
					<div class="token">
						{#if group.title === 'Color'}
							<span class="swatch" style={`background: var(${token})`}></span>
						{:else if group.title === 'Spacing'}
							<span class="space-swatch" style={`width: var(${token})`}></span>
						{/if}
						<code>{token}</code>
						<small>{`var(${token})`}</small>
					</div>
				{/each}
			</div>
		</section>
	{/each}
</main>

<style>
	main {
		width: min(60rem, calc(100vw - 2rem));
		color: var(--color-fg);
		font-family: var(--font-family-mono);
	}
	h1,
	h2 {
		font-weight: var(--font-weight-normal);
	}
	h1 {
		font-size: var(--font-size-xl);
	}
	h2 {
		margin: var(--space-5) 0 var(--space-2);
		font-size: var(--font-size-md);
	}
	p,
	small {
		color: var(--color-muted);
		font-size: var(--font-size-sm);
	}
	.token-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: var(--space-2);
	}
	.token {
		min-width: 0;
		display: grid;
		grid-template-columns: 1.5rem minmax(0, 1fr);
		align-items: center;
		gap: var(--space-1) var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
	}
	.token code {
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--font-size-xs);
	}
	.token small {
		grid-column: 2;
	}
	.swatch {
		width: 1.5rem;
		height: 1.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
	}
	.space-swatch {
		height: 0.5rem;
		max-width: 4rem;
		background: var(--color-fg);
	}
</style>
