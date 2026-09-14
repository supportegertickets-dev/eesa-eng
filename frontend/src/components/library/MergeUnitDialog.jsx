'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { mergeUnit } from '@/lib/api';
import { placementLabel, plural } from '@/lib/library';
import Modal from '@/components/ui/Modal';

/** Move every file from one unit into another and delete the first: for duplicates and typos. */
export default function MergeUnitDialog({ unit, units, onClose, onMerged }) {
  const id = useId();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setTarget(''), [unit]);

  const options = useMemo(
    () => units.filter((candidate) => candidate._id !== unit?._id).sort((a, b) => a.code.localeCompare(b.code)),
    [units, unit]
  );

  const files = (unit?.files?.total || 0) + (unit?.files?.pending || 0);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await mergeUnit(unit._id, target);
      toast.success(result.message);
      onMerged?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(unit)}
      onClose={onClose}
      busy={busy}
      size="sm"
      title={`Merge ${unit?.code || 'unit'}`}
      description={unit
        ? `Move ${files ? plural(files, 'file') : 'every file'} from ${unit.code} into another unit, then delete ${unit.code}.`
        : ''}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost">Cancel</button>
          <button type="button" onClick={submit} disabled={!target || busy} className="btn-primary">
            {busy ? 'Merging…' : 'Merge units'}
          </button>
        </>
      )}
    >
      <label htmlFor={`${id}-target`} className="form-label">Merge into</label>
      <select id={`${id}-target`} value={target} onChange={(event) => setTarget(event.target.value)} className="input-field">
        <option value="">Choose a unit…</option>
        {options.map((candidate) => (
          <option key={candidate._id} value={candidate._id}>
            {candidate.code}{candidate.name ? ` · ${candidate.name}` : ''} ({placementLabel(candidate)})
          </option>
        ))}
      </select>
      <p className="form-hint">The files take on the chosen unit&apos;s year and semester.</p>
    </Modal>
  );
}
