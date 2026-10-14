import { defineConfig, devices } from 'playwright/test';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';

const baseURL = 'http://127.0.0.1:1351';
const chromiumPath = findChromiumExecutable();

export default defineConfig({
	testDir: './apps',
	testMatch: '**/e2e/**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		...devices['Desktop Chrome'],
		baseURL,
		...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
		trace: 'retain-on-failure'
	},
	webServer: [
		{
			command: '../../node_modules/.bin/vite dev --host 127.0.0.1 --port 1351 --strictPort',
			cwd: 'apps/ez-blank',
			url: baseURL,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		},
		{
			command: '../../node_modules/.bin/vite dev --host 127.0.0.1 --port 1353 --strictPort',
			cwd: 'apps/ez-journey',
			url: 'http://127.0.0.1:1353',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		}
	]
});

function findChromiumExecutable() {
	const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
	const candidates = explicitPath
		? [explicitPath]
		: process.env.PATH?.split(path.delimiter).flatMap((directory) =>
				['chromium', 'chromium-browser', 'google-chrome', 'msedge'].map((name) =>
					path.join(directory, name)
				)
			);

	for (const candidate of candidates ?? []) {
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Keep looking; Playwright's managed Chromium is the fallback.
		}
	}

	return undefined;
}
