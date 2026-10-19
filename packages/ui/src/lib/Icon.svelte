<script lang="ts">
	export let name:
		| 'archive-box'
		| 'bars-3'
		| 'calendar'
		| 'calendar-days'
		| 'check'
		| 'chevron-left'
		| 'chevron-right'
		| 'ellipsis-horizontal'
		| 'edit'
		| 'delete'
		| 'plus'
		| 'search'
		| 'magnifying-glass'
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
{:else if name === 'calendar' || name === 'calendar-days'}
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
			fill="currentColor"
		></path>
	</svg>
{:else if name === 'edit'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M16.862 4.487l2.651 2.651M4.5 19.5l4.067-.813L19.513 7.74a1.875 1.875 0 00-2.652-2.652L5.915 16.034 4.5 19.5z"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.7"
		></path>
	</svg>
{:else if name === 'magnifying-glass'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="10.8" cy="10.8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.7"
		></circle>
		<path
			d="M15.5 15.5L20 20"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-width="1.7"
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
{:else if name === 'search'}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M20.25 20.25l-4.5-4.5m2.25-5.25a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.7"
		></path>
	</svg>
{:else if name === 'delete'}
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
