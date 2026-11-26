declare module 'pdfmake/build/pdfmake' {
	const pdfmake: {
		addVirtualFileSystem(files: Record<string, string>): void;
		addFonts(
			fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>
		): void;
		createPdf(document: Record<string, unknown>): { getBlob(): Promise<Blob> };
	};
	export default pdfmake;
}
