'use client';

import { useEffect, useState } from 'react';
import { HiClipboardList, HiLightningBolt, HiStatusOnline, HiUserGroup } from 'react-icons/hi';
import { useAuth } from '@/lib/AuthContext';
import ControlsTab from '@/components/platform/ControlsTab';
import HealthTab from '@/components/platform/HealthTab';
import AuditTab from '@/components/platform/AuditTab';
import AccountsTab from '@/components/platform/AccountsTab';

const TABS = [
  { id: 'controls', label: 'Controls', icon: HiLightningBolt, Panel: ControlsTab },
  { id: 'health', label: 'System health', icon: HiStatusOnline, Panel: HealthTab },
  { id: 'audit', label: 'Audit log', icon: HiClipboardList, Panel: AuditTab },
  { id: 'accounts', label: 'Admins & accounts', icon: HiUserGroup, Panel: AccountsTab },
];

/** The superadmin's page: the kill switch and the maintenance tools. */
export default function PlatformPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('controls');

  // The tab is kept in the address, so a reload or a shared link opens it.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, []);

  const choose = (id) => {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  if (user?.role !== 'superadmin') {
    return (
      <div className="card text-center py-20">
        <p className="text-subtle text-lg">Access denied. Superadmin only.</p>
      </div>
    );
  }

  const { Panel } = TABS.find((t) => t.id === tab);

  return (
    <div>
      <div className="mb-6">
        <p className="text-primary-600 dark:text-primary-300 text-sm font-semibold uppercase tracking-wide">Superadmin</p>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-strong mt-1">Platform control</h1>
        <p className="text-muted-fg mt-1">Run and maintain EESA: the kill switch, system health, the audit log and admin accounts.</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-line overflow-x-auto" role="tablist" aria-label="Platform control">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`platform-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`platform-panel-${id}`}
            onClick={() => choose(id)}
            className={`flex items-center gap-2 px-4 py-3 whitespace-nowrap font-medium text-sm border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-primary-500 text-primary-600 dark:text-primary-300'
                : 'border-transparent text-subtle hover:text-body'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`platform-panel-${tab}`} aria-labelledby={`platform-tab-${tab}`}>
        <Panel />
      </div>
    </div>
  );
}
