<script lang="ts">
	export let name:
		| 'archive-box'
		| 'bars-3'
		| 'calendar-days'
		| 'check'
		| 'chevron-left'
		| 'chevron-right'
		| 'ellipsis-horizontal'
		| 'pencil-square'
		| 'plus'
		| 'trash'
		| 'x-mark';
</script>

{#if name === 'archive-box'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M4.5 7.5h15m-13.5 0v11.25h12V7.5m-10.5 3.75h9m-10.5-6h12l-1.5-2.25h-9z"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
		></path>
	</svg>
{:else if name === 'bars-3'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M3.75 5.25h16.5m-16.5 6h16.5m-16.5 6h16.5"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-width="1.5"
		></path>
	</svg>
{:else if name === 'calendar-days'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M7.5 3.75v3m9-3v3m-10.5 3h12m-13.5-3A2.25 2.25 0 016.75 4.5h10.5A2.25 2.25 0 0119.5 6.75v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25zm3.75 6h.01m3.74 0h.01m3.74 0h.01m-7.49 3h.01m3.74 0h.01m3.74 0h.01"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
		></path>
	</svg>
{:else if name === 'check'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M4.5 12.75l4.5 4.5 10.5-10.5"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.7"
		></path>
	</svg>
{:else if name === 'chevron-left'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M15.75 19.5L8.25 12l7.5-7.5"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.6"
		></path>
	</svg>
{:else if name === 'chevron-right'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M8.25 4.5l7.5 7.5-7.5 7.5"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.6"
		></path>
	</svg>
{:else if name === 'ellipsis-horizontal'}
	<svg viewBox="0 0 20 20" aria-hidden="true">
		<path
			d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z"
		></path>
	</svg>
{:else if name === 'pencil-square'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M13.5 6h-6A2.25 2.25 0 005.25 8.25v8.25A2.25 2.25 0 007.5 18.75h8.25A2.25 2.25 0 0018 16.5v-6m-6.75 3l7.5-7.5 2.25 2.25-7.5 7.5h-2.25z"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
		></path>
	</svg>
{:else if name === 'plus'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M12 4.5v15m7.5-7.5h-15"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-width="1.6"
		></path>
	</svg>
{:else if name === 'trash'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M6.75 7.5h10.5m-9 0l.75 12h6l.75-12m-6-2.25h3m-7.5 2.25l.75-2.25h9l.75 2.25"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
		></path>
	</svg>
{:else}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M6 6l12 12M18 6L6 18"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-width="1.5"
		></path>
	</svg>
{/if}

<style>
	svg {
		display: block;
		width: 1rem;
		height: 1rem;
	}
</style>
