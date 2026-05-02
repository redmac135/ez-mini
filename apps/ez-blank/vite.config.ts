import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'PUBLIC_');
	if (!env.PUBLIC_EZ_API_URL?.trim()) {
		throw new Error('PUBLIC_EZ_API_URL is required. Add it to the matching .env file.');
	}

	return {
		plugins: [sveltekit()]
	};
});
