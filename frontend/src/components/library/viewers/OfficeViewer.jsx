'use client';

import { useState } from 'react';

const OFFICE_VIEWER = 'https://view.officeapps.live.com/op/embed.aspx?src=';

/**
 * Preview for formats a browser cannot render (PowerPoint, Excel and older Word
 * files), using Microsoft's online viewer.
 *
 * The viewer fetches the file from the API itself, through the same
 * five-minute, single-file ticket the app uses, so the link it receives stops
 * working shortly afterwards. It cannot reach a backend on localhost, so these
 * previews only work against a deployed API.
 */
export default function OfficeViewer({ url, fileName }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="h-full flex flex-col">
      <div className="relative flex-1 min-h-0 bg-white">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <span className="w-10 h-10 animate-spin rounded-full border-4 border-white/80 border-t-transparent" aria-label="Loading preview" />
          </div>
        )}
        <iframe
          src={`${OFFICE_VIEWER}${encodeURIComponent(url)}`}
          title={`Preview of ${fileName}`}
          className="w-full h-full border-0"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
        />
      </div>
      <p className="px-4 py-2 text-xs text-white/60 bg-gray-900 border-t border-white/10">
        Preview by Microsoft Office Online. If it stays blank, use Download.
      </p>
    </div>
  );
}
