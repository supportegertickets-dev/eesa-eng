'use client';

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HiChevronLeft, HiChevronRight, HiMinus, HiPlus } from 'react-icons/hi';
import { loadPdfDocument } from '@/lib/pdf';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MAX_FIT_WIDTH = 960;
// Mobile Safari refuses canvases much above 16 megapixels.
const MAX_CANVAS_PIXELS = 16000000;
const PAGE_PADDING = 16;

/**
 * One page. It renders only while near the viewport and releases its canvas
 * when scrolled far away, so a long PDF does not exhaust a phone's memory.
 */
const PdfPage = forwardRef(function PdfPage({ doc, pageNumber, width, fallbackRatio, scrollRoot }, ref) {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState(null);
  const [rendered, setRendered] = useState(false);

  const setHolder = useCallback((node) => {
    holderRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  useEffect(() => {
    const node = holderRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { root: scrollRoot.current, rootMargin: '1500px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!near) {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      setRendered(false);
      return undefined;
    }

    let cancelled = false;
    let task = null;

    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(
          (width / base.width) * pixelRatio,
          Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height))
        );
        const viewport = page.getViewport({ scale });

        // Draw off screen and swap in, so zooming never flashes a blank page.
        const buffer = document.createElement('canvas');
        buffer.width = Math.floor(viewport.width);
        buffer.height = Math.floor(viewport.height);
        task = page.render({ canvasContext: buffer.getContext('2d'), viewport });
        await task.promise;
        if (cancelled || !canvasRef.current) return;

        const target = canvasRef.current;
        target.width = buffer.width;
        target.height = buffer.height;
        target.getContext('2d').drawImage(buffer, 0, 0);
        buffer.width = 0;
        setRendered(true);
      } catch (error) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') {
          console.warn(`Could not render page ${pageNumber}:`, error);
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, pageNumber, width]);

  return (
    <div
      ref={setHolder}
      className="relative mx-auto bg-white shadow-lg shrink-0"
      style={{ width, height: Math.round(width * (ratio || fallbackRatio)) }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" role="img" aria-label={`Page ${pageNumber}`} />
      {!rendered && (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-400" aria-hidden="true">
          Page {pageNumber}
        </span>
      )}
    </div>
  );
});

function ToolButton({ label, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
      {...props}
    >
      {children}
    </button>
  );
}

/** Continuous-scroll PDF reader with page navigation and zoom. */
export default function PdfViewer({ blob, onError }) {
  const scrollRef = useRef(null);
  const pageRefs = useRef([]);
  const anchorRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [doc, setDoc] = useState(null);
  const [fallbackRatio, setFallbackRatio] = useState(1.414);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    let loaded = null;

    (async () => {
      try {
        loaded = await loadPdfDocument(blob, { signal: controller.signal });
        if (controller.signal.aborted) {
          loaded.destroy();
          return;
        }
        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (controller.signal.aborted) return;
        setFallbackRatio(viewport.height / viewport.width);
        setDoc(loaded);
      } catch (error) {
        if (!controller.signal.aborted) onErrorRef.current?.(error);
      }
    })();

    return () => {
      controller.abort();
      loaded?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitWidth = Math.max(160, Math.min(containerWidth - PAGE_PADDING * 2, MAX_FIT_WIDTH));
  const pageWidth = Math.round(fitWidth * zoom);

  // Keep the reader's place in the document when the zoom changes.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (anchorRef.current === null || !node) return;
    node.scrollTop = anchorRef.current * node.scrollHeight;
    anchorRef.current = null;
  }, [pageWidth]);

  const changeZoom = (next) => {
    const node = scrollRef.current;
    if (node) anchorRef.current = node.scrollTop / Math.max(1, node.scrollHeight);
    setZoom(next);
  };

  const stepZoom = (direction) => {
    const index = ZOOM_STEPS.findIndex((step) => step >= zoom - 0.001);
    const from = index === -1 ? ZOOM_STEPS.length - 1 : index;
    changeZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, from + direction))]);
  };

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const marker = node.scrollTop + node.clientHeight / 3;
    let page = 1;
    pageRefs.current.forEach((pageNode, index) => {
      if (pageNode && pageNode.offsetTop <= marker) page = index + 1;
    });
    setCurrentPage(page);
  };

  const goToPage = (pageNumber) => {
    const node = scrollRef.current;
    const target = pageRefs.current[pageNumber - 1];
    if (node && target) node.scrollTo({ top: target.offsetTop - PAGE_PADDING, behavior: 'smooth' });
  };

  const pageCount = doc?.numPages || 0;

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 min-h-0 overflow-auto bg-gray-800">
        {!doc || !containerWidth ? (
          <div className="h-full flex items-center justify-center">
            <span className="w-10 h-10 animate-spin rounded-full border-4 border-white/80 border-t-transparent" aria-label="Opening PDF" />
          </div>
        ) : (
          <div className="w-max min-w-full flex flex-col gap-4 p-4">
            {Array.from({ length: pageCount }, (_, index) => (
              <PdfPage
                key={index}
                ref={(node) => { pageRefs.current[index] = node; }}
                doc={doc}
                pageNumber={index + 1}
                width={pageWidth}
                fallbackRatio={fallbackRatio}
                scrollRoot={scrollRef}
              />
            ))}
          </div>
        )}
      </div>

      {doc && (
        <div className="flex items-center justify-center gap-1 sm:gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gray-900 text-white text-sm border-t border-white/10">
          <ToolButton label="Previous page" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            <HiChevronLeft className="w-5 h-5" aria-hidden="true" />
          </ToolButton>
          <span className="tabular-nums px-1 sm:px-2 whitespace-nowrap" aria-live="polite">
            <span className="sr-only">Page </span>{currentPage} / {pageCount}
          </span>
          <ToolButton label="Next page" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount}>
            <HiChevronRight className="w-5 h-5" aria-hidden="true" />
          </ToolButton>

          <span className="w-px h-5 bg-white/20 mx-1 sm:mx-2" aria-hidden="true" />

          <ToolButton label="Zoom out" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]}>
            <HiMinus className="w-5 h-5" aria-hidden="true" />
          </ToolButton>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            className="tabular-nums min-w-[3.5rem] px-2 py-1 rounded-md hover:bg-white/10"
            title="Fit to width"
            aria-label={`Zoom ${Math.round(zoom * 100)}%. Fit to width`}
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton label="Zoom in" onClick={() => stepZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}>
            <HiPlus className="w-5 h-5" aria-hidden="true" />
          </ToolButton>
        </div>
      )}
    </div>
  );
}
