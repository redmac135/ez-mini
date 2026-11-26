import type { BlockNode, EditorDocument, InlineNode } from '@ez/editor';
import coverage from './pdf-fonts/coverage.json';
import sansRegular from './pdf-fonts/RobotoMono-Regular.ttf?url';
import sansBold from './pdf-fonts/RobotoMono-Bold.ttf?url';
import sansItalic from './pdf-fonts/RobotoMono-Italic.ttf?url';
import sansBoldItalic from './pdf-fonts/RobotoMono-BoldItalic.ttf?url';
import sansSC from './pdf-fonts/NotoSansSC.ttf?url';
import sansKR from './pdf-fonts/NotoSansKR.ttf?url';
import sansArabic from './pdf-fonts/NotoSansArabic.ttf?url';
import sansHebrew from './pdf-fonts/NotoSansHebrew.ttf?url';
import sansDevanagari from './pdf-fonts/NotoSansDevanagari.ttf?url';
import emoji from './pdf-fonts/NotoEmoji.ttf?url';

type FontName = keyof typeof coverage;
type Span = {
	text: string;
	font: FontName;
	bold?: boolean;
	italics?: boolean;
	background?: string;
};
type PdfContent = Record<string, unknown>;
const fontUrls: Record<FontName, string> = {
	'RobotoMono-Regular': sansRegular,
	NotoSansSC: sansSC,
	NotoSansKR: sansKR,
	NotoSansArabic: sansArabic,
	NotoSansHebrew: sansHebrew,
	NotoSansDevanagari: sansDevanagari,
	NotoEmoji: emoji
};
const fontNames = Object.keys(fontUrls) as FontName[];
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function hasCharacter(font: FontName, code: number): boolean {
	const ranges = coverage[font];
	let left = 0;
	let right = ranges.length - 1;
	while (left <= right) {
		const middle = (left + right) >>> 1;
		const [start, end] = ranges[middle];
		if (code < start) right = middle - 1;
		else if (code > end) left = middle + 1;
		else return true;
	}
	return false;
}

function textSpans(text: string, style: Omit<Span, 'text' | 'font'> = {}): Span[] {
	const spans: Span[] = [];
	for (const { segment } of segmenter.segment(text)) {
		const codes = Array.from(segment, (character) => character.codePointAt(0)!).filter(
			(code) =>
				code !== 0x200d &&
				code !== 0xfe0e &&
				code !== 0xfe0f &&
				code !== 10 &&
				code !== 13 &&
				code !== 9
		);
		const previous = spans.at(-1);
		const font =
			codes.length === 0
				? (previous?.font ?? fontNames[0])
				: fontNames.find((name) => codes.every((code) => hasCharacter(name, code)));
		if (!font) throw new Error(`PDF export cannot display the character ${segment}.`);
		if (previous?.font === font) previous.text += segment;
		else spans.push({ text: segment, font, ...style });
	}
	return spans;
}

function inline(nodes: InlineNode[]): Span[] {
	return nodes.flatMap((node) =>
		textSpans(node.text, {
			...(node.type === 'strong' || node.type === 'strong_emphasis' ? { bold: true } : {}),
			...(node.type === 'emphasis' || node.type === 'strong_emphasis' ? { italics: true } : {}),
			...(node.type === 'code' ? { background: '#eeeeee' } : {})
		})
	);
}

function blocks(nodes: BlockNode[]): PdfContent[] {
	return nodes.flatMap((node): PdfContent[] => {
		if (node.type === 'paragraph')
			return [
				{ text: inline(node.inline).length ? inline(node.inline) : ' ', margin: [0, 0, 0, 5] }
			];
		if (node.type === 'heading')
			return [
				{
					text: inline(node.inline),
					bold: true,
					fontSize: Math.max(14, 25 - node.level * 2),
					margin: [0, 8, 0, 6]
				}
			];
		if (node.type === 'code_block')
			return [
				{
					text: textSpans(node.lines.map((line) => line.text).join('\n')),
					background: '#eeeeee',
					margin: [0, 3, 0, 8]
				}
			];
		return node.items.flatMap((item) => [
			{
				columns: [
					{ text: textSpans(item.ordered ? `${item.number}.` : '•'), width: 22 },
					{ text: inline(item.inline), width: '*' }
				],
				margin: [(node.level - 1) * 18, 0, 0, 4]
			},
			...blocks(item.children)
		]);
	});
}

const fontCache = new Map<string, Promise<string>>();

function asBase64(url: string): Promise<string> {
	let pending = fontCache.get(url);
	if (!pending) {
		pending = (async () => {
			const response = await fetch(url);
			if (!response.ok) throw new Error('Could not load the PDF fonts. Please try again.');
			const blob = await response.blob();
			return new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(new Error('Could not load the PDF fonts.'));
				reader.onload = () => resolve(String(reader.result).split(',')[1]);
				reader.readAsDataURL(blob);
			});
		})().catch((error) => {
			fontCache.delete(url);
			throw error;
		});
		fontCache.set(url, pending);
	}
	return pending;
}

export async function downloadPdf(
	document: EditorDocument,
	title: string,
	formatted: boolean
): Promise<void> {
	const content = formatted ? blocks(document.blocks) : [{ text: textSpans(document.text) }];
	const usedFonts = new Set<FontName>(['RobotoMono-Regular']);
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) value.forEach(visit);
		else if (value && typeof value === 'object') {
			for (const [key, child] of Object.entries(value)) {
				if (key === 'font' && typeof child === 'string') usedFonts.add(child as FontName);
				else visit(child);
			}
		}
	};
	visit(content);
	const files: Record<string, string> = {};
	const variants = {
		'RobotoMono-Bold': sansBold,
		'RobotoMono-Italic': sansItalic,
		'RobotoMono-BoldItalic': sansBoldItalic
	};
	await Promise.all(
		[
			...Array.from(usedFonts, (name) => [name, fontUrls[name]] as const),
			...Object.entries(variants)
		].map(async ([name, url]) => {
			files[`${name}.ttf`] = await asBase64(url);
		})
	);
	const pdfmake = (await import('pdfmake/build/pdfmake')).default;
	pdfmake.addVirtualFileSystem(files);
	const fonts = Object.fromEntries(
		Array.from(usedFonts, (name) => [
			name,
			name === 'RobotoMono-Regular'
				? {
						normal: `${name}.ttf`,
						bold: 'RobotoMono-Bold.ttf',
						italics: 'RobotoMono-Italic.ttf',
						bolditalics: 'RobotoMono-BoldItalic.ttf'
					}
				: {
						normal: `${name}.ttf`,
						bold: `${name}.ttf`,
						italics: `${name}.ttf`,
						bolditalics: `${name}.ttf`
					}
		])
	);
	pdfmake.addFonts(fonts);
	const blob: Blob = await pdfmake
		.createPdf({
			pageSize: 'A4',
			pageMargins: [50, 50, 50, 50],
			defaultStyle: { font: 'RobotoMono-Regular', fontSize: 12, lineHeight: 1.3 },
			content
		})
		.getBlob();
	const url = URL.createObjectURL(blob);
	const anchor = window.document.createElement('a');
	anchor.href = url;
	const safeTitle = Array.from(title)
		.filter((character) => character.charCodeAt(0) >= 32)
		.join('');
	anchor.download = `${safeTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled'}.pdf`;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
