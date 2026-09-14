/**
 * Copy the PDF.js worker into public/ so it is served as a static file.
 *
 * Next 14's minifier cannot parse the worker's ES module syntax, so the worker
 * must not go through the bundler. This runs before `dev` and `build`, so the
 * copy always matches the installed pdfjs-dist version. The copy is gitignored.
 */
const fs = require('fs');
const path = require('path');

const packageDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const source = path.join(packageDir, 'legacy', 'build', 'pdf.worker.min.mjs');
const target = path.join(__dirname, '..', 'public', 'pdfjs', 'pdf.worker.min.mjs');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
