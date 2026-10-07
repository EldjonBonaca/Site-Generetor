import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounced autosave. Call `schedule(patch)` on every change: patches are merged
 * and sent with `saveFn(mergedPatch)` after `delay` ms of inactivity.
 * Pending changes are flushed on unmount.
 */
export function useAutosave(saveFn, delay = 700) {
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const pending = useRef({});
  const timer = useRef(null);
  const fnRef = useRef(saveFn);
  fnRef.current = saveFn;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setStatus('saving');
    try {
      await fnRef.current(patch);
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      throw err;
    }
  }, []);

  const schedule = useCallback(
    (patch) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush().catch(() => {}), delay);
    },
    [delay, flush]
  );

  useEffect(() => () => {
    flush().catch(() => {});
  }, [flush]);

  return { schedule, flush, status };
}
