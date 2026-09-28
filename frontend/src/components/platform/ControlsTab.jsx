'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiAdjustments, HiBan, HiCalendar, HiCheckCircle, HiEye, HiLightningBolt, HiLogout, HiSpeakerphone,
} from 'react-icons/hi';
import {
  getPlatformOverview, revokeAllSessions, setMaintenanceSchedule, setPlatformAnnouncement, setPlatformFeatures, setPlatformMode,
} from '@/lib/api';
import { usePlatform } from '@/lib/PlatformContext';
import { formatDateTime, fromLocalInput, relativeTime, toLocalInput } from '@/lib/dates';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import PasswordDialog from '@/components/platform/PasswordDialog';
import Section from '@/components/platform/Section';

const MODE_OPTIONS = [
  { id: 'normal', label: 'Normal', icon: HiCheckCircle, description: 'Everything works for everyone.' },
  {
    id: 'read_only',
    label: 'Read-only',
    icon: HiEye,
    description: 'People can browse and sign in, but nothing can be changed: no uploads, payments, orders, votes or edits.',
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: HiBan,
    description: 'The whole site shows a maintenance page. Nobody but you can sign in or use it, admins included.',
  },
];

const MODE_BADGES = {
  normal: ['badge-success', 'Normal'],
  read_only: ['badge-warning', 'Read-only'],
  maintenance: ['badge-danger', 'Maintenance'],
};

const MODE_CONFIRM = {
  normal: {
    title: 'Return to normal?',
    description: 'Everyone can use EESA again straight away.',
    confirmLabel: 'Return to normal',
  },
  read_only: {
    title: 'Switch on read-only mode?',
    description: 'People can still look around and sign in, but nobody else can change anything until you switch it off.',
    confirmLabel: 'Switch on read-only',
  },
  maintenance: {
    title: 'Switch on maintenance mode?',
    description: 'EESA closes for everyone but you, admins included. Anyone using it is shut out at their next click.',
    confirmLabel: 'Switch on maintenance',
  },
};

