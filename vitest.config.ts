import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, defineProject } from 'vitest/config';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const chromiumPath = findChromiumExecutable();

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

export default defineConfig({
	test: {
		projects: [
			defineProject({
				plugins: [storybookTest({ configDir: path.join(root, '.storybook') })],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						provider: playwright({
							launchOptions: chromiumPath ? { executablePath: chromiumPath } : {}
						}),
						headless: true,
						instances: [{ browser: 'chromium' }]
					}
				}
			})
		]
	}
});
