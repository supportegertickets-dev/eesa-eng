'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HiSearch } from 'react-icons/hi';

/** Look up a card by its member number, or a certificate by its certificate number. */
export default function VerifyForm({ initial = '', compact = false }) {
  const router = useRouter();
  const [number, setNumber] = useState(initial);

  const submit = (event) => {
    event.preventDefault();
    const clean = number.trim().toUpperCase().replace(/\s+/g, '');
    if (clean) router.push(`/verify/${encodeURIComponent(clean)}`);
  };

  return (
    <form onSubmit={submit} className={`flex flex-col sm:flex-row gap-2 ${compact ? '' : 'max-w-lg mx-auto'}`} role="search">
      <label htmlFor="member-number" className="sr-only">Member or certificate number</label>
      <input
        id="member-number"
        className="input-field font-mono uppercase flex-1"
        placeholder="EESA-26-7K3M9Q / EESA-CERT-26-…"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        required
      />
      <button type="submit" className={compact ? 'btn-primary' : 'btn-accent'}>
        <HiSearch className="w-4 h-4" aria-hidden="true" /> Verify
      </button>
    </form>
  );
}
