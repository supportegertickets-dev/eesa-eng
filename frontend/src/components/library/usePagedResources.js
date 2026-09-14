'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const INITIAL = { resources: [], total: 0, totalPages: 1, page: 1, loading: true, error: null };

/**
 * Load a page of library files and keep it fresh.
 *
 * @param {Function|null} fetcher an API function taking a query string; null skips loading
 * @param {object} params query parameters; empty values are left out
 * @param {*} reloadKey any value that forces a reload when it changes
 */
export default function usePagedResources(fetcher, params, reloadKey) {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)])
  ).toString();

  const [state, setState] = useState(INITIAL);
  // Only the latest request may update state, so a slow response for an old
  // folder cannot overwrite the folder the member has since opened.
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!fetcher) return;
    const requestId = ++latest.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await fetcher(query ? `?${query}` : '');
      if (requestId !== latest.current) return;
      setState({
        resources: data.resources || [],
        total: data.total || 0,
        totalPages: data.totalPages || 1,
        page: data.page || 1,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId === latest.current) setState((current) => ({ ...current, loading: false, error }));
    }
  }, [fetcher, query]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const update = useCallback((resource) => setState((current) => ({
    ...current,
    resources: current.resources.map((item) => (item._id === resource._id ? resource : item)),
  })), []);

  const remove = useCallback((id) => setState((current) => ({
    ...current,
    resources: current.resources.filter((item) => item._id !== id),
    total: Math.max(0, current.total - 1),
  })), []);

  return { ...state, reload: load, update, remove };
}
