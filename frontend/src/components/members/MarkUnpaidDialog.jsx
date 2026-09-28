'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { bulkUpdateMembership, updateMembership } from '@/lib/api';
import { fullName } from '@/lib/members';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

/**
 * Put one or several members back to "not paid", for example after marking
 * the wrong person paid. Payment history is left as it is.
 */
export default function MarkUnpaidDialog({ members, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const open = Boolean(members?.length);
  const single = members?.length === 1 ? members[0] : null;

  const confirm = async () => {
    setBusy(true);
    try {
      const result = single
        ? await updateMembership(single._id, { membershipPaid: false })
        : await bulkUpdateMembership({ membershipPaid: false, ids: members.map((m) => m._id) });
      toast.success(result.message);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      busy={busy}
      title={single ? `Mark ${fullName(single)} as not paid?` : `Mark ${members?.length} members as not paid?`}
      description={`Their membership will show as not paid and ${single ? 'their card stops' : 'their cards stop'} being valid. Payment history is not changed. You can mark them paid again at any time.`}
      confirmLabel="Mark not paid"
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
