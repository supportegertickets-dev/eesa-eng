'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HiExclamation, HiExclamationCircle, HiInformationCircle, HiSpeakerphone, HiX } from 'react-icons/hi';
import { useAuth } from '@/lib/AuthContext';
import { usePlatform } from '@/lib/PlatformContext';
import { formatDateTime } from '@/lib/dates';

const TONES = {
  info: { box: 'bg-info-soft', icon: 'text-info', Icon: HiInformationCircle },
  warning: { box: 'bg-warning-soft', icon: 'text-warning', Icon: HiExclamation },
  critical: { box: 'bg-danger-soft', icon: 'text-danger', Icon: HiExclamationCircle },
};

const DISMISSED_KEY = 'eesa_dismissed_announcement';

const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) || '';
  } catch {
    return '';
  }
};

const lower = (label) => label.charAt(0).toLowerCase() + label.slice(1);
const listOf = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);

/**
 * Site-wide notices from the platform: read-only mode, maintenance coming up,
 * paused features and the superadmin's announcement. The superadmin also gets
 * a reminder while maintenance mode keeps everyone else out.
 *
 * Rendered under the navigation bar on public pages, and inside the content
 * column in the portal (`inPortal`), where the fixed sidebar would cover it.
 */
export default function PlatformBanner({ inPortal = false }) {
  const { status } = usePlatform();
  const { user } = useAuth();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState('');

  useEffect(() => setDismissed(readDismissed()), []);

  if (!status) return null;
  if (!inPortal && pathname?.startsWith('/portal')) return null;

  const isSuperadmin = user?.role === 'superadmin';
  const controlLink = isSuperadmin ? ['/portal/platform', 'Platform control'] : null;
  const notices = [];

  if (status.mode === 'maintenance' && isSuperadmin) {
    notices.push({
      key: 'maintenance',
      tone: 'critical',
      text: 'Maintenance mode is on. Nobody but you can use EESA until you switch it off.',
      link: controlLink,
    });
  }
  if (status.mode === 'read_only') {
    notices.push({
      key: 'read-only',
      tone: 'warning',
      text: isSuperadmin ? 'Read-only mode is on. Nobody else can change anything; you still can.' : status.message,
      link: controlLink,
    });
  }
  if (status.scheduledMaintenance) {
    const { startsAt, endsAt } = status.scheduledMaintenance;
    notices.push({
      key: 'scheduled',
      tone: 'warning',
      text: `Planned maintenance: EESA will be unavailable from ${formatDateTime(startsAt)}${endsAt ? ` until ${formatDateTime(endsAt)}` : ''}.`,
    });
  }
  if (status.disabledFeatures?.length) {
    const labels = listOf(status.disabledFeatures.map((feature) => lower(feature.label)));
    notices.push({
      key: 'paused',
      tone: 'info',
      text: isSuperadmin ? `Switched off for everyone but you: ${labels}.` : `Paused for now: ${labels}.`,
      link: controlLink,
    });
  }
  if (status.announcement && status.announcement.message !== dismissed) {
    notices.push({
      key: 'announcement',
      tone: status.announcement.tone,
      text: status.announcement.message,
      icon: HiSpeakerphone,
      dismiss: () => {
        try {
          sessionStorage.setItem(DISMISSED_KEY, status.announcement.message);
        } catch {
          // It simply comes back on the next page.
        }
        setDismissed(status.announcement.message);
      },
    });
  }

  if (!notices.length) return null;

  return (
    <div className={`print:hidden ${inPortal ? 'space-y-2 px-4 sm:px-6 lg:px-8 pt-4' : ''}`} role="region" aria-label="Site notices">
      {notices.map(({ key, tone, text, link, icon, dismiss }) => {
        const style = TONES[tone] || TONES.info;
        const Icon = icon || style.Icon;
        return (
          <div
            key={key}
            className={`${style.box} ${inPortal ? 'rounded-lg' : 'border-b border-line'}`}
            role={tone === 'critical' ? 'alert' : 'status'}
          >
            <div className={`flex items-start gap-3 py-2.5 ${inPortal ? 'px-4' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}`}>
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.icon}`} aria-hidden="true" />
              <p className="flex-1 min-w-0 text-sm text-strong">
                {text}
                {link && (
                  <>
                    {' '}
                    <Link href={link[0]} className="font-semibold underline underline-offset-2 whitespace-nowrap">{link[1]}</Link>
                  </>
                )}
              </p>
              {dismiss && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="p-1 -m-1 rounded text-subtle hover:text-strong"
                  aria-label="Dismiss announcement"
                >
                  <HiX className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
