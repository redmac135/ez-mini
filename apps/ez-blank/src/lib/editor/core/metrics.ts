export type CountDisplayMode = 'words' | 'characters' | 'paragraphs' | 'lines';

export type MobileCountVisibilityOption = 'shown' | 'hidden';

export interface CountOption {
	id: CountDisplayMode;
	label: string;
}

export function buildCountOptions(text: string): readonly CountOption[] {
	return [
		{ id: 'words', label: pluralize(getWordCount(text), 'word') },
		{ id: 'characters', label: pluralize(text.length, 'character') },
		{ id: 'paragraphs', label: pluralize(getParagraphCount(text), 'paragraph') },
		{ id: 'lines', label: pluralize(getLineCount(text), 'line') }
	] as const;
}

function getWordCount(value: string) {
	const trimmed = value.trim();
	return trimmed ? trimmed.split(/\s+/).length : 0;
}

function getParagraphCount(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\n\s*\n+/).filter(Boolean).length;
}

function getLineCount(value: string) {
	if (!value) return 0;
	return value.split('\n').length;
}

function pluralize(count: number, label: string) {
	return `${count} ${label}${count === 1 ? '' : 's'}`;
}
