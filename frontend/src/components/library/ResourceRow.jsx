'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { HiDocument, HiDocumentText, HiEye, HiPhotograph, HiPresentationChartBar, HiTable } from 'react-icons/hi';
import {
  KIND_STYLES, STATUS_BADGES, STATUS_LABELS, TYPE_LABELS, formatBytes, placementLabel, resourceKind, unitHref,
} from '@/lib/library';
import ActionMenu from '@/components/ui/ActionMenu';

const KIND_ICONS = {
  pdf: HiDocumentText,
  word: HiDocumentText,
  text: HiDocumentText,
  slides: HiPresentationChartBar,
  sheet: HiTable,
  image: HiPhotograph,
  file: HiDocument,
};

export function FileIcon({ kind, className = 'w-11 h-11' }) {
  const Icon = KIND_ICONS[kind] || HiDocument;
  return (
    <span className={`${className} rounded-lg flex items-center justify-center shrink-0 ${KIND_STYLES[kind]?.className || KIND_STYLES.file.className}`} aria-hidden="true">
      <Icon className="w-6 h-6" />
    </span>
  );
}

/** One library file in a list, with its location, details and an actions menu. */
export default function ResourceRow({
  resource,
  onOpen,
  actions = [],
  showStatus = false,
  showLocation = false,
  showUploader = true,
  footer,
}) {
  const kind = resourceKind(resource);
  const { unit, uploadedBy } = resource;

  return (
    <li className="card !p-4">
      <div className="flex items-start gap-3 sm:gap-4">
        <button type="button" onClick={() => onOpen(resource)} className="rounded-lg" aria-label={`Preview ${resource.title}`}>
          <FileIcon kind={kind} />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(resource)}
            className="text-left font-semibold text-strong hover:text-primary-500 dark:hover:text-primary-300 transition-colors line-clamp-2 break-words"
          >
            {resource.title}
          </button>
          {resource.description && <p className="mt-0.5 text-sm text-muted-fg line-clamp-2">{resource.description}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-subtle">
            {showStatus && <span className={STATUS_BADGES[resource.status]}>{STATUS_LABELS[resource.status]}</span>}
            <span className="badge-neutral">{TYPE_LABELS[resource.category] || TYPE_LABELS.other}</span>
            {showLocation && (unit ? (
              <Link href={unitHref(unit)} className="font-medium text-body hover:text-primary-500 dark:hover:text-primary-300">
                {unit.code}<span className="font-normal text-subtle"> · {placementLabel(unit)}</span>
              </Link>
            ) : resource.unitCode && <span className="font-medium text-body">{resource.unitCode}</span>)}
            <span>{KIND_STYLES[kind].label} · {formatBytes(resource.fileSize)}</span>
            {showUploader && uploadedBy?.firstName && <span>By {uploadedBy.firstName} {uploadedBy.lastName}</span>}
            <time dateTime={resource.createdAt}>{format(new Date(resource.createdAt), 'd MMM yyyy')}</time>
            {resource.status === 'approved' && (
              <span className="inline-flex items-center gap-1" title="Members who have opened this file">
                <HiEye className="w-3.5 h-3.5" aria-hidden="true" />
                {resource.downloads || 0}
                <span className="sr-only"> members opened this file</span>
              </span>
            )}
          </div>

          {resource.status === 'rejected' && resource.rejectionReason && (
            <p className="mt-2 text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">Not approved: {resource.rejectionReason}</p>
          )}
          {footer}
        </div>

        {actions.length > 0 && <ActionMenu label={`Actions for ${resource.title}`} actions={actions} />}
      </div>
    </li>
  );
}
