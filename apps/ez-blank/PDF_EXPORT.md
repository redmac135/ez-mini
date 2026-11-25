# PDF export

The editor passes its existing parsed document to pdfmake 0.3.14. Formatted output maps its blocks and inline spans to pdfmake content; source output uses the document's original Markdown text. pdfmake lays out A4 pages and produces a local Blob for download. No document text is sent to a server, inserted as HTML, printed, or rasterized. The app's service worker caches the build and bundled fonts for subsequent offline use. Initial installation and successful caching are required.

## Choice and size

pdfmake was chosen for its browser Blob API, pagination and relatively small dependency surface. Its production JavaScript chunk is about 772 kB minified (290 kB gzip), loaded on demand. Fonts add about 31 MB uncompressed, mostly CJK; the service worker caches them. Roboto Mono matches the editor's primary font, with Noto fallbacks for scripts it does not cover. Font licenses are alongside the files. pdfmake does not support automatic cross-font fallback here, so the app selects a bundled font for each grapheme and reports unsupported characters instead of silently dropping them.

Other evaluated approaches: @react-pdf/renderer adds React and Yoga and also showed Hindi extraction errors; Typst's browser compiler adds roughly 28 MB of WASM and produced viewer-dependent complex-script extraction; Vivliostyle's browser output requires printing; and wasm-html-to-image produced broken complex-script extraction in the evaluated PDF. The prior hand-built PDF renderer paginated scraped HTML and had text and layout defects. pdfmake is the simplest evaluated option that meets the local, direct-download and vector-text requirements, but it does not solve all reader fidelity problems.

## Known limitations and future work

- Complex scripts are shaped into glyphs before PDF encoding. In pdf.js, `हिन्दी` extracts as `िहन्दी`; longer Hindi strings can also gain spaces. Search and copy of those strings may therefore fail. Improve logical Unicode extraction when the library or a suitable replacement supports it without bespoke glyph mapping.
- Mixed right-to-left text, ligatures, adjacent emoji and spaces can be ordered differently by PDF readers. In a prior Chromium native viewer test, mixed Arabic/Hebrew and emoji selection returned replacement characters and lost a space. pdf.js and PDFium do not always agree. Recheck search, selection and copy in each target reader when improving complex-script support; do not assume cross-reader fidelity.
- Bundled font coverage is finite. Unsupported characters or grapheme combinations fail export with an error instead of producing an incomplete PDF. Noto fallback fonts use the same face for bold and italic, so styling may be lost outside the primary font. Emoji are monochrome and complex emoji sequences may not render as expected. Expand coverage and style variants as needed.
- Rich editor formatting beyond the supported AST nodes, such as links or nesting behavior not represented by the current editor model, may not match the screen exactly. Long documents and very long unbroken words should be checked across readers when layout behavior changes.
- Offline export depends on the service worker having cached the PDF chunk and needed fonts. A first visit or interrupted installation without network can leave assets unavailable; the dialog reports the error and permits retry.

Focused browser tests cover formatted and literal output, direct download without a new tab, A4 pagination, long wrapping, vector text and PDF.js/PDFium extraction for supported examples. These tests do not establish fidelity for every language or reader.