const TONE_OPTIONS = [
  { value: 'info', label: 'Information' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The kill switch and the notices: everything that changes what people can do. */
export default function ControlsTab() {
  const { setStatus } = usePlatform();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Every change returns the fresh overview; the public status in it also
  // updates the banners on this very page.
  const apply = useCallback((next) => {
    setOverview(next);
    setStatus(next.status);
  }, [setStatus]);

  const load = useCallback(async () => {
    setError(null);
    try {
      apply(await getPlatformOverview());
    } catch (err) {
      setError(err);
    }
  }, [apply]);

  useEffect(() => { load(); }, [load]);

  /** Ask for the password, then run the change with it. */
  const ask = (options) => {
    setConfirmError('');
    setConfirm(options);
  };

  const runConfirmed = async (password) => {
    setConfirmBusy(true);
    setConfirmError('');
    try {
      const result = await confirm.run(password);
      apply(result.overview);
      toast.success(result.message, { duration: 6000 });
      setConfirm(null);
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirmBusy(false);
    }
  };

  if (error) return <ErrorState title="Could not load the controls" error={error} onRetry={load} />;
  if (!overview) return <SkeletonList count={4} />;

  return (
    <div className="space-y-6">
      <ModeSection overview={overview} ask={ask} />
      <FeaturesSection overview={overview} ask={ask} />
      <ScheduleSection overview={overview} ask={ask} />
      <AnnouncementSection overview={overview} onSaved={apply} />
      <SessionsSection overview={overview} ask={ask} />

      <PasswordDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        busy={confirmBusy}
        error={confirmError}
        onConfirm={runConfirmed}
        onClose={() => !confirmBusy && setConfirm(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Mode
 * ------------------------------------------------------------------ */

function StateLine({ overview }) {
  const { state, settings, override } = overview;
  const [badgeClass, badgeLabel] = MODE_BADGES[state.mode];

  let source = null;
  if (override) {
    source = 'Forced by MAINTENANCE_OVERRIDE on the server. What you choose here is saved, but only takes effect once that setting is removed.';
  } else if (state.source === 'scheduled') {
    source = state.expectedBackAt
      ? `Scheduled maintenance is in progress until ${formatDateTime(state.expectedBackAt)}.`
      : 'Scheduled maintenance is in progress.';
  } else if (settings.updatedAt && settings.updatedBy) {
    const recent = Date.now() - new Date(settings.updatedAt).getTime() < 60 * 1000;
    source = `Last changed by ${settings.updatedBy} ${recent ? 'just now' : relativeTime(settings.updatedAt)}.`;
  }

  return (
    <div className={`rounded-lg px-4 py-3 mb-5 text-sm ${override ? 'bg-warning-soft' : 'bg-muted'}`}>
      <p className="text-strong">
        In force now: <span className={badgeClass}>{badgeLabel}</span>
      </p>
      {source && <p className="text-muted-fg mt-1">{source}</p>}
    </div>
  );
}

function ModeSection({ overview, ask }) {
  const current = overview.settings;
  const [mode, setMode] = useState(current.mode);
  const [message, setMessage] = useState(current.message || '');
  const [back, setBack] = useState(toLocalInput(current.expectedBackAt));

  useEffect(() => {
    setMode(current.mode);
    setMessage(current.message || '');
    setBack(toLocalInput(current.expectedBackAt));
  }, [current.mode, current.message, current.expectedBackAt]);

  const sameMode = mode === current.mode;
  const changed = !sameMode || (mode !== 'normal'
    && (message.trim() !== (current.message || '') || back !== toLocalInput(current.expectedBackAt)));

  const submit = (event) => {
    event.preventDefault();
    const words = sameMode
      ? { title: 'Update the notice?', description: 'People see the new message straight away.', confirmLabel: 'Update' }
      : MODE_CONFIRM[mode];
    ask({
      ...words,
      destructive: mode !== 'normal' && !sameMode,
      run: (password) => setPlatformMode({
        mode,
        message: mode === 'normal' ? '' : message.trim(),
        expectedBackAt: mode === 'normal' ? '' : fromLocalInput(back),
        password,
      }),
    });
  };

  return (
    <Section
      title="Kill switch"
      icon={HiLightningBolt}
      description="Close the platform, or freeze it while you work on it. You are never locked out."
    >
      <StateLine overview={overview} />

      <form onSubmit={submit}>
        <fieldset>
          <legend className="form-label">Mode</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODE_OPTIONS.map((option) => {
              const selected = mode === option.id;
              const Icon = option.icon;
              return (
                <label
                  key={option.id}
                  className={`relative flex flex-col gap-1.5 rounded-xl border p-4 cursor-pointer transition-colors ${
                    selected ? 'border-primary-500 bg-primary-500/5 ring-1 ring-primary-500' : 'border-line hover:bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="platform-mode"
                    value={option.id}
                    checked={selected}
                    onChange={() => setMode(option.id)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 font-semibold text-strong">
                    <Icon className={`w-5 h-5 ${selected ? 'text-primary-500 dark:text-primary-300' : 'text-subtle'}`} aria-hidden="true" />
                    {option.label}
                    {current.mode === option.id && <span className="badge-neutral ml-auto">Current</span>}
                  </span>
                  <span className="text-xs text-muted-fg leading-relaxed">{option.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {mode !== 'normal' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <div className="md:col-span-2">
              <label htmlFor="mode-message" className="form-label">Message people see</label>
              <textarea
                id="mode-message"
                rows={3}
                maxLength={500}
                className="input-field resize-none"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={overview.defaultMessages[mode]}
              />
              <p className="form-hint">Leave empty to use the text shown.</p>
            </div>
            <div>
              <label htmlFor="mode-back" className="form-label">Expected back (optional)</label>
              <input
                id="mode-back"
                type="datetime-local"
                className="input-field"
                value={back}
                onChange={(event) => setBack(event.target.value)}
              />
              <p className="form-hint">Shown on the maintenance page. It does not switch anything back by itself.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button type="submit" className={mode !== 'normal' && !sameMode ? 'btn-danger' : 'btn-primary'} disabled={!changed}>
            {sameMode ? 'Update notice' : MODE_CONFIRM[mode].confirmLabel}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Feature switches
 * ------------------------------------------------------------------ */

function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas
        ${on ? 'bg-success' : 'bg-muted-strong'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function FeaturesSection({ overview, ask }) {
  const saved = overview.settings.disabledFeatures;
  const savedKey = saved.join(',');
  const [off, setOff] = useState(() => new Set(saved));

  useEffect(() => setOff(new Set(savedKey ? savedKey.split(',') : [])), [savedKey]);

  const changed = off.size !== saved.length || saved.some((key) => !off.has(key));
  const toggle = (key) => setOff((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const save = () => ask({
    title: 'Save feature switches?',
    description: off.size
      ? `${plural(off.size, 'feature')} will be switched off for everyone but you.`
      : 'Every feature will be switched back on.',
    confirmLabel: 'Save switches',
    run: (password) => setPlatformFeatures([...off], password),
  });

  return (
    <Section
      title="Feature switches"
      icon={HiAdjustments}
      description="Switch parts of the platform off one at a time. They stay off for everyone but you until you switch them back on."
    >
      <ul className="divide-y divide-line -my-3">
        {overview.features.map((feature) => {
          const on = !off.has(feature.key);
          return (
            <li key={feature.key} className="flex items-start gap-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-strong flex items-center gap-2">
                  {feature.label}
                  {!on && <span className="badge-danger">Off</span>}
                </p>
                <p className="text-sm text-muted-fg">{feature.description}</p>
              </div>
              <Switch on={on} onChange={() => toggle(feature.key)} label={feature.label} />
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end gap-2 mt-5">
        {changed && <button type="button" className="btn-ghost" onClick={() => setOff(new Set(saved))}>Undo changes</button>}
        <button type="button" className="btn-primary" disabled={!changed} onClick={save}>Save switches</button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Scheduled maintenance
 * ------------------------------------------------------------------ */

function ScheduleSection({ overview, ask }) {
  const window = overview.settings.window;
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setStartsAt(toLocalInput(window?.startsAt));
    setEndsAt(toLocalInput(window?.endsAt));
    setMessage(window?.message || '');
  }, [window?.startsAt, window?.endsAt, window?.message]);

  const now = new Date();
  const phase = !window ? null
    : new Date(window.startsAt) > now ? 'upcoming'
      : !window.endsAt || new Date(window.endsAt) > now ? 'running' : 'ended';

  const submit = (event) => {
    event.preventDefault();
    setFormError('');
    if (!startsAt) return setFormError('Choose when maintenance starts.');
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) return setFormError('The end must be after the start.');
    return ask({
      title: 'Schedule maintenance?',
      description: `EESA closes for everyone but you at ${formatDateTime(startsAt)}${endsAt ? ` and opens again by itself at ${formatDateTime(endsAt)}` : ' and stays closed until you cancel the schedule'}. Everyone sees a notice until then.`,
      confirmLabel: 'Schedule',
      run: (password) => setMaintenanceSchedule({
        startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt), message: message.trim(), password,
      }),
    });
  };

  const cancel = () => ask({
    title: 'Cancel the scheduled maintenance?',
    description: phase === 'running' ? 'Maintenance ends now and everyone can use EESA again.' : 'The notice disappears and nothing closes.',
    confirmLabel: 'Cancel it',
    run: (password) => setMaintenanceSchedule({ password }),
  });

  return (
    <Section
      title="Scheduled maintenance"
      icon={HiCalendar}
      description="Plan maintenance ahead. Everyone sees a notice beforehand, and the site closes and reopens by itself."
    >
      {phase && phase !== 'ended' && (
        <div className={`rounded-lg px-4 py-3 mb-5 text-sm flex flex-wrap items-center gap-3 ${phase === 'running' ? 'bg-danger-soft' : 'bg-warning-soft'}`}>
          <p className="flex-1 min-w-0 text-strong">
            {phase === 'running' ? 'In progress: ' : 'Scheduled: '}
            {formatDateTime(window.startsAt)}
            {window.endsAt ? ` until ${formatDateTime(window.endsAt)}` : ', with no end time'}.
          </p>
          <button type="button" className="btn-outline btn-sm" onClick={cancel}>Cancel schedule</button>
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="window-start" className="form-label">Starts</label>
          <input id="window-start" type="datetime-local" className="input-field" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </div>
        <div>
          <label htmlFor="window-end" className="form-label">Ends (recommended)</label>
          <input id="window-end" type="datetime-local" className="input-field" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="window-message" className="form-label">Message during maintenance (optional)</label>
          <input
            id="window-message"
            type="text"
            maxLength={500}
            className="input-field"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={overview.defaultMessages.maintenance}
          />
        </div>
        {formError && <p role="alert" className="form-error md:col-span-2 -mt-2">{formError}</p>}
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" className="btn-primary">{phase && phase !== 'ended' ? 'Update schedule' : 'Schedule maintenance'}</button>
        </div>
      </form>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Announcement
 * ------------------------------------------------------------------ */

function AnnouncementSection({ overview, onSaved }) {
  const current = overview.settings.announcement;
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('info');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMessage(current?.message || '');
    setTone(current?.tone || 'info');
    setExpiresAt(toLocalInput(current?.expiresAt));
  }, [current?.message, current?.tone, current?.expiresAt]);

  const save = async (body) => {
    setSaving(true);
    try {
      const result = await setPlatformAnnouncement(body);
      onSaved(result.overview);
      toast.success(result.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    save({ message: message.trim(), tone, expiresAt: fromLocalInput(expiresAt) });
  };

  const expired = current?.expiresAt && new Date(current.expiresAt) <= new Date();

  return (
    <Section
      title="Site announcement"
      icon={HiSpeakerphone}
      description="A banner across the top of every page, for everyone. No password needed."
      action={current && <span className={expired ? 'badge-neutral' : 'badge-success'}>{expired ? 'Expired' : 'Live'}</span>}
    >
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-3">
          <label htmlFor="announcement-message" className="form-label">Announcement</label>
          <textarea
            id="announcement-message"
            rows={2}
            maxLength={300}
            className="input-field resize-none"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="For example: M-Pesa payments are slow today. Please allow a few minutes for confirmation."
          />
          <p className="form-hint">{message.length}/300</p>
        </div>
        <div>
          <label htmlFor="announcement-tone" className="form-label">Style</label>
          <select id="announcement-tone" className="input-field" value={tone} onChange={(event) => setTone(event.target.value)}>
            {TONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="announcement-expires" className="form-label">Remove automatically at (optional)</label>
          <input id="announcement-expires" type="datetime-local" className="input-field" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </div>
        <div className="flex items-end justify-end gap-2">
          {current && (
            <button type="button" className="btn-ghost" disabled={saving} onClick={() => save({ message: '' })}>Remove</button>
          )}
          <button type="submit" className="btn-primary" disabled={saving || !message.trim()}>
            {saving ? 'Saving…' : current ? 'Update' : 'Publish'}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Sign everyone out
 * ------------------------------------------------------------------ */

function SessionsSection({ overview, ask }) {
  const last = overview.settings.sessionsRevokedAt;

  const revoke = () => ask({
    title: 'Sign everyone out?',
    description: 'Every member, leader and admin is signed out on every device at their next click. Superadmins stay signed in. '
      + 'Nothing is lost, and people can sign straight back in unless sign-ins are switched off.',
    confirmLabel: 'Sign everyone out',
    destructive: true,
    run: (password) => revokeAllSessions(password),
  });

  return (
    <Section
      title="Sign everyone out"
      icon={HiLogout}
      danger
      description="For a suspected breach: ends every session on the platform at once, apart from superadmins'."
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="flex-1 min-w-0 text-sm text-muted-fg">
          {last ? `Last used ${formatDateTime(last)} (${relativeTime(last)}).` : 'Never used.'}
          {' '}To keep people out afterwards, also switch off sign-ins above.
        </p>
        <button type="button" className="btn-danger" onClick={revoke}>Sign everyone out</button>
      </div>
    </Section>
  );
}
