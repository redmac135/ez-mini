import type { BlockNode, InlineNode, ListBlock } from './ast';
import type { EditorDocument } from './parser';

export type ExportMode = 'formatted' | 'source';

export function renderExportContent(document: EditorDocument, mode: ExportMode): string {
	if (mode === 'source') {
		return `<pre class="source">${escapeHtml(document.text)}</pre>`;
	}
	return document.blocks.map(renderBlock).join('');
}

function renderBlock(block: BlockNode): string {
	if (block.type === 'paragraph') return `<p>${renderInline(block.inline)}</p>`;
	if (block.type === 'heading') {
		const level = Math.max(1, Math.min(6, block.level));
		return `<h${level}>${renderInline(block.inline)}</h${level}>`;
	}
	if (block.type === 'code_block') {
		return `<pre><code>${escapeHtml(block.lines.map((line) => line.text).join('\n'))}</code></pre>`;
	}
	return renderList(block);
}

function renderList(block: ListBlock): string {
	const tag = block.ordered ? 'ol' : 'ul';
	const start =
		block.ordered && block.items[0]?.number > 1 ? ` start="${block.items[0].number}"` : '';
	const items = block.items
		.map(
			(item) => `<li>${renderInline(item.inline)}${item.children.map(renderBlock).join('')}</li>`
		)
		.join('');
	return `<${tag}${start}>${items}</${tag}>`;
}

function renderInline(nodes: InlineNode[]): string {
	return nodes
		.map((node) => {
			if (node.type === 'text') return escapeHtml(node.text);
			const contents = escapeHtml(node.text);
			if (node.type === 'strong_emphasis') return `<strong><em>${contents}</em></strong>`;
			if (node.type === 'emphasis') return `<em>${contents}</em>`;
			if (node.type === 'strong') return `<strong>${contents}</strong>`;
			return `<code>${contents}</code>`;
		})
		.join('');
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		const entities: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		};
		return entities[character];
	});
}
