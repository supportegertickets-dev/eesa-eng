/**
 * Print a document through a hidden frame rather than a popup, which browsers
 * may block. Printing waits until every image in it has loaded. "Save as PDF"
 * in the print dialog gives a PDF.
 */
export const printDocument = (html) => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  const cleanUp = () => setTimeout(() => frame.remove(), 1000);
  const images = [...doc.images];
  Promise.all(images.map((image) => (image.complete ? null : new Promise((resolve) => {
    image.onload = resolve;
    image.onerror = resolve;
  })))).then(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    cleanUp();
  });
};

export const escapeTitle = (title) => title.replace(/</g, '&lt;');

/** Save a data URL or blob URL as a file. */
export const downloadUrl = (url, fileName) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
};

/** Bundle images into a ZIP and download it. */
export const downloadZip = async (files, fileName) => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  files.forEach(({ name, dataUrl }) => zip.file(name, dataUrl.split(',')[1], { base64: true }));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
