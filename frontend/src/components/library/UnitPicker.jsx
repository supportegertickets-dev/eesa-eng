'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { SEMESTERS, YEARS, isNewUnit, normalizeUnitCode, placementLabel } from '@/lib/library';

const MAX_SUGGESTIONS = 8;

const fromUnit = (unit) => ({
  unitId: unit._id,
  unitCode: unit.code,
  unitName: unit.name || '',
  year: unit.year ?? '',
  semester: unit.semester ?? '',
});

/**
 * Choose a file's unit: search existing units by code or name, or type a new
 * code and describe the new unit.
 *
 * `value` carries { unitId, unitCode, unitName, year, semester }; `onChange`
 * receives the same shape.
 */
export default function UnitPicker({ units, value, onChange, disabled = false, error }) {
  const id = useId();
  const [text, setText] = useState(value.unitCode || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Follow changes made elsewhere, such as a unit detected from the file,
  // without disturbing what the member is typing.
  useEffect(() => {
    setText((current) => (normalizeUnitCode(current) === normalizeUnitCode(value.unitCode) ? current : value.unitCode || ''));
  }, [value.unitCode]);

  const suggestions = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return units.slice(0, MAX_SUGGESTIONS);
    const compact = query.replace(/[\s_-]+/g, '');
    return units
      .filter((unit) => unit.code.toLowerCase().replace(/\s+/g, '').includes(compact) || (unit.name || '').toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [text, units]);

  const selected = value.unitId ? units.find((unit) => unit._id === value.unitId) : null;
  const creating = isNewUnit(value, units);
  const listOpen = open && !disabled && suggestions.length > 0;

  const choose = (unit) => {
    onChange(fromUnit(unit));
    setText(unit.code);
    setOpen(false);
  };

  const handleType = (next) => {
    setText(next);
    setOpen(true);
    setActive(0);
    const match = units.find((unit) => unit.code === normalizeUnitCode(next));
    if (match) {
      onChange(fromUnit(match));
    } else if (value.unitId) {
      // Moving off a known unit: its name and placement no longer apply.
      onChange({ unitId: '', unitCode: next, unitName: '', year: '', semester: '' });
    } else {
      onChange({ unitId: '', unitCode: next, unitName: value.unitName, year: value.year, semester: value.semester });
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && listOpen && suggestions[active]) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === 'Escape' && listOpen) {
      // Close the list without also closing the dialog around it.
      event.stopPropagation();
      setOpen(false);
    }
  };

  let hint = 'Pick from the list, or type a new unit code.';
  if (selected) hint = [selected.name, placementLabel(selected)].filter(Boolean).join(' · ');
  else if (creating) hint = 'This unit is not in the library yet. Add its details so the file is filed correctly.';

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor={id} className="form-label">Unit <span className="text-danger">*</span></label>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={listOpen ? `${id}-option-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint`}
          value={text}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder="Type a unit code or name, e.g. EEEN 481"
          onChange={(event) => handleType(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="input-field"
        />

        {listOpen && (
          <ul
            id={`${id}-options`}
            role="listbox"
            className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-line bg-surface-raised shadow-overlay py-1"
          >
            {suggestions.map((unit, index) => (
              <li
                key={unit._id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(unit);
                }}
                onMouseEnter={() => setActive(index)}
                className={`px-3 py-2 cursor-pointer ${index === active ? 'bg-muted' : ''}`}
              >
                <span className="block text-sm">
                  <span className="font-semibold text-strong">{unit.code}</span>
                  {unit.name && <span className="text-body"> · {unit.name}</span>}
                </span>
                <span className="block text-xs text-subtle">{placementLabel(unit)}</span>
              </li>
            ))}
          </ul>
        )}

        <p id={`${id}-hint`} className={error ? 'form-error' : 'form-hint'}>{error || hint}</p>
      </div>

      {creating && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-line-strong p-3">
          <div className="col-span-2">
            <label htmlFor={`${id}-name`} className="form-label">Unit name</label>
            <input
              id={`${id}-name`}
              value={value.unitName}
              onChange={(event) => onChange({ ...value, unitName: event.target.value })}
              maxLength={150}
              disabled={disabled}
              placeholder="e.g. Project Management"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor={`${id}-year`} className="form-label">Year</label>
            <select
              id={`${id}-year`}
              value={value.year}
              onChange={(event) => onChange({ ...value, year: event.target.value ? Number(event.target.value) : '' })}
              disabled={disabled}
              className="input-field"
            >
              <option value="">None</option>
              {YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-semester`} className="form-label">Semester</label>
            <select
              id={`${id}-semester`}
              value={value.semester}
              onChange={(event) => onChange({ ...value, semester: event.target.value ? Number(event.target.value) : '' })}
              disabled={disabled}
              className="input-field"
            >
              <option value="">None</option>
              {SEMESTERS.map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
            </select>
          </div>
          <p className="col-span-2 form-hint !mt-0">Leave both as None for service and elective units.</p>
        </div>
      )}
    </div>
  );
}
