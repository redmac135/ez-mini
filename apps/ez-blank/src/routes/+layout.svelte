<script lang="ts">
	import '@ez/design/tokens.css';
	import { onMount } from 'svelte';
	import { APP_UPDATED_NOTICE_EVENT, queueAppUpdatedNotice } from '$lib/pwa-update-notice';

	let { children } = $props();

	onMount(() => {
		if (!navigator.serviceWorker?.controller) {
			return;
		}

		function handleControllerChange() {
			try {
				queueAppUpdatedNotice();
				window.dispatchEvent(new CustomEvent(APP_UPDATED_NOTICE_EVENT));
			} catch (error) {
				void error;
			}
		}

		navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

		return () => {
			navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
		};
	});
</script>

{@render children()}
