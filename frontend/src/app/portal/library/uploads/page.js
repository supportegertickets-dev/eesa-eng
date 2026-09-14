'use client';

import { useState } from 'react';
import { HiUpload } from 'react-icons/hi';
import { getMyResources } from '@/lib/api';
import { useLibrary } from '@/components/library/LibraryProvider';
import ResourceCollection from '@/components/library/ResourceCollection';
import usePagedResources from '@/components/library/usePagedResources';
import EmptyState from '@/components/ui/EmptyState';
import FilterChips from '@/components/ui/FilterChips';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Awaiting review' },
  { id: 'approved', label: 'Published' },
  { id: 'rejected', label: 'Not approved' },
];

export default function MyUploadsPage() {
  const { version, openUpload } = useLibrary();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = usePagedResources(getMyResources, { status, page, limit: 20 }, version);

  return (
    <div>
      <div className="mb-4">
        <FilterChips
          label="Filter by status"
          options={FILTERS}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
        />
      </div>

      <ResourceCollection
        list={list}
        showStatus
        showLocation
        showUploader={false}
        onPageChange={setPage}
        emptyState={(
          <EmptyState
            icon={HiUpload}
            title={status ? 'Nothing here' : 'You have not uploaded anything yet'}
            description={status
              ? 'None of your uploads have this status.'
              : 'Share notes, past papers and other study material with your classmates.'}
            action="Upload files"
            onAction={() => openUpload()}
          />
        )}
      />
    </div>
  );
}
