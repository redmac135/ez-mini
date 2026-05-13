import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	if (!env.PUBLIC_EZ_API_URL?.trim()) {
		throw new Error('PUBLIC_EZ_API_URL is required. Add it to the matching .env file.');
	}

	const port = Number(env.EZ_DEV_PORT);
	return {
		plugins: [sveltekit()],
		server: Number.isInteger(port) && port > 0 ? { port, strictPort: true } : undefined
	};
});
