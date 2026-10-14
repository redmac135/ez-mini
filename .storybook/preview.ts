import '../packages/design/tokens.css';
import type { Preview } from '@storybook/svelte-vite';

const preview: Preview = {
	globalTypes: {
		theme: {
			name: 'Theme',
			description: 'Design token color theme',
			defaultValue: 'light',
			toolbar: {
				icon: 'paintbrush',
				items: [
					{ value: 'light', title: 'Light' },
					{ value: 'dark', title: 'Dark' }
				]
			}
		}
	},
	decorators: [
		(story, context) => {
			if (typeof document !== 'undefined') {
				document.body.dataset.theme = context.globals.theme;
			}
			return story();
		}
	],
	parameters: {
		layout: 'centered',
		controls: { expanded: true }
	}
};

export default preview;
