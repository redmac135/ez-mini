<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Editor, type EditorState } from '@ez/editor';
	import { animateBounds, clearFixedBounds, readBounds, setFixedBounds } from './journey';
	import type { ElementBounds, JourneyEntry } from './journey';

	let {
		entry,
		sourceBounds,
		editorState,
		closing = false,
		onChange = () => {},
		onClosed = () => {}
	}: {
		entry: JourneyEntry;
		sourceBounds: ElementBounds;
		editorState: EditorState;
		closing?: boolean;
		onChange?: (state: EditorState) => void;
		onClosed?: () => void;
	} = $props();

	let surface: HTMLElement;
	let fullscreen = $state(false);
	let closeStarted = false;
	let animation: Animation | undefined;

	onMount(async () => {
		const from = readBounds(surface);
		fullscreen = true;
		clearFixedBounds(surface);
		await tick();
		const to = readBounds(surface);
		animation = animateBounds(surface, from, to);
	});

	$effect(() => {
		if (closing && !closeStarted) {
			closeStarted = true;
			void animateClosed();
		}
	});

	async function animateClosed() {
		const from = readBounds(surface);
		animation?.cancel();
		setFixedBounds(surface, from);
		fullscreen = false;
		await tick();
		clearFixedBounds(surface);
		const to = readBounds(surface);
		animation = animateBounds(surface, from, to);

		if (animation) {
			try {
				await animation.finished;
			} catch {
				// The parent may remove the editor while its close motion is running.
			}
		}

		onClosed();
	}

	const createdAt = $derived(new Date(entry.createdAt));
	const dateLabel = $derived(
		new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(
			createdAt
		)
	);
	const timeLabel = $derived(
		new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(createdAt)
	);
</script>

<section
	bind:this={surface}
	class="entry-editor"
	class:fullscreen
	style={`--origin-top: ${sourceBounds.top}px; --origin-left: ${sourceBounds.left}px; --origin-width: ${sourceBounds.width}px; --origin-height: ${sourceBounds.height}px`}
	aria-label="Edit journal entry"
>
	<div class="entry-content">
		<header class="entry-meta">
			<time datetime={entry.createdAt}>{dateLabel} · {timeLabel}</time>
		</header>
		<Editor initialState={editorState} placeholder="Write your entry..." {onChange} />
	</div>
</section>

<style>
	.entry-editor {
		--navbar-clearance: calc(max(var(--space-3), env(safe-area-inset-top)) + 2rem);

		position: fixed;
		top: var(--origin-top);
		left: var(--origin-left);
		z-index: 10;
		width: var(--origin-width);
		height: var(--origin-height);
		box-sizing: border-box;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-panel);
		color: var(--color-fg);
		transition:
			background-color var(--duration-slow) var(--ease-standard),
			border-color var(--duration-slow) var(--ease-standard),
			border-radius var(--duration-slow) var(--ease-standard);
	}

	.entry-content {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--origin-width);
		height: 100dvh;
		overflow: visible;
		transition:
			top 360ms cubic-bezier(0.2, 0, 0, 1),
			left 360ms cubic-bezier(0.2, 0, 0, 1),
			width 360ms cubic-bezier(0.2, 0, 0, 1),
			transform 360ms cubic-bezier(0.2, 0, 0, 1);
	}

	.entry-editor.fullscreen {
		top: var(--navbar-clearance);
		right: 0;
		bottom: 0;
		left: 0;
		width: 100vw;
		height: auto;
		border: 0;
		border-radius: 0;
		background: var(--color-bg);
	}

	.entry-editor.fullscreen .entry-content {
		top: calc(-1 * var(--navbar-clearance));
		left: 50%;
		width: min(680px, calc(100vw - 2 * var(--space-5)));
		transform: translateX(-50%);
	}

	.entry-meta {
		padding: var(--space-4) var(--space-5) var(--space-3);
		color: var(--color-subtle);
		font-size: var(--font-size-xs);
	}

	.entry-editor.fullscreen .entry-meta {
		padding: var(--navbar-clearance) var(--space-5) var(--space-3);
	}

	.entry-editor :global(.editable) {
		min-height: calc(100dvh - 2 * var(--space-8));
		padding: 0 var(--space-5) var(--space-4);
	}
</style>
