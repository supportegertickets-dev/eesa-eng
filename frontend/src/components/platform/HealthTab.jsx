'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  HiChip, HiCheckCircle, HiClock, HiDatabase, HiExclamationCircle, HiRefresh, HiServer, HiShieldCheck, HiStatusOnline, HiXCircle,
} from 'react-icons/hi';
import { getPlatformHealth } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/dates';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import Section from '@/components/platform/Section';

const formatBytes = (bytes) => {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const RECORD_LABELS = {
  activeMembers: 'Active accounts',
  pendingApprovals: 'Sign-ups awaiting approval',
  pendingPayments: 'Payments to verify',
  unpaidOrders: 'Shop orders awaiting payment',
  pendingResources: 'Library uploads to review',
  photos: 'Gallery photos',
  auditEntries: 'Audit log entries',
};

/** The server, the database, the outside services and recent faults. */
export default function HealthTab() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await getPlatformHealth());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState title="Could not check the platform" error={error} onRetry={load} />;
  if (!health) return <SkeletonList count={4} />;

  const { server, database, records, services, security, recentErrors } = health;
  const dbOk = database.state === 'connected';
  const memoryShare = server.system.totalMemory ? server.memory.rss / server.system.totalMemory : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-subtle">Checked {formatDateTime(health.generatedAt)}</p>
        <button type="button" onClick={load} disabled={loading} className="btn-outline btn-sm">
          <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Check again
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={HiDatabase}
          label="Database"
          value={dbOk ? 'Connected' : database.state}
          detail={database.pingMs != null ? `Replied in ${database.pingMs} ms` : database.error || 'No reply'}
          ok={dbOk}
        />
        <Stat icon={HiClock} label="Up for" value={formatUptime(server.uptimeSeconds)} detail={`Since ${formatDateTime(server.startedAt)}`} ok />
        <Stat
          icon={HiChip}
          label="Memory in use"
          value={formatBytes(server.memory.rss)}
          detail={memoryShare != null ? `${Math.round(memoryShare * 100)}% of ${formatBytes(server.system.totalMemory)}` : ''}
          ok={memoryShare == null || memoryShare < 0.85}
        />
        <Stat icon={HiServer} label="Server" value={server.environment} detail={`Node ${server.node}`} ok={server.environment === 'production'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Services" icon={HiStatusOnline} description="Whether each outside service is set up on the server. Keys are never shown.">
          <ul className="divide-y divide-line -my-3">
            {services.map((service) => (
              <li key={service.key} className="flex items-start gap-3 py-3">
                {service.ok
                  ? <HiCheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" aria-label="Working" />
                  : <HiExclamationCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-label="Needs attention" />}
                <div className="min-w-0">
                  <p className="font-medium text-strong">{service.label}</p>
                  <p className="text-sm text-muted-fg break-words">{service.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Security" icon={HiShieldCheck}>
          <dl className="divide-y divide-line -my-3 text-sm">
            <Row label="Kill switch override">
              {security.override ? <span className="badge-warning">MAINTENANCE_OVERRIDE={security.override}</span> : 'Not set'}
            </Row>
            <Row label="Superadmins">{security.superadmins ?? '—'}</Row>
            <Row label="Admins">{security.admins ?? '—'}</Row>
            <Row label="Accounts locked by failed sign-ins">
              {security.lockedAccounts ? <span className="badge-warning">{security.lockedAccounts}</span> : security.lockedAccounts ?? '—'}
            </Row>
            <Row label="Rate limiting">
              {security.rateLimiting ? 'On' : <span className="badge-danger">Off (DISABLE_RATE_LIMIT)</span>}
            </Row>
            <Row label="Sessions last">{security.sessionLength}</Row>
            <Row label="Everyone last signed out">
              {security.sessionsRevokedAt ? `${formatDateTime(security.sessionsRevokedAt)} (${relativeTime(security.sessionsRevokedAt)})` : 'Never'}
            </Row>
          </dl>
        </Section>

        {records && (
          <Section title="Records" icon={HiDatabase}>
            <dl className="divide-y divide-line -my-3 text-sm">
              {Object.entries(RECORD_LABELS).map(([key, label]) => (
                <Row key={key} label={label}>{(records[key] ?? 0).toLocaleString()}</Row>
              ))}
            </dl>
          </Section>
        )}

        <Section title="Database storage" icon={HiDatabase} description={database.name ? `Database “${database.name}”` : undefined}>
          {database.storage ? (
            <dl className="divide-y divide-line -my-3 text-sm">
              <Row label="Data">{formatBytes(database.storage.dataSize)}</Row>
              <Row label="On disk">{formatBytes(database.storage.storageSize)}</Row>
              <Row label="Indexes">{formatBytes(database.storage.indexSize)}</Row>
              <Row label="Collections">{database.storage.collections}</Row>
              <Row label="Documents">{database.storage.objects?.toLocaleString()}</Row>
            </dl>
          ) : (
            <p className="text-sm text-muted-fg">The database host does not report storage figures to this account.</p>
          )}
        </Section>
      </div>

      <Section
        title="Recent server errors"
        icon={HiXCircle}
        description="The last 50 requests that failed on the server since it last started. The host's logs hold the full detail."
      >
        {recentErrors.length ? (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                  <th scope="col" className="py-2 pr-4 font-medium">When</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Request</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentErrors.map((entry, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={`${entry.at}-${index}`}>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-fg" title={formatDateTime(entry.at)}>{relativeTime(entry.at)}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-strong break-all">{entry.method} {entry.path}</td>
                    <td className="py-2 pr-4"><span className="badge-danger">{entry.status}</span></td>
                    <td className="py-2 text-muted-fg">{entry.message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-fg flex items-center gap-2">
            <HiCheckCircle className="w-5 h-5 text-success" aria-hidden="true" /> No server errors since the last restart.
          </p>
        )}
      </Section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, detail, ok }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
      </div>
      <p className="text-xl font-heading font-bold text-strong mt-4 capitalize">{value}</p>
      <p className="text-xs text-subtle mt-0.5">{label}</p>
      {detail && <p className="text-xs text-muted-fg mt-1">{detail}</p>}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted-fg">{label}</dt>
      <dd className="text-strong text-right">{children}</dd>
    </div>
  );
}
