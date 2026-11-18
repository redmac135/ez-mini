const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
export async function downloadPdf(html: string, title: string) {
	const canvases = renderPages(html);
	if (canvases.length > 100) throw new Error('This page is too long to export as a PDF.');
	const images: Uint8Array[] = [];
	for (const canvas of canvases) {
		const data = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('PDF rendering failed.'))),
				'image/jpeg',
				0.92
			)
		);
		images.push(new Uint8Array(await data.arrayBuffer()));
	}
	const blob = buildPdf(images);
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
	const canvases: HTMLCanvasElement[] = [];
	let canvas: HTMLCanvasElement;
	let context: CanvasRenderingContext2D;
	let y = 76;
	const left = 72;
	const right = PAGE_WIDTH - 72;
	const bottom = PAGE_HEIGHT - 76;
	const newPage = () => {
		canvas = document.createElement('canvas');
		canvas.width = PAGE_WIDTH * 2;
		canvas.height = PAGE_HEIGHT * 2;
		const next = canvas.getContext('2d');
		if (!next) throw new Error('PDF rendering is not supported in this browser.');
		context = next;
		context.scale(2, 2);
		context.fillStyle = '#fff';
		context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
		context.fillStyle = '#171717';
		y = 76;
		canvases.push(canvas);
	};
	newPage();
	const blocks = Array.from(root.children);
	const walkInline = (
		node: Node,
		style = { bold: false, italic: false, code: false }
	): Array<{ text: string; style: typeof style }> => {
		if (node.nodeType === Node.TEXT_NODE) return [{ text: node.textContent ?? '', style }];
		if (!(node instanceof HTMLElement)) return [];
		const tag = node.tagName.toLowerCase();
		const next = {
			bold: style.bold || tag === 'strong' || tag === 'b',
			italic: style.italic || tag === 'em' || tag === 'i',
			code: style.code || tag === 'code'
		};
		return Array.from(node.childNodes).flatMap((child) => walkInline(child, next));
	};
	const drawText = (
		segments: Array<{ text: string; style: { bold: boolean; italic: boolean; code: boolean } }>,
		maxWidth: number,
		indent = 0,
		lineHeight = 25
	) => {
		let x = left + indent;
		const lineRight = left + indent + maxWidth;
		let lineSegments: Array<{
			text: string;
			style: { bold: boolean; italic: boolean; code: boolean };
			width: number;
		}> = [];
		const drawLine = () => {
			if (y + lineHeight > bottom) newPage();
			for (const segment of lineSegments) {
				context.font = fontFor(segment.style);
				context.fillText(segment.text, x, y);
				x += segment.width;
			}
			y += lineHeight;
			x = left + indent;
			lineSegments = [];
		};
		for (const segment of segments) {
			const words = segment.text.match(/\s+|[^\s]+/gu) ?? [];
			for (const text of words) {
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
						{ text: marker, style: { bold: false, italic: false, code: false } },
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
				walkInline(element, { bold: true, italic: false, code: false }),
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
				context.fillStyle = '#f4f4f4';
				context.fillRect(left, y - 15, right - left, lineHeight);
				context.fillStyle = '#171717';
				context.font = '13px ui-monospace,monospace';
				drawText(
					[{ text: line, style: { bold: false, italic: false, code: true } }],
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
	return canvases;
}

function fontFor(style: { bold: boolean; italic: boolean; code: boolean }) {
	const family = style.code
		? 'ui-monospace,monospace'
		: 'system-ui,-apple-system,"Segoe UI",sans-serif';
	return `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : ''}16px ${family}`;
}

function buildPdf(images: Uint8Array[]) {
	const objects: Uint8Array[] = [];
	const add = (value: string | Uint8Array) => {
		objects.push(typeof value === 'string' ? new TextEncoder().encode(value) : value);
		return objects.length;
	};
	const catalogId = add('');
	const pagesId = add('');
	const pageRefs: number[] = [];
	images.forEach((image, index) => {
		const imageId = add('');
		const imageHeader = new TextEncoder().encode(
			`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH * 2} /Height ${PAGE_HEIGHT * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`
		);
		objects[imageId - 1] = concat(imageHeader, image, new TextEncoder().encode('\nendstream'));
		const content = new TextEncoder().encode(
			`q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im${index} Do Q`
		);
		const contentId = add(
			concat(
				new TextEncoder().encode(`<< /Length ${content.length} >>\nstream\n`),
				content,
				new TextEncoder().encode('\nendstream')
			)
		);
		const pageId = add(
			`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
		);
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
