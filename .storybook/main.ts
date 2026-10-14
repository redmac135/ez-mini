import type { StorybookConfig } from '@storybook/svelte-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mergeConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
	stories: [
		'../.storybook/**/*.stories.svelte',
		'../packages/**/*.stories.svelte',
		'../apps/**/*.stories.svelte'
	],
	addons: ['@storybook/addon-svelte-csf'],
	framework: {
		name: '@storybook/svelte-vite',
		options: { docgen: false }
	},
	async viteFinal(config) {
		config.plugins = [...svelte(), ...(config.plugins ?? [])];
		return mergeConfig(config, {
			resolve: {
				alias: [
					{
						find: /^\$lib\/repeat/,
						replacement: path.resolve(root, '../apps/ez-repeat/src/lib/repeat')
					},
					{
						find: /^\$lib\/components/,
						replacement: path.resolve(root, '../apps/ez-repeat/src/lib/components')
					}
				]
			}
		});
	}
};

export default config;
