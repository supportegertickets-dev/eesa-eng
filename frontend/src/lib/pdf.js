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
let sharedWorker = null;

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

/**
 * One worker for every PDF the page opens.
 *
 * PDF.js starts a new worker for each document unless it is handed one. The
 * upload dialog reads every chosen PDF to suggest its unit, so uploading a
 * batch and then opening a preview left several workers each holding a whole
 * file. Phones ran short of memory and the preview failed until the page was
 * reloaded.
 */
const getWorker = (pdfjs) => {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new pdfjs.PDFWorker();
  return sharedWorker;
};

/**
 * Open a PDF from a Blob or File on the shared worker.
 *
 * If loading fails for a reason other than the file itself, the worker is
 * replaced and the file tried once more. Aborting `signal` cancels a load still
 * in progress. Destroy the returned document when finished with it; that
 * leaves the shared worker running for the next one.
 */
export const loadPdfDocument = async (source, { signal } = {}) => {
  const pdfjs = await loadPdfJs();

  for (let attempt = 1; ; attempt += 1) {
    // PDF.js takes ownership of the bytes it is given, so each attempt reads them afresh.
    const data = new Uint8Array(await source.arrayBuffer());
    if (signal?.aborted) throw new DOMException('The PDF was closed before it opened.', 'AbortError');

    const task = pdfjs.getDocument({ data, worker: getWorker(pdfjs), isEvalSupported: false });
    const cancel = () => task.destroy();
    signal?.addEventListener('abort', cancel, { once: true });

    try {
      return await task.promise;
    } catch (error) {
      task.destroy();
      // A damaged or password-protected file fails the same way on any worker.
      if (signal?.aborted || attempt >= 2 || ['InvalidPDFException', 'PasswordException'].includes(error?.name)) throw error;
      sharedWorker?.destroy();
      sharedWorker = null;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }
};
