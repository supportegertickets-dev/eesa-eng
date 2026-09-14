'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { HiDotsVertical } from 'react-icons/hi';

/**
 * Overflow menu for row actions, so a list row stays uncluttered on a phone.
 * @param {{ label: string, actions: Array<{ label: string, icon?: Function, onClick: Function, danger?: boolean }> }} props
 */
export default function ActionMenu({ label = 'More actions', actions }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        className="p-2 -m-1 rounded-lg text-subtle hover:text-strong hover:bg-muted transition-colors"
      >
        <HiDotsVertical className="w-5 h-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 min-w-[11rem] rounded-lg border border-line bg-surface-raised shadow-overlay py-1 animate-fade-in"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
                ${action.danger ? 'text-danger hover:bg-danger-soft' : 'text-body hover:bg-muted'}`}
            >
              {action.icon && <action.icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
