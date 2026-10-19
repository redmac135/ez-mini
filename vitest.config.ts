import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, defineProject } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
	test: {
		projects: [
			defineProject({
				plugins: [storybookTest({ configDir: path.join(root, '.storybook') })],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						connectTimeout: 120_000,
						provider: playwright(
							chromiumExecutablePath
								? { launchOptions: { executablePath: chromiumExecutablePath } }
								: {}
						),
						headless: true,
						instances: [{ browser: 'chromium' }]
					}
				}
			})
		]
	}
});
