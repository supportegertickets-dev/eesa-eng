'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getPendingResources, getUnits } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import UploadDialog from '@/components/library/UploadDialog';

const LibraryContext = createContext(null);

/**
 * State shared by every library page: the unit list (the folder tree), the
 * review-queue count for the tab badge, and the upload dialog. `refresh()` is
 * called after any change so every open list reloads.
 */
export function LibraryProvider({ children }) {
  const { isAdmin } = useAuth();

  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [version, setVersion] = useState(0);
  const [upload, setUpload] = useState({ open: false, unit: null });

  const loadUnits = useCallback(async () => {
    setUnitsError(null);
    try {
      const data = await getUnits();
      setUnits(data.units || []);
    } catch (error) {
      setUnitsError(error);
    } finally {
      setUnitsLoading(false);
    }
  }, []);

  const loadPendingCount = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await getPendingResources('?limit=1');
      setPendingCount(data.total || 0);
    } catch {
      // The badge is a convenience; the review page reports its own errors.
    }
  }, [isAdmin]);

  useEffect(() => { loadUnits(); }, [loadUnits, version]);
  useEffect(() => { loadPendingCount(); }, [loadPendingCount, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const openUpload = useCallback((options = {}) => setUpload({ open: true, unit: options.unit || null }), []);
  const closeUpload = useCallback(() => setUpload((current) => ({ ...current, open: false })), []);

  const value = useMemo(() => ({
    units,
    unitsLoading,
    unitsError,
    reloadUnits: loadUnits,
    pendingCount,
    version,
    refresh,
    openUpload,
  }), [units, unitsLoading, unitsError, loadUnits, pendingCount, version, refresh, openUpload]);

  return (
    <LibraryContext.Provider value={value}>
      {children}
      <UploadDialog open={upload.open} preset={upload.unit} units={units} onClose={closeUpload} onUploaded={refresh} />
    </LibraryContext.Provider>
  );
}

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary must be used inside LibraryProvider');
  return context;
};
