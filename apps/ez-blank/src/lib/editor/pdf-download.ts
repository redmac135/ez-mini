const LAYOUT_WIDTH = 794;
const LAYOUT_HEIGHT = 1123;
const PDF_SCALE = 0.75;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
export async function downloadPdf(html: string, title: string) {
	const pages = renderPages(html);
	if (pages.length > 100) throw new Error('This page is too long to export as a PDF.');
	const blob = buildPdf(pages);
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `${safeFilename(title)}.pdf`;
	anchor.style.display = 'none';
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function renderPages(html: string) {
	const root = document.createElement('div');
	// HTML comes only from the Markdown renderer, which escapes all editor text.
	root.innerHTML = html;
	const pages: PdfPage[] = [{ commands: [], images: [] }];
	let page = pages[0];
	let commands = page.commands;
	const measureCanvas = document.createElement('canvas');
	const context = measureCanvas.getContext('2d');
	if (!context) throw new Error('PDF rendering is not supported in this browser.');
	let y = 76;
	const left = 72;
	const right = LAYOUT_WIDTH - 72;
	const bottom = LAYOUT_HEIGHT - 76;
	const newPage = () => {
		page = { commands: [], images: [] };
		commands = page.commands;
		pages.push(page);
		y = 76;
	};
	const blocks = Array.from(root.children);
	const walkInline = (
		node: Node,
		style = { bold: false, italic: false, code: false, size: 16 }
	): Array<{ text: string; style: typeof style }> => {
		if (node.nodeType === Node.TEXT_NODE) return [{ text: node.textContent ?? '', style }];
		if (!(node instanceof HTMLElement)) return [];
		const tag = node.tagName.toLowerCase();
		const next = {
			bold: style.bold || tag === 'strong' || tag === 'b',
			italic: style.italic || tag === 'em' || tag === 'i',
			code: style.code || tag === 'code',
			size: style.size
		};
		return Array.from(node.childNodes).flatMap((child) => walkInline(child, next));
	};
	const drawText = (
		segments: Array<{
			text: string;
			style: { bold: boolean; italic: boolean; code: boolean; size: number };
		}>,
		maxWidth: number,
		indent = 0,
		lineHeight = 25
	) => {
		let x = left + indent;
		const lineRight = left + maxWidth;
		let lineSegments: Array<{
			text: string;
			style: { bold: boolean; italic: boolean; code: boolean; size: number };
			width: number;
		}> = [];
		const drawLine = () => {
			if (y + lineHeight > bottom) newPage();
			for (const segment of lineSegments) {
				context.font = fontFor(segment.style);
				commands.push(drawSegment(segment.text, x, y, segment.style, context, page));
				x += segment.width;
			}
			y += lineHeight;
			x = left + indent;
			lineSegments = [];
		};
		for (const segment of segments) {
			const words = segment.text.match(/\s+|[^\s]+/gu) ?? [];
			for (const word of words) {
			const chunks = splitToken(word, maxWidth, segment.style, context);
			for (const text of chunks) {
				context.font = fontFor(segment.style);
				const width = context.measureText(text).width;
				if (x + width > lineRight && x > left + indent) drawLine();
				if (text.includes('\n')) {
					const lines = text.split('\n');
					lines.forEach((part, index) => {
						if (part) {
							const partWidth = context.measureText(part).width;
							lineSegments.push({ text: part, style: segment.style, width: partWidth });
							x += partWidth;
						}
						if (index < lines.length - 1) drawLine();
					});
				} else {
					lineSegments.push({ text, style: segment.style, width });
					x += width;
				}
			}
			}
		}
		if (lineSegments.length || y === 76) drawLine();
	};
	const visit = (element: Element, depth = 0) => {
		const tag = element.tagName.toLowerCase();
		if (tag === 'ul' || tag === 'ol') {
			let index = Number(element.getAttribute('start') ?? '1');
			for (const item of Array.from(element.children)) {
				if (item.tagName.toLowerCase() !== 'li') continue;
				const nested = Array.from(item.children).filter((child) =>
					['ul', 'ol'].includes(child.tagName.toLowerCase())
				);
				const inline = Array.from(item.childNodes).filter(
					(child) => !(child instanceof HTMLElement && nested.includes(child))
				);
				const marker = tag === 'ul' ? '• ' : `${index}. `;
				drawText(
					[
						{ text: marker, style: { bold: false, italic: false, code: false, size: 16 } },
						...inline.flatMap((node) => walkInline(node))
					],
					right - left - depth * 22,
					depth * 22,
					25
				);
				index++;
				nested.forEach((child) => visit(child, depth + 1));
			}
			return;
		}
		if (tag.startsWith('h') && tag.length === 2) {
			const size = Math.max(19, 34 - Number(tag[1]) * 2);
			y += size * 0.7;
			drawText(
				walkInline(element, { bold: true, italic: false, code: false, size }),
				right - left,
				0,
				size * 1.4
			);
			y += 8;
			return;
		}
		if (tag === 'pre') {
			const text = element.textContent ?? '';
			const lines = text.split('\n');
			const padding = 12;
			const lineHeight = 21;
			for (const line of lines) {
				if (y + lineHeight + padding > bottom) newPage();
				commands.push(
					`0.957 0.957 0.957 rg ${left * PDF_SCALE} ${(LAYOUT_HEIGHT - y - 6) * PDF_SCALE} ${(right - left) * PDF_SCALE} ${lineHeight * PDF_SCALE} re f`
				);
				drawText(
					[{ text: line, style: { bold: false, italic: false, code: true, size: 13 } }],
					right - left - padding * 2,
					padding,
					lineHeight
				);
			}
			y += 8;
			return;
		}
		drawText(walkInline(element), right - left, 0, 25);
		y += 8;
	};
	for (const block of blocks) visit(block);
	return pages;
}

function fontFor(style: { bold: boolean; italic: boolean; code: boolean; size: number }) {
	const family = style.code ? 'ui-monospace,monospace' : 'system-ui,-apple-system,"Segoe UI",sans-serif';
	return `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : ''}${style.size}px ${family}`;
}

function splitToken(
	text: string,
	maxWidth: number,
	style: { bold: boolean; italic: boolean; code: boolean; size: number },
	context: CanvasRenderingContext2D
) {
	context.font = fontFor(style);
	if (/\s/u.test(text) || context.measureText(text).width <= maxWidth) return [text];
	const chunks: string[] = [];
	let chunk = '';
	for (const character of Array.from(text)) {
		if (chunk && context.measureText(chunk + character).width > maxWidth) {
			chunks.push(chunk);
			chunk = '';
		}
		chunk += character;
	}
	if (chunk) chunks.push(chunk);
	return chunks;
}

type PdfPage = { commands: string[]; images: Array<{ bytes: Uint8Array; x: number; y: number; width: number; height: number }> };

function drawSegment(
	text: string,
	x: number,
	y: number,
	style: { bold: boolean; italic: boolean; code: boolean; size: number },
	context: CanvasRenderingContext2D,
	page: PdfPage
) {
	if (!Array.from(text).some((character) => !isWinAnsi(character.codePointAt(0) ?? 63))) {
		return textCommand(text, x, y, style);
	}
	const width = Math.max(1, Math.ceil(context.measureText(text).width));
	const height = Math.ceil(style.size * 1.7);
	const canvas = document.createElement('canvas');
	canvas.width = width * 3;
	canvas.height = height * 3;
	const imageContext = canvas.getContext('2d');
	if (!imageContext) throw new Error('PDF rendering is not supported in this browser.');
	imageContext.scale(3, 3);
	imageContext.fillStyle = '#fff';
	imageContext.fillRect(0, 0, width, height);
	imageContext.font = fontFor(style);
	imageContext.textBaseline = 'alphabetic';
	imageContext.fillStyle = '#171717';
	imageContext.fillText(text, 0, style.size * 1.35);
	const base64 = canvas.toDataURL('image/jpeg', 0.96).split(',')[1];
	const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
	const imageIndex = page.images.length;
	page.images.push({ bytes, x, y: y - style.size * 1.25, width, height });
	const imageTop = y - style.size * 1.25;
	const pdfY = PAGE_HEIGHT - (imageTop + height) * PDF_SCALE;
	const hiddenCount = Array.from(text).length;
	const encodedText = unicodeHex(text);
	const hiddenGlyphs = '3f'.repeat(hiddenCount);
	const hiddenWidth = Math.max(1, context.measureText('?'.repeat(hiddenCount)).width);
	const horizontalScale = ((width / hiddenWidth) * 100).toFixed(2);
	return `/Span << /ActualText <${encodedText}> >> BDC BT /F1 ${(style.size * PDF_SCALE).toFixed(2)} Tf 3 Tr ${horizontalScale} Tz 1 0 0 1 ${(x * PDF_SCALE).toFixed(2)} ${((LAYOUT_HEIGHT - y) * PDF_SCALE).toFixed(2)} Tm <${hiddenGlyphs}> Tj ET EMC\nq ${(width * PDF_SCALE).toFixed(2)} 0 0 ${(height * PDF_SCALE).toFixed(2)} ${(x * PDF_SCALE).toFixed(2)} ${pdfY.toFixed(2)} cm /Im${imageIndex} Do Q`;
}

function textCommand(
	text: string,
	x: number,
	y: number,
	style: { bold: boolean; italic: boolean; code: boolean; size: number }
) {
	const font = style.code ? 'F4' : style.bold && style.italic ? 'F3' : style.bold ? 'F2' : style.italic ? 'F3' : 'F1';
	const winAnsiExtras: Record<number, number> = {
		0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
		0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
		0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
		0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
		0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
		0x017e: 0x9e, 0x0178: 0x9f
	};
	const encoded = Array.from(text, (character) => {
		const code = character.codePointAt(0) ?? 63;
		return (code >= 32 && code <= 255 ? code : winAnsiExtras[code] ?? 63)
			.toString(16)
			.padStart(2, '0');
	}).join('');
	return `BT /${font} ${(style.size * PDF_SCALE).toFixed(2)} Tf 0.09 0.09 0.09 rg 1 0 0 1 ${(x * PDF_SCALE).toFixed(2)} ${((LAYOUT_HEIGHT - y) * PDF_SCALE).toFixed(2)} Tm <${encoded}> Tj ET`;
}

function isWinAnsi(code: number) {
	return (code >= 32 && code <= 255) || [0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178].includes(code);
}

function unicodeHex(text: string) {
	return `feff${Array.from(text, (character) => {
		const value = character.codePointAt(0) ?? 0xfffd;
		const units = value > 0xffff
			? [0xd800 + ((value - 0x10000) >> 10), 0xdc00 + ((value - 0x10000) & 0x3ff)]
			: [value];
		return units.map((unit) => unit.toString(16).padStart(4, '0')).join('');
	}).join('')}`;
}

function buildPdf(pages: PdfPage[]) {
	const objects: Uint8Array[] = [];
	const add = (value: string | Uint8Array) => {
		objects.push(typeof value === 'string' ? new TextEncoder().encode(value) : value);
		return objects.length;
	};
	const catalogId = add('');
	const pagesId = add('');
	const fontNames = ['F1', 'F2', 'F3', 'F4'];
	const fontFaces = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Courier'];
	const fontIds = fontFaces.map((face) =>
		add(`<< /Type /Font /Subtype /Type1 /BaseFont /${face} /Encoding /WinAnsiEncoding >>`)
	);
	const pageRefs: number[] = [];
	pages.forEach((page) => {
		const imageRefs = page.images.map((image, index) => {
			const header = new TextEncoder().encode(
				`<< /Type /XObject /Subtype /Image /Width ${image.width * 3} /Height ${image.height * 3} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
			);
			const imageId = add(concat(header, image.bytes, new TextEncoder().encode('\nendstream')));
			return [`Im${index}`, imageId] as const;
		});
		const content = new TextEncoder().encode(page.commands.join('\n'));
		const contentId = add(
			concat(
				new TextEncoder().encode(`<< /Length ${content.length} >>\nstream\n`),
				content,
				new TextEncoder().encode('\nendstream')
			)
		);
		const fonts = fontNames.map((name, index) => `/${name} ${fontIds[index]} 0 R`).join(' ');
		const xobjects = imageRefs.map(([name, id]) => `/${name} ${id} 0 R`).join(' ');
		const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << ${fonts} >> /XObject << ${xobjects} >> >> /Contents ${contentId} 0 R >>`);
		pageRefs.push(pageId);
	});
	objects[catalogId - 1] = new TextEncoder().encode(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
	objects[pagesId - 1] = new TextEncoder().encode(
		`<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`
	);
	const header = new TextEncoder().encode('%PDF-1.4\n%âãÏÓ\n');
	const parts: Uint8Array[] = [header];
	const offsets = [0];
	let length = header.length;
	objects.forEach((object, index) => {
		const prefix = new TextEncoder().encode(`${index + 1} 0 obj\n`);
		const suffix = new TextEncoder().encode('\nendobj\n');
		offsets.push(length);
		parts.push(prefix, object, suffix);
		length += prefix.length + object.length + suffix.length;
	});
	const xrefOffset = length;
	const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
		.slice(1)
		.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
		.join(
			''
		)}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
	parts.push(new TextEncoder().encode(xref));
	return new Blob([concat(...parts)], { type: 'application/pdf' });
}

function concat(...parts: Uint8Array[]) {
	const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function safeFilename(title: string) {
	return (
		title
			.trim()
			.replace(/[\\/:*?"<>|]/g, '-')
			.split('')
			.map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
			.join('')
			.replace(/\s+/g, ' ')
			.slice(0, 100) || 'Untitled'
	);
}
