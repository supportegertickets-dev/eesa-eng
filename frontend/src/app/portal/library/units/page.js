'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiBadgeCheck, HiCollection, HiPencil, HiPlus, HiSearch, HiSwitchHorizontal, HiTrash, HiUpload } from 'react-icons/hi';
import { deleteUnit, getUnits, updateUnit } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { plural } from '@/lib/library';
import { useLibrary } from '@/components/library/LibraryProvider';
import MergeUnitDialog from '@/components/library/MergeUnitDialog';
import UnitFormDialog from '@/components/library/UnitFormDialog';
import UnitImportDialog from '@/components/library/UnitImportDialog';
import ActionMenu from '@/components/ui/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';

const OTHER = 'Other units';

export default function UnitsPage() {
  const { isAdmin } = useAuth();
  const { version, refresh } = useLibrary();

  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [merging, setMerging] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      const data = await getUnits('?scope=all');
      setUnits(data.units || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load, version]);

  const counts = useMemo(() => ({
    all: units.length,
    unconfirmed: units.filter((unit) => !unit.verified).length,
    unnamed: units.filter((unit) => !unit.name).length,
  }), [units]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const compact = query.replace(/[\s_-]+/g, '');
    const visible = units.filter((unit) => (
      (filter !== 'unconfirmed' || !unit.verified)
      && (filter !== 'unnamed' || !unit.name)
      && (!query || unit.code.toLowerCase().replace(/\s+/g, '').includes(compact) || (unit.name || '').toLowerCase().includes(query))
    ));

    const byPlacement = new Map();
    visible.forEach((unit) => {
      const key = unit.year ? `Year ${unit.year} · Semester ${unit.semester}` : OTHER;
      if (!byPlacement.has(key)) byPlacement.set(key, []);
      byPlacement.get(key).push(unit);
    });
    return [...byPlacement.entries()].sort(([a], [b]) => (a === OTHER) - (b === OTHER) || a.localeCompare(b));
  }, [units, search, filter]);

  const confirmUnit = async (unit) => {
    try {
      await updateUnit(unit._id, { verified: true });
      toast.success(`${unit.code} confirmed.`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const requestDelete = (unit) => {
    const files = (unit.files?.total || 0) + (unit.files?.pending || 0);
    if (files) {
      toast.error(`${unit.code} has ${plural(files, 'file')}. Merge it into another unit instead.`);
      return;
    }
    setDeleting(unit);
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteUnit(deleting._id);
      toast.success(`${deleting.code} deleted.`);
      setDeleting(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <EmptyState
        icon={HiCollection}
        title="Reviewers only"
        description="Only administrators and the chairperson manage units."
        action="Back to the library"
        actionHref="/portal/library"
      />
    );
  }

  let content;
  if (loading) {
    content = <LoadingRegion label="Loading units"><SkeletonList count={4} /></LoadingRegion>;
  } else if (error) {
    content = <ErrorState error={error} onRetry={load} />;
  } else if (!units.length) {
    content = (
      <EmptyState
        icon={HiCollection}
        title="No units yet"
        description="Add units one at a time, or paste a whole list with Import. Units are also created when members upload files for a unit that is not listed."
        action="Import units"
        onAction={() => setImporting(true)}
      />
    );
  } else if (!groups.length) {
    content = <EmptyState icon={HiSearch} title="No units match" description="Try a different code or name, or clear the filter." />;
  } else {
    content = (
      <div className="space-y-5">
        {groups.map(([label, list]) => (
          <section key={label} className="card !p-0">
            <h2 className="px-4 sm:px-5 py-3 border-b border-line font-heading text-sm font-semibold text-strong">
              {label}<span className="font-normal text-subtle"> · {plural(list.length, 'unit')}</span>
            </h2>
            <ul className="divide-y divide-line">
              {list.map((unit) => (
                <li key={unit._id} className="px-4 sm:px-5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold text-strong">{unit.code}</span>
                      {unit.name
                        ? <span className="text-body"> · {unit.name}</span>
                        : <span className="text-subtle italic"> · No name yet</span>}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                      <span>{plural(unit.files?.total || 0, 'published file')}</span>
                      {unit.files?.pending > 0 && <span>{unit.files.pending} awaiting review</span>}
                      {!unit.verified && <span className="badge-warning">Unconfirmed</span>}
                    </p>
                  </div>
                  {!unit.verified && (
                    <button type="button" onClick={() => confirmUnit(unit)} className="btn-ghost btn-sm hidden sm:inline-flex">
                      <HiBadgeCheck className="w-4 h-4" aria-hidden="true" /> Confirm
                    </button>
                  )}
                  <ActionMenu
                    label={`Actions for ${unit.code}`}
                    actions={[
                      ...(!unit.verified ? [{ label: 'Confirm', icon: HiBadgeCheck, onClick: () => confirmUnit(unit) }] : []),
                      { label: 'Edit', icon: HiPencil, onClick: () => setEditing(unit) },
                      { label: 'Merge into…', icon: HiSwitchHorizontal, onClick: () => setMerging(unit) },
                      { label: 'Delete', icon: HiTrash, danger: true, onClick: () => requestDelete(unit) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted-fg mb-4 max-w-3xl">
        Units are the folders files are filed under. A unit created by a member&apos;s upload stays unconfirmed until you
        approve a file in it or confirm it here.
      </p>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-faint pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a unit by code or name"
            aria-label="Find a unit"
            className="input-field pl-11"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setImporting(true)} className="btn-outline flex-1 lg:flex-none">
            <HiUpload className="w-4 h-4" aria-hidden="true" /> Import
          </button>
          <button type="button" onClick={() => setEditing({})} className="btn-primary flex-1 lg:flex-none">
            <HiPlus className="w-4 h-4" aria-hidden="true" /> Add unit
          </button>
        </div>
      </div>

      <div className="mb-5">
        <FilterChips
          label="Filter units"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'unconfirmed', label: 'Unconfirmed', count: counts.unconfirmed },
            { id: 'unnamed', label: 'Missing a name', count: counts.unnamed },
          ]}
        />
      </div>

      {content}

      <UnitFormDialog
        unit={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
      <UnitImportDialog open={importing} onClose={() => setImporting(false)} onImported={refresh} />
      <MergeUnitDialog
        unit={merging}
        units={units}
        onClose={() => setMerging(null)}
        onMerged={() => {
          setMerging(null);
          refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.code || 'this unit'}?`}
        description="The unit has no files, so nothing else is affected."
        confirmLabel="Delete unit"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
