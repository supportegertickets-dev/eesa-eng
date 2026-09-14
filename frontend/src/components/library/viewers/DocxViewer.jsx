'use client';

import { useEffect, useRef, useState } from 'react';

/** Word (.docx) preview, rendered in the page with docx-preview. */
export default function DocxViewer({ blob, onError }) {
  const scrollRef = useRef(null);
  const hostRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    let cancelled = false;
    setReady(false);
    setScale(1);

    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled || !host) return;
        host.innerHTML = '';
        await renderAsync(blob, host, host, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          // Data URLs, so embedded images need no object URLs to clean up.
          useBase64URL: true,
        });
        if (!cancelled) setReady(true);
      } catch (error) {
        if (!cancelled) onErrorRef.current?.(error);
      }
    })();

    return () => {
      cancelled = true;
      if (host) host.innerHTML = '';
    };
  }, [blob]);

  // Word pages have a fixed paper width; shrink them to fit a phone screen.
  useEffect(() => {
    const container = scrollRef.current;
    const page = hostRef.current?.querySelector('section.docx');
    if (!ready || !container || !page) return undefined;

    const pageWidth = page.offsetWidth + 32;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / pageWidth)));
    observer.observe(container);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-gray-800">
      {!ready && (
        <div className="h-full flex items-center justify-center">
          <span className="w-10 h-10 animate-spin rounded-full border-4 border-white/80 border-t-transparent" aria-label="Opening document" />
        </div>
      )}
      <div ref={hostRef} className="docx-preview-host" style={{ zoom: scale }} hidden={!ready} />
    </div>
  );
}
