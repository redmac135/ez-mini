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
		| 'repeat'
		| 'trash'
		| 'x-mark';
</script>

{#if name === 'archive-box'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M4 8h16v11H4V8zm2-4h12l2 4H4l2-4zm6 7v5m0 0l-2-2m2 2l2-2"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.7"
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
			d="M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm3 7h2m4 0h2m-8 4h2m4 0h2"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.7"
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
{:else if name === 'repeat'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M17 2.75l3.25 3.25L17 9.25M4 11V9a3 3 0 013-3h13M7 21.25L3.75 18 7 14.75M20 13v2a3 3 0 01-3 3H4"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.7"
		></path>
	</svg>
{:else if name === 'trash'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13M10 11v5m4-5v5"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.7"
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
