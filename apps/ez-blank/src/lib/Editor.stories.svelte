<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Editor from './Editor.svelte';
	const { Story } = defineMeta({ title: 'Apps/ez-blank/Components/Editor', component: Editor });
	const initialState = {
		text: '# A quiet writing space\n\nStart typing, make a list, or add `inline code`.',
		selectionStart: 0,
		selectionEnd: 0
	};
</script>

<Story name="Editor with formatted content" args={{ initialState, pageId: 'storybook-demo' }}>
	{#snippet template(args)}<div class="editor-frame"><Editor {...args} /></div>{/snippet}
</Story>

<style>
	.editor-frame {
		width: min(48rem, 90vw);
		min-height: 28rem;
		border: 1px solid var(--color-border);
		color: var(--color-fg);
		font-family: var(--font-family-mono);
	}
</style>
