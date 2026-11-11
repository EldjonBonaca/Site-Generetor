/**
 * Time left of the login session (its length is chosen on the login page), shown at the bottom of every
 * page. Shortly before the end a dialog asks whether to continue: "Continue" starts the session again for
 * the same length, no answer logs out when the time is over. Nothing is shown when the login is disabled.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { Button, Modal, cx } from './ui.jsx';

/** Seconds as "12:05", or "1:02:05" from one hour. */
export function formatLeft(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
}

/** The warning opens this many seconds before the end: 2 minutes, less for a very short session. */
const warnBefore = (minutes) => Math.min(120, Math.floor((minutes * 60) / 4));

export function SessionTimer() {
  const { t } = useT();
  const [session, setSession] = useState(null); // { endsAt: ms on this computer's clock, minutes }
  const [left, setLeft] = useState(null);
  const [busy, setBusy] = useState(false);
  const leaving = useRef(false);

  // The end is given on the server clock: kept as a time on this clock (they may differ)
  const apply = useCallback((me) => {
    if (!me?.expiresAt) return setSession(null);
    setSession({ endsAt: Date.now() + (me.expiresAt - (me.now || Date.now())), minutes: me.minutes || 60 });
  }, []);
  const refresh = useCallback(() => api.get('/me').then(apply).catch(() => {}), [apply]);

  useEffect(() => {
    refresh();
    // Another tab may have continued the session meanwhile
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!session) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((session.endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  const logout = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await api.post('/logout');
    } finally {
      window.location.href = '/login';
    }
  }, []);

  // Time over: log out, unless the session was continued in another tab (an expired session answers 401: api.js leaves the page)
  useEffect(() => {
    if (!session || left !== 0 || leaving.current) return;
    api
      .get('/me')
      .then((me) => (me?.expiresAt && me.expiresAt - (me.now || Date.now()) > 5000 ? apply(me) : logout()))
      .catch(logout);
  }, [left, session, apply, logout]);

  const extend = async () => {
    setBusy(true);
    try {
      apply(await api.post('/session/extend'));
    } catch {
      /* the countdown goes on: the user can try again */
    } finally {
      setBusy(false);
    }
  };

  if (!session || left === null) return null;
  const warning = left <= warnBefore(session.minutes);
  return (
    <>
      <div
        className={cx(
          'fixed bottom-3 left-3 z-20 flex items-center gap-2 rounded-full border bg-white/95 py-1.5 pr-1.5 pl-3 text-xs font-medium shadow-sm backdrop-blur',
          warning ? 'border-amber-300 text-amber-800' : 'border-slate-200 text-slate-600'
        )}
        role="timer"
        aria-label={t('Session time left')}
      >
        <Clock className="size-3.5 shrink-0" />
        <span>
          {t('Session')}: <span className="tabular-nums">{formatLeft(left)}</span>
        </span>
        <button type="button" onClick={extend} disabled={busy} title={t('Start the session again for the time chosen at login')} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 disabled:opacity-60">
          <RefreshCw className={cx('size-3', busy && 'animate-spin')} />
          {t('Extend')}
        </button>
      </div>

      <Modal
        open={warning}
        // Closing the dialog (X, Esc) is an answer too: the user is there and goes on
        onClose={extend}
        title={t('Your session is about to end')}
        size="sm"
        footer={
          <>
            <Button icon={LogOut} onClick={logout}>
              {t('Log out')}
            </Button>
            <Button variant="primary" icon={RefreshCw} onClick={extend} loading={busy}>
              {t('Continue')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{t('You will be logged out in {time}. Do you want to continue?', { time: formatLeft(left) })}</p>
        <p className="mt-2 text-xs text-slate-500">{t('Without an answer the session closes by itself. Work already saved is not lost.')}</p>
      </Modal>
    </>
  );
}
