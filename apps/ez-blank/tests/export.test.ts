import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocument } from '../../../packages/editor/src/basic/parser.ts';
import { renderExportContent } from '../../../packages/editor/src/basic/export.ts';

test('formatted export renders Markdown structure and escapes user content', () => {
	const html = renderExportContent(
		buildDocument('# Hello\n**bold** and *italic* with <script>\n3. item\n\n```js\n<&\n```'),
		'formatted'
	);
	assert.match(html, /<h1>Hello<\/h1>/);
	assert.match(html, /<strong>bold<\/strong> and <em>italic<\/em>/);
	assert.match(html, /&lt;script&gt;/);
	assert.doesNotMatch(html, /<script>/);
	assert.match(html, /<ol start="3"><li>item<\/li><\/ol>/);
	assert.match(html, /<pre><code>&lt;&amp;<\/code><\/pre>/);
});

test('source export preserves literal Markdown markers as escaped monospaced text', () => {
	const source = '# **bold**\n<script>alert(1)</script>';
	const html = renderExportContent(buildDocument(source), 'source');
	assert.equal(html, '<pre class="source"># **bold**\n&lt;script&gt;alert(1)&lt;/script&gt;</pre>');
});

test('source export preserves an initial newline through HTML parsing', () => {
	const html = renderExportContent(buildDocument('\n# title'), 'source');
	assert.equal(html, '<pre class="source">&#10;# title</pre>');
});
