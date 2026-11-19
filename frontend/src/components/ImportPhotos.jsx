/**
 * Photos of the business found elsewhere, added to the project in the simplest way:
 *
 *  - copy and paste: on the page with the photos (an Instagram or Facebook profile, the photos of a Google
 *    Maps listing, any website) the user presses Ctrl+A and Ctrl+C, then Ctrl+V here: what the browser
 *    copied holds the addresses of the photos of that page, which are listed to choose from;
 *  - a copied photo (right click → Copy image) pasted here, or photos dragged here from another tab or
 *    from the computer, are added at once;
 *  - the address of a public page (the old website of the client);
 *  - Google Maps through the official service, when the app has its key.
 *
 * The server fetches the listed images (backend/src/lib/photo-import.js): the browser shows them from the app.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardPaste, Globe, MapPin, Search } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Alert, Button, Input, Modal, Spinner, cx, uploadSummary } from './ui.jsx';

/** The largest version named in a srcset. */
function largestOfSrcset(srcset) {
  let best = '';
  let top = 0;
  for (const part of String(srcset || '').split(',')) {
    const [u, size] = part.trim().split(/\s+/);
    const n = parseFloat(size) || 1;
    if (u && n >= top) {
      top = n;
      best = u;
    }
  }
  return best;
}

/** Addresses of the images in what was copied from a web page (its HTML: images, background photos) or in plain text. */
export function addressesOf(html, text) {
  const out = [];
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const img of doc.querySelectorAll('img, source')) out.push(largestOfSrcset(img.getAttribute('srcset')) || img.getAttribute('src') || '');
    for (const el of doc.querySelectorAll('[style]')) for (const m of el.getAttribute('style').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) out.push(m[1]);
    for (const a of doc.querySelectorAll('a[href]')) if (/\.(jpe?g|png|webp|avif)([?#]|$)/i.test(a.getAttribute('href'))) out.push(a.getAttribute('href'));
  }
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)) out.push(m[0]);
  return [...new Set(out.filter((u) => /^https?:\/\//i.test(u)))];
}

const imageFiles = (list) => [...(list || [])].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|jfif|png|webp|gif|avif|tiff?|heic|svg)$/i.test(f.name));

export function ImportPhotos({ open, onClose, project, onAdded }) {
  const { t } = useT();
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [link, setLink] = useState('');
  const [scanning, setScanning] = useState(null);
  const [found, setFound] = useState(null); // { source, page, items, loginOnly }
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [broken, setBroken] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFound(null);
    setError(null);
    setChosen(new Set());
    setBroken(new Set());
    api.get(`/projects/${project.id}/images/import/sources`).then(setSources).catch(() => setSources({}));
  }, [open, project.id]);

  const scan = useCallback(
    async (source, extra = {}) => {
      setScanning(source);
      setError(null);
      setFound(null);
      setChosen(new Set());
      setBroken(new Set());
      try {
        const res = await api.post(`/projects/${project.id}/images/import/scan`, { source, ...extra });
        setFound(res);
        // Copied from a page: everything is selected, the user removes what they do not want
        if (source === 'list') setChosen(new Set(res.items.map((i) => i.token)));
      } catch (e) {
        setError(e.message);
      } finally {
        setScanning(null);
      }
    },
    [project.id]
  );

  /** Photos given as files (a copied image, files dragged from the computer): added at once. */
  const uploadFiles = useCallback(
    async (files) => {
      setScanning('files');
      setError(null);
      try {
        const fd = new FormData();
        files.forEach((f, i) => fd.append('files', f, f.name || `foto-${i + 1}.png`));
        const res = await api.upload(`/projects/${project.id}/images`, fd);
        if (res.errors.length) toast(res.errors.join(' '), 'error');
        if (res.created.length) {
          onAdded(res.created);
          toast(uploadSummary(t, res));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setScanning(null);
      }
    },
    [project.id, onAdded, t, toast]
  );

  /** What was pasted or dropped: image files, or the content of a page with the addresses of its photos. */
  const take = useCallback(
    (data) => {
      const files = imageFiles(data.files);
      if (files.length) return uploadFiles(files);
      const addresses = addressesOf(data.getData('text/html'), `${data.getData('text/uri-list')}\n${data.getData('text/plain')}`);
      if (!addresses.length) return setError(t('Nothing to use in what you pasted: copy the page with the photos (Ctrl+A, then Ctrl+C) or a photo.'));
      return scan('list', { text: addresses.join('\n') });
    },
    [scan, uploadFiles, t]
  );

  // Ctrl+V anywhere in the dialog (except while typing an address in the field)
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      take(e.clipboardData);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, take]);

  const shown = found ? found.items.filter((i) => !broken.has(i.token)) : [];
  const toggle = (token) =>
    setChosen((set) => {
      const next = new Set(set);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  const picked = shown.filter((i) => chosen.has(i.token));
  const allChosen = shown.length > 0 && picked.length === shown.length;

  const add = async () => {
    setImporting(true);
    try {
      const tokens = picked.map((i) => i.token);
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Find photos of the business')}
      size="xl"
      footer={
        <>
          <Button onClick={onClose}>{t('Close')}</Button>
          <Button variant="primary" icon={Check} onClick={add} loading={importing} disabled={!picked.length}>
            {t('Add {n} photo(s)', { n: picked.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* One place for everything: paste (a copied page or a copied photo) or drop photos */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer);
          }}
          className={cx('rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors', over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60')}
        >
          <ClipboardPaste className="mx-auto mb-2 size-8 text-slate-400" />
          <p className="text-base font-semibold text-slate-800">{t('Paste here (Ctrl+V) or drag the photos here')}</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
            {t('Instagram, Facebook, Google Maps or any site: open the page with the photos, press Ctrl+A then Ctrl+C, come back here and press Ctrl+V. You then choose the photos to keep.')}
          </p>
          <p className="mx-auto mt-1 max-w-2xl text-xs text-slate-500">{t('A single photo: right click on it → "Copy image", then Ctrl+V here.')}</p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) scan('link', { url: link });
          }}
        >
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('Or the address of a public page with the photos (the old website, a gallery…)')} />
          <Button type="submit" icon={Search} loading={scanning === 'link'} disabled={!link.trim() || (scanning && scanning !== 'link')}>
            {t('Search')}
          </Button>
          {sources?.google && (
            <Button icon={MapPin} onClick={() => scan('google')} loading={scanning === 'google'} disabled={Boolean(scanning && scanning !== 'google')}>
              Google Maps
            </Button>
          )}
        </form>

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
                  ? t('This network shows its photos only to people logged in. Open the profile in your browser, press Ctrl+A then Ctrl+C, and paste here with Ctrl+V.')
                  : t('No photo in what was given. Scroll the page until the photos are visible, then copy it again (Ctrl+A, Ctrl+C) and paste here.')}
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
                <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
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
                          // An address that is not a photo after all (an icon, or it cannot be reached) leaves the list
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
