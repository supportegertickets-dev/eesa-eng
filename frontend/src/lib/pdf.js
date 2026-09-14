/**
 * Lazy loader for PDF.js.
 *
 * The library is large, so it is fetched only when a PDF is previewed or
 * scanned, never on page load. The legacy build keeps older phone browsers
 * working.
 *
 * The worker is served from public/ rather than bundled: Next 14's minifier
 * cannot parse its module syntax. scripts/copy-pdf-worker.js puts it there
 * before every dev and build run, so it always matches the installed version.
 */
const WORKER_SRC = '/pdfjs/pdf.worker.min.mjs';

let pdfjsPromise = null;

export const loadPdfJs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        return pdfjs;
      })
      .catch((error) => {
        // Let a later attempt retry, e.g. after a dropped connection.
        pdfjsPromise = null;
        throw error;
      });
  }
  return pdfjsPromise;
};
