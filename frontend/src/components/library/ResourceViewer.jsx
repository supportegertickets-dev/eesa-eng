'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { HiDocument, HiDownload, HiExternalLink, HiRefresh, HiX } from 'react-icons/hi';
import { getResourceFileUrl, trackDownload } from '@/lib/api';
import { TYPE_LABELS, formatBytes, resourceKind } from '@/lib/library';
import OfficeViewer from '@/components/library/viewers/OfficeViewer';

function Centered({ children }) {
  return <div className="h-full flex flex-col items-center justify-center text-center p-6">{children}</div>;
}

function Spinner() {
  return <span className="w-10 h-10 animate-spin rounded-full border-4 border-white/80 border-t-transparent" aria-hidden="true" />;
}

// PDF.js and docx-preview are large; load them only when such a file is opened.
const PdfViewer = dynamic(() => import('@/components/library/viewers/PdfViewer'), {
  ssr: false,
  loading: () => <Centered><Spinner /></Centered>,
});
const DocxViewer = dynamic(() => import('@/components/library/viewers/DocxViewer'), {
  ssr: false,
  loading: () => <Centered><Spinner /></Centered>,
});

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** How a file is shown: rendered in the page, by Office Online, or not at all. */
const previewMode = (resource) => {
  const kind = resourceKind(resource);
  if (['pdf', 'image', 'text'].includes(kind)) return kind;
  if (kind === 'word' && (resource.fileType === DOCX_TYPE || /\.docx$/i.test(resource.originalFileName || ''))) return 'docx';
  if (['word', 'slides', 'sheet'].includes(kind)) return 'office';
  return 'none';
};

/** Fetch a file while reporting progress, so a large file on a slow connection visibly moves. */
const fetchWithProgress = async (url, { expectedSize, type, signal, onProgress }) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    let message = 'The file could not be loaded.';
    try {
      message = (await response.json()).message || message;
    } catch {
      // Not a JSON error body.
    }
    throw new Error(message);
  }

  const total = Number(response.headers.get('content-length')) || expectedSize || 0;
  if (!response.body || !total) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(99, Math.round((received / total) * 100)));
  }
  return new Blob(chunks, { type: type || response.headers.get('content-type') || '' });
};

function ImagePreview({ src, alt }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div className="h-full overflow-auto">
      <div className="min-h-full min-w-full w-max flex p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={() => setZoomed((current) => !current)}
          className={`m-auto rounded ${zoomed
            ? 'max-w-none cursor-zoom-out'
            : 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7rem)] object-contain cursor-zoom-in'}`}
        />
      </div>
    </div>
  );
}

/**
 * Full-screen preview of a library file.
 *
 * PDFs are drawn with PDF.js, so they display the same on phones as on
 * desktops; Word documents are rendered in the page; PowerPoint and Excel use
 * Office Online. The file is fetched once through a short-lived ticket, and
 * Download then saves that copy rather than fetching it again.
 */
