<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TokenOverview from './TokenOverview.svelte';

	const { Story } = defineMeta({ title: 'Foundations/Design Tokens', component: TokenOverview });
</script>

<Story name="Token Reference" />
