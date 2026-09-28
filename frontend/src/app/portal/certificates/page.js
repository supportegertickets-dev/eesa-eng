'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import MyCertificates from '@/components/certificates/MyCertificates';
import LeadershipTermsPanel from '@/components/certificates/LeadershipTermsPanel';
import IssuedCertificatesPanel from '@/components/certificates/IssuedCertificatesPanel';
import SignatoriesPanel from '@/components/certificates/SignatoriesPanel';

const ADMIN_TABS = [
  { id: 'mine', label: 'My certificates' },
  { id: 'terms', label: 'Leadership terms' },
  { id: 'issued', label: 'Issued' },
  { id: 'signatories', label: 'Signatories' },
];

export default function CertificatesPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('mine');
  const [issuedVersion, setIssuedVersion] = useState(0);

  // ?tab=terms and the like open that section, for example from the guide.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (isAdmin && ADMIN_TABS.some((t) => t.id === requested)) setTab(requested);
  }, [isAdmin]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Certificates</h1>
        <p className="text-muted-fg mt-1">
          Certificates of membership for paid-up members, and of leadership for office holders. Each one carries a QR code anyone can scan to check it.
        </p>
      </div>

      {isAdmin && (
        <div role="tablist" aria-label="Certificate sections" className="flex flex-wrap gap-2 mb-6">
          {ADMIN_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === item.id ? 'bg-primary-500 text-white' : 'bg-muted text-body hover:bg-muted-strong'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {isAdmin && tab === 'terms' ? (
        <LeadershipTermsPanel onIssued={() => setIssuedVersion((v) => v + 1)} />
      ) : isAdmin && tab === 'issued' ? (
        <IssuedCertificatesPanel refreshKey={issuedVersion} />
      ) : isAdmin && tab === 'signatories' ? (
        <SignatoriesPanel />
      ) : (
        <MyCertificates />
      )}
    </div>
  );
}