export default function ResourceViewer({ resource, onClose, actions }) {
  const mode = previewMode(resource);
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', progress: 0 });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    document.body.classList.add('overflow-hidden');

    const onKeyDown = (event) => {
      // Leave Escape to a dialog opened on top of the preview.
      if (event.key !== 'Escape' || document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      closeRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('overflow-hidden');
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = null;
    setState({ status: 'loading', progress: 0 });

    (async () => {
      if (mode === 'none') {
        setState({ status: 'unsupported' });
        return;
      }
      try {
        const url = await getResourceFileUrl(resource._id);
        if (controller.signal.aborted) return;

        if (mode === 'office') {
          setState({ status: 'ready', url });
        } else {
          const blob = await fetchWithProgress(url, {
            expectedSize: resource.fileSize,
            type: resource.fileType,
            signal: controller.signal,
            onProgress: (progress) => setState((current) => ({ ...current, progress })),
          });
          const text = mode === 'text' ? await blob.text() : null;
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setState({ status: 'ready', blob, objectUrl, text });
        }

        // The API counts each member once, however often they open the file.
        trackDownload(resource._id).catch(() => {});
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: 'error', error });
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resource._id, resource.fileSize, resource.fileType, mode, attempt]);

  const fileName = resource.originalFileName || resource.title;

  const download = async () => {
    if (state.objectUrl) {
      const link = document.createElement('a');
      link.href = state.objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    try {
      window.location.assign(await getResourceFileUrl(resource._id, { download: true }));
      trackDownload(resource._id).catch(() => {});
    } catch (error) {
      toast.error(error.message || 'That file could not be downloaded.');
    }
  };

  const failPreview = (error) => {
    // The member only sees the friendly message; the cause stays in the console for diagnosis.
    console.warn(`Preview of resource ${resource._id} failed:`, error);
    setState({
      status: 'error',
      error: new Error('This file could not be displayed here. Download it to open it on your device.'),
    });
  };

  let body;
  if (state.status === 'loading') {
    body = (
      <Centered>
        <Spinner />
        <p className="mt-4 text-sm text-white/70" aria-live="polite">
          {mode === 'office' ? 'Preparing preview…' : state.progress ? `Loading file… ${state.progress}%` : 'Loading file…'}
        </p>
        {state.progress > 0 && (
          <div className="mt-3 h-1.5 w-48 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full bg-white transition-all duration-200" style={{ width: `${state.progress}%` }} />
          </div>
        )}
      </Centered>
    );
  } else if (state.status === 'error' || state.status === 'unsupported') {
    const failed = state.status === 'error';
    body = (
      <Centered>
        <HiDocument className="w-14 h-14 text-white/40" aria-hidden="true" />
        <p className="mt-4 text-lg font-medium text-white">{failed ? 'This file could not be opened' : 'No preview for this type of file'}</p>
        <p className="mt-1 text-sm text-white/60 max-w-sm">{failed ? state.error?.message : 'Download it to open it on your device.'}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {failed && (
            <button type="button" onClick={() => setAttempt((count) => count + 1)} className="btn bg-white/10 hover:bg-white/20 text-white">
              <HiRefresh className="w-4 h-4" aria-hidden="true" /> Try again
            </button>
          )}
          <button type="button" onClick={download} className="btn-primary">
            <HiDownload className="w-4 h-4" aria-hidden="true" /> Download
          </button>
        </div>
      </Centered>
    );
  } else if (mode === 'pdf') {
    body = <PdfViewer blob={state.blob} onError={failPreview} />;
  } else if (mode === 'docx') {
    body = <DocxViewer blob={state.blob} onError={failPreview} />;
  } else if (mode === 'office') {
    body = <OfficeViewer url={state.url} fileName={fileName} />;
  } else if (mode === 'image') {
    body = <ImagePreview src={state.objectUrl} alt={resource.title} />;
  } else {
    body = (
      <div className="h-full overflow-auto">
        <pre className="max-w-4xl mx-auto p-4 sm:p-8 text-sm leading-relaxed text-gray-100 whitespace-pre-wrap break-words font-mono">{state.text}</pre>
      </div>
    );
  }

  const meta = [resource.unit?.code || resource.unitCode, TYPE_LABELS[resource.category], formatBytes(resource.fileSize)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${resource.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-gray-950 focus:outline-none"
    >
      <header className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-gray-900 text-white border-b border-white/10">
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close preview">
          <HiX className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm sm:text-base truncate">{resource.title}</h2>
          <p className="text-xs text-white/60 truncate">{meta}</p>
        </div>
        {actions}
        {state.objectUrl && mode !== 'docx' && (
          <a
            href={state.objectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex btn btn-sm bg-white/10 hover:bg-white/20 text-white"
          >
            <HiExternalLink className="w-4 h-4" aria-hidden="true" /> New tab
          </a>
        )}
        <button type="button" onClick={download} className="btn btn-sm bg-white/10 hover:bg-white/20 text-white" aria-label="Download">
          <HiDownload className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Download</span>
        </button>
      </header>

      <div className="flex-1 min-h-0">{body}</div>
    </div>
  );
}
