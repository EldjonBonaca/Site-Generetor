/**
 * Photos of the business found elsewhere (its Google Maps listing, a public web page, its social
 * profiles): the app looks for them, the user chooses the ones to add to the project ("Select all").
 * The server fetches the images (backend/src/lib/photo-import.js): the browser shows them from the app.
 */
import { useEffect, useState } from 'react';
import { Bookmark, Check, ClipboardPaste, Facebook, Globe, Instagram, MapPin, Search } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Alert, Button, Input, Modal, Spinner, Textarea, cx, uploadSummary } from './ui.jsx';
import { PHOTO_BOOKMARKLET } from '../photoBookmarklet.js';

export function ImportPhotos({ open, onClose, project, onAdded }) {
  const { t } = useT();
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [link, setLink] = useState('');
  const [pasted, setPasted] = useState('');
  const [scanning, setScanning] = useState(null);
  const [found, setFound] = useState(null); // { source, page, items, loginOnly }
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [broken, setBroken] = useState(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFound(null);
    setError(null);
    setChosen(new Set());
    setBroken(new Set());
    api.get(`/projects/${project.id}/images/import/sources`).then(setSources).catch(() => setSources({}));
  }, [open, project.id]);

  const scan = async (source) => {
    setScanning(source);
    setError(null);
    setFound(null);
    setChosen(new Set());
    setBroken(new Set());
    try {
      setFound(await api.post(`/projects/${project.id}/images/import/scan`, { source, url: link, text: pasted }));
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(null);
    }
  };

  const shown = found ? found.items.filter((i) => !broken.has(i.token)) : [];
  const toggle = (token) =>
    setChosen((set) => {
      const next = new Set(set);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  const allChosen = shown.length > 0 && shown.every((i) => chosen.has(i.token));

  const add = async () => {
    setImporting(true);
    try {
      const tokens = shown.filter((i) => chosen.has(i.token)).map((i) => i.token);
      let created = [];
      const errors = new Set();
      let small = 0;
      const optimized = [];
      // 40 at a time (limit of the server)
      for (let i = 0; i < tokens.length; i += 40) {
        const res = await api.post(`/projects/${project.id}/images/import`, { tokens: tokens.slice(i, i + 40) });
        created = [...created, ...res.created];
        res.errors.forEach((x) => errors.add(x));
        optimized.push(...res.optimized);
        small += res.small || 0;
      }
      if (created.length) {
        onAdded(created);
        toast(uploadSummary(t, { created, optimized }));
      }
      if (small) toast(t('{n} image(s) skipped: too small to be photos', { n: small }), 'error');
      if (errors.size) toast([...errors].join(' '), 'error');
      if (created.length) onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const sourceButton = (source, icon, label, enabled, missing) => (
    <Button icon={icon} onClick={() => scan(source)} loading={scanning === source} disabled={!enabled || (scanning && scanning !== source)} title={enabled ? undefined : missing}>
      {label}
    </Button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Find photos of the business')}
      size="xl"
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" icon={Check} onClick={add} loading={importing} disabled={!shown.some((i) => chosen.has(i.token))}>
            {t('Add {n} photo(s)', { n: shown.filter((i) => chosen.has(i.token)).length })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {sourceButton('google', MapPin, 'Google Maps', sources?.google, t('Needs the Google key of the app (GOOGLE_MAPS_API_KEY on the server)'))}
          {sourceButton('instagram', Instagram, 'Instagram', sources?.instagram, t('Enter the Instagram address in the site data first'))}
          {sourceButton('facebook', Facebook, 'Facebook', sources?.facebook, t('Enter the Facebook address in the site data first'))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) scan('link');
          }}
        >
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('Or the address of a public page with the photos (the old website, a gallery…)')} />
          <Button type="submit" icon={Search} loading={scanning === 'link'} disabled={!link.trim() || (scanning && scanning !== 'link')}>
            {t('Search')}
          </Button>
        </form>
        {/* Photos of a page the user is logged in to (Instagram, Facebook, Google Maps): listed in their own browser by a bookmark, pasted here */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-sm font-semibold text-slate-800">{t('From Instagram, Facebook or Google Maps, with your own browser')}</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
            <li>
              {t('Drag this button to the bookmarks bar of your browser (once):')}{' '}
              <a
                // React does not write javascript: addresses itself: the bookmark address is set on the element
                ref={(el) => el && el.setAttribute('href', PHOTO_BOOKMARKLET)}
                onClick={(e) => e.preventDefault()}
                draggable
                className="ml-1 inline-flex cursor-grab items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-2.5 py-1 text-sm font-semibold text-brand-700 shadow-sm"
                title={t('Drag me to the bookmarks bar')}
              >
                <Bookmark className="size-3.5" />
                {t('Copy photos')}
              </a>
            </li>
            <li>{t('Open the profile or the photos of the listing in another tab (logged in with your account) and scroll until the photos you want are on the page.')}</li>
            <li>{t('Click the "Copy photos" bookmark, then "Copia" in the small window that appears.')}</li>
            <li>{t('Come back here, paste and press "Show the photos".')}</li>
          </ol>
          <div className="mt-3 flex items-start gap-2">
            <Textarea rows={2} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={t('Paste here the addresses copied (Ctrl+V)')} className="font-mono text-xs" />
            <Button icon={ClipboardPaste} onClick={() => scan('list')} loading={scanning === 'list'} disabled={!pasted.trim() || (scanning && scanning !== 'list')} className="shrink-0">
              {t('Show the photos')}
            </Button>
          </div>
        </div>
        {sources && !sources.google && (
          <p className="text-xs text-slate-500">{t('Google Maps: the photos of the listing come from the official Google service, which needs a key of yours on the server (GOOGLE_MAPS_API_KEY). Google gives a free monthly allowance.')}</p>
        )}

        {error && <Alert kind="error">{error}</Alert>}
        {scanning && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {found && !scanning && (
          <>
            {!shown.length ? (
              <Alert kind="warning" title={t('No photos found')}>
                {found.loginOnly
                  ? t('Instagram and Facebook show their photos only to people logged in: a page opened without an account holds no photos. Download them from the profile and upload them here, or use another page (the website, Google Maps).')
                  : t('This page shows no photos to a visitor (they may be loaded by a script). Try the page of its gallery.')}
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm text-slate-600" title={found.page}>
                    <Globe className="mr-1.5 inline size-4 text-slate-400" />
                    {t('{n} image(s) found', { n: shown.length })}
                    {found.page ? ` · ${found.page}` : ''}
                  </p>
                  <Button size="sm" onClick={() => setChosen(allChosen ? new Set() : new Set(shown.map((i) => i.token)))}>
                    {allChosen ? t('Deselect all') : t('Select all')}
                  </Button>
                </div>
                <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                  {shown.map((item) => {
                    const on = chosen.has(item.token);
                    return (
                      <button
                        key={item.token}
                        type="button"
                        onClick={() => toggle(item.token)}
                        aria-pressed={on}
                        className={cx('group relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-slate-100 text-left', on ? 'border-brand-600 ring-2 ring-brand-200' : 'border-transparent hover:border-slate-300')}
                      >
                        <img
                          src={`/api/projects/${project.id}/images/import/preview?token=${encodeURIComponent(item.token)}`}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                          // An address that is not an image after all (or cannot be reached) leaves the list
                          onError={() => setBroken((set) => new Set(set).add(item.token))}
                          onLoad={(e) => {
                            if (e.currentTarget.naturalWidth < 300 || e.currentTarget.naturalHeight < 200) setBroken((set) => new Set(set).add(item.token));
                          }}
                        />
                        <span className={cx('absolute top-2 left-2 flex size-6 items-center justify-center rounded-md border text-white', on ? 'border-brand-600 bg-brand-600' : 'border-white/80 bg-black/25')}>
                          {on && <Check className="size-4" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
