<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import JourneyEntryEditor from './JourneyEntryEditor.svelte';
	import type { JourneyEntry } from './journey';

	const { Story } = defineMeta({
		title: 'Apps/Journey/Entry Editor',
		component: JourneyEntryEditor,
		parameters: { layout: 'fullscreen' }
	});

	const entry: JourneyEntry = {
		id: 'walk',
		text: 'Took a quiet walk after lunch and noticed the first leaves turning gold.\n\nI want to remember how calm that felt.',
		createdAt: '2026-10-14T12:35:00.000Z'
	};
	const sourceBounds = { top: 260, left: 300, width: 600, height: 170 };
	const editorState = {
		text: entry.text,
		selectionStart: entry.text.length,
		selectionEnd: entry.text.length
	};
</script>

<Story name="Expanding a timeline entry" args={{ entry, sourceBounds, editorState }} />
