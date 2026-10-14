# @ez/editor

Shared Markdown editing surface for ez-blank and ez-journey.

```svelte
<script lang="ts">
	import { Editor, type EditorState } from '@ez/editor';

	let state: EditorState = { text: '', selectionStart: 0, selectionEnd: 0 };
</script>

<Editor initialState={state} onChange={(next) => (state = next)} />
```

`text` is the Markdown source. The host owns document identity, layout width, persistence, and media storage; the editor owns editing behavior and its internal text surface.
