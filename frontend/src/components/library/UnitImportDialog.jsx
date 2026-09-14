'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { importUnits } from '@/lib/api';
import { SEMESTERS, YEARS, normalizeUnitCode, plural } from '@/lib/library';
import Modal from '@/components/ui/Modal';

const MAX_ROWS = 500;

const EXAMPLE = `EEEN 481, Project Management, 4, 2
EEEN 436, Power Electronics, 4, 1
EEEN 216, Introduction to Principles of Electrical Engineering`;

/**
 * Read one pasted line into a unit.
 *
 * Columns may be separated by commas or tabs (rows pasted from a spreadsheet),
 * and "EEEN 481 - Project Management" works on its own. The year and semester
 * are read from the end of the line, so a comma inside a name is kept.
 */
export const parseUnitLine = (line, defaults) => {
  const parts = line.split(line.includes('\t') ? '\t' : ',').map((part) => part.trim());

  const numbers = [];
  while (parts.length > 1 && numbers.length < 2 && /^\d$/.test(parts[parts.length - 1])) {
    numbers.unshift(Number(parts.pop()));
  }

  const head = parts.shift().match(/^([A-Za-z]{2,6}[\s_-]*\d{3,4})\s*[-–—:·|.]?\s*(.*)$/);
  const code = head ? normalizeUnitCode(head[1]) : null;
  const name = [head?.[2], ...parts].filter(Boolean).join(', ').slice(0, 150);

  let year = defaults.year === '' ? null : Number(defaults.year);
  let semester = defaults.semester === '' ? null : Number(defaults.semester);
  if (numbers.length === 2) [year, semester] = numbers;

  let problem = null;
  if (!code) problem = 'No unit code at the start of the line.';
  else if (numbers.length === 1) problem = 'Give both the year and the semester, or neither.';
  else if ((year === null) !== (semester === null)) problem = 'Choose both a default year and semester, or neither.';
  else if (year !== null && (!YEARS.includes(year) || !SEMESTERS.includes(semester))) problem = 'Year must be 1–5 and semester 1 or 2.';

  return { code, name, year, semester, problem };
};

/** Paste a list of units to add them all at once. Existing codes are updated. */
export default function UnitImportDialog({ open, onClose, onImported }) {
  const id = useId();
  const [text, setText] = useState('');
  const [defaults, setDefaults] = useState({ year: '', semester: '' });
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setDefaults({ year: '', semester: '' });
    setSummary(null);
  }, [open]);

  const rows = useMemo(() => text
    .split(/\r?\n/)
    .map((raw, index) => ({ line: index + 1, raw: raw.trim() }))
    .filter((row) => row.raw)
    .map((row) => ({ ...row, ...parseUnitLine(row.raw, defaults) })), [text, defaults]);

  const valid = rows.filter((row) => !row.problem);
  const tooMany = valid.length > MAX_ROWS;

  const submit = async () => {
    setBusy(true);
    try {
      const result = await importUnits(valid.map(({ code, name, year, semester }) => ({ code, name, year, semester })));
      setSummary(result);
      toast.success(`${result.created} added, ${result.updated} updated.`);
      onImported?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const setDefault = (field) => (event) => setDefaults((current) => ({ ...current, [field]: event.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title="Import units"
      description="Paste one unit per line: code, name, year, semester. Units that already exist are updated."
      footer={summary ? (
        <button type="button" onClick={onClose} className="btn-primary">Done</button>
      ) : (
        <>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !valid.length || tooMany} className="btn-primary">
            {busy ? 'Importing…' : valid.length ? `Import ${plural(valid.length, 'unit')}` : 'Import'}
          </button>
        </>
      )}
    >
      {summary ? (
        <div className="space-y-3">
          <p className="text-body">
            <strong>{summary.created}</strong> added · <strong>{summary.updated}</strong> updated · <strong>{summary.skipped.length}</strong> skipped
          </p>
          {summary.skipped.length > 0 && (
            <ul className="text-sm text-danger space-y-1">
              {summary.skipped.map((entry) => (
                <li key={entry.row}>Row {entry.row}{entry.code ? ` (${entry.code})` : ''}: {entry.reason}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${id}-units`} className="form-label">Units</label>
            <textarea
              id={`${id}-units`}
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={EXAMPLE}
              spellCheck={false}
              className="input-field font-mono text-sm resize-y"
            />
            <p className="form-hint">Rows copied from a spreadsheet work too. Leave out the year and semester for service units.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-year`} className="form-label">Year for lines without one</label>
              <select id={`${id}-year`} value={defaults.year} onChange={setDefault('year')} className="input-field">
                <option value="">None</option>
                {YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-semester`} className="form-label">Semester for lines without one</label>
              <select id={`${id}-semester`} value={defaults.semester} onChange={setDefault('semester')} className="input-field">
                <option value="">None</option>
                {SEMESTERS.map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
              </select>
            </div>
          </div>

          {tooMany && <p className="form-error">Import at most {MAX_ROWS} units at a time.</p>}

          {rows.length > 0 && (
            <div className="rounded-lg border border-line overflow-hidden">
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs text-subtle sticky top-0">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Code</th>
                      <th scope="col" className="px-3 py-2 font-medium">Name</th>
                      <th scope="col" className="px-3 py-2 font-medium">Placement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                      <tr key={row.line} className={row.problem ? 'bg-danger-soft/50' : ''}>
                        <td className="px-3 py-2 font-medium text-strong whitespace-nowrap">{row.code || '—'}</td>
                        <td className="px-3 py-2 text-body">
                          {row.problem
                            ? <span className="text-danger">Line {row.line}: {row.problem}</span>
                            : row.name || <span className="text-subtle">No name</span>}
                        </td>
                        <td className="px-3 py-2 text-subtle whitespace-nowrap">
                          {row.year ? `Year ${row.year} · Sem ${row.semester}` : 'Other'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
