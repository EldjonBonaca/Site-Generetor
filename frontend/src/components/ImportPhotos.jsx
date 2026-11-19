/**
 * Photos of the business found elsewhere, added to the project:
 *
 *  - a link to an Instagram profile or to a Google Maps listing, read by the photo downloader the user runs
 *    on their own computer (the "insta-downloader" tool, http://127.0.0.1:8000): Instagram and Google answer
 *    a home computer, not a server, so the browser asks that tool, shows what it finds and uploads the
 *    chosen photos to the project. Without the tool, the server reads what the public page shows;
 *  - copy and paste: Ctrl+A and Ctrl+C on the page with the photos, Ctrl+V here; a copied photo; photos
 *    or a zip dragged here;
 *  - the address of any public page (the old website of the client).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ClipboardPaste, Globe, Plug, Search } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Alert, Button, Input, Modal, Spinner, cx, uploadSummary } from './ui.jsx';

const HELPER_KEY = 'esg-photo-helper';
const DEFAULT_HELPER = 'http://127.0.0.1:8000';
const readHelper = () => {
  try {
    return localStorage.getItem(HELPER_KEY) || DEFAULT_HELPER;
  } catch {
    return DEFAULT_HELPER;
  }
};
/** Only a tool on this computer is ever asked (never another site). */
const localAddress = (value) => {
  const v = String(value || '').trim().replace(/\/+$/, '');
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?$/i.test(v) ? v : '';
};
const isInstagram = (link) => /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\//i.test(link.trim()) || /^@[\w.]+$/.test(link.trim());
const isMaps = (link) => /^(https?:\/\/)?((www\.|maps\.)?google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6}|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|share\.google)/i.test(link.trim());

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

const usableFiles = (list) => [...(list || [])].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|jfif|png|webp|gif|avif|tiff?|heic|svg|zip)$/i.test(f.name));

/**
 * The photos of a link, asked to the downloader on this computer. offset: photos / posts already listed.
 * -> { items: [{ key, thumb, full, name }], more: boolean, next: number, title }
 */
async function askHelper(helper, link, offset) {
  const get = async (path) => {
    const res = await fetch(`${helper}${path}`, { signal: AbortSignal.timeout(180000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.detail || data.message || `HTTP ${res.status}`);
    return data;
  };
  if (isMaps(link)) {
    const data = await get(`/api/google-business?url=${encodeURIComponent(link.trim())}&limit=25&offset=${offset}`);
    const items = (data.photos || []).map((p) => ({ key: p.id || p.max_quality_url, thumb: p.thumb_url || p.max_quality_url, full: p.max_quality_url || p.thumb_url, name: p.filename || 'foto.jpg' }));
    return { items, more: Boolean(data.has_more), next: offset + items.length, title: data.title || '' };
  }
  const data = await get(`/api/profile?target=${encodeURIComponent(link.trim())}&max_posts=25&offset=${offset}`);
  const items = [];
  for (const post of data.posts || []) {
    for (const m of post.media || []) if (!m.is_video && m.url) items.push({ key: `${post.shortcode}-${m.index}`, thumb: m.url, full: m.url, name: `${data.username || 'instagram'}-${post.shortcode}-${m.index}.jpg` });
  }
  return { items, more: Boolean(data.has_more), next: offset + (data.loaded_count || (data.posts || []).length), title: data.full_name || data.username || '' };
}

export function ImportPhotos({ open, onClose, project, onAdded }) {
  const { t } = useT();
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [link, setLink] = useState('');
  const [scanning, setScanning] = useState(null);
  const [found, setFound] = useState(null); // { page, items: [{ key, token? | thumb + full + name }], loginOnly, latestOnly }
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [broken, setBroken] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [over, setOver] = useState(false);
  const [helper, setHelper] = useState(readHelper);
  const [helperOn, setHelperOn] = useState(null); // null: not checked yet
  const [more, setMore] = useState(null); // { link, next }: the downloader has more photos of this link
  const progress = useRef('');
  const [, tick] = useState(0);

  const helperUrl = localAddress(helper);

  // Is the downloader running on this computer?
  const checkHelper = useCallback(async (address) => {
    if (!address) return setHelperOn(false);
    const other = address.includes('127.0.0.1') ? address.replace('127.0.0.1', 'localhost') : address.replace('localhost', '127.0.0.1');
    for (const candidate of [address, other]) {
      try {
        // targetAddressSpace: tells Chrome the request goes to this computer (it then asks the user once for permission)
        await fetch(`${candidate}/`, { signal: AbortSignal.timeout(2500), mode: 'no-cors', targetAddressSpace: 'loopback' });
        if (candidate !== address) {
          setHelper(candidate);
          try {
            localStorage.setItem(HELPER_KEY, candidate);
          } catch {
            /* private mode */
          }
        }
        setHelperOn(true);
        return true;
      } catch {
        /* next */
      }
    }
    setHelperOn(false);
    return false;
  }, []);

  useEffect(() => {
    if (!open) return;
    setFound(null);
    setError(null);
    setChosen(new Set());
    setBroken(new Set());
    setMore(null);
    api.get(`/projects/${project.id}/images/import/sources`).then(setSources).catch(() => setSources({}));
    checkHelper(helperUrl);
  }, [open, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What is found is added to what is already listed; everything new is selected. */
  const addFound = useCallback((res, items) => {
    setFound((old) => {
      const known = new Set((old?.items || []).map((i) => i.key));
      return { ...res, page: old?.items?.length ? '' : res.page, items: [...(old?.items || []), ...items.filter((i) => !known.has(i.key))] };
    });
    setChosen((set) => new Set([...set, ...items.map((i) => i.key)]));
  }, []);

  const scan = useCallback(
    async (source, extra = {}) => {
      setScanning(source);
      setError(null);
      setFound((old) => (old?.items?.length ? old : null));
      try {
        const res = await api.post(`/projects/${project.id}/images/import/scan`, { source, ...extra });
        addFound(res, res.items.map((i) => ({ ...i, key: i.token })));
      } catch (e) {
        setError(e.message);
      } finally {
        setScanning(null);
      }
    },
    [project.id, addFound]
  );

  /** A link: Instagram and Google Maps through the downloader on this computer when it runs, else through the server. */
  const search = async (address = link, offset = 0) => {
    const network = isInstagram(address) || isMaps(address);
    // The downloader may have been started after the dialog was opened
    const running = network && helperUrl ? helperOn || (await checkHelper(helperUrl)) : false;
    setFound((old) => (old?.items?.length ? old : null));
    if (!running && isMaps(address) && !sources?.google) {
      setError(t('A Google Maps link is read by the downloader on this computer, which is not running. Start it (in its folder: "Avvia downloader.bat"), wait until it says it is running, then press Search again.'));
      return undefined;
    }
    if (!running) return scan('link', { url: address });
    setScanning('link');
    setError(null);
    try {
      const res = await askHelper(helperUrl, address, offset);
      addFound({ page: res.title || address, loginOnly: false, latestOnly: false }, res.items);
      setMore(res.more ? { link: address, next: res.next } : null);
      if (!res.items.length && !offset) setFound((old) => old || { page: address, items: [], loginOnly: false });
    } catch (e) {
      setError(t('The downloader on this computer answered with an error: {error}', { error: e.message }));
    } finally {
      setScanning(null);
    }
    return undefined;
  };

  /** Photos given as files (a copied image, files or a zip dragged from the computer): added at once. */
  const uploadFiles = useCallback(
    async (all, { silent = false } = {}) => {
      const zips = all.filter((f) => /\.zip$/i.test(f.name));
      const files = all.filter((f) => !/\.zip$/i.test(f.name));
      const res = { created: [], errors: [], optimized: [] };
      const merge = (r) => {
        res.created.push(...r.created);
        res.errors.push(...r.errors);
        res.optimized.push(...r.optimized);
      };
      for (const zip of zips) {
        const fd = new FormData();
        fd.append('file', zip);
        merge(await api.upload(`/projects/${project.id}/images/zip`, fd));
      }
      // 10 at a time: many large photos in one request would be too heavy
      for (let i = 0; i < files.length; i += 10) {
        const fd = new FormData();
        files.slice(i, i + 10).forEach((f, n) => fd.append('files', f, f.name || `foto-${i + n + 1}.png`));
        try {
          merge(await api.upload(`/projects/${project.id}/images`, fd));
        } catch (e) {
          res.errors.push(e.message);
        }
      }
      if (res.created.length) onAdded(res.created);
      if (!silent) {
        if (res.errors.length) toast([...new Set(res.errors)].join(' '), 'error');
        if (res.created.length) toast(uploadSummary(t, res));
      }
      return res;
    },
    [project.id, onAdded, t, toast]
  );

  /** What was pasted or dropped: files, or the content of a page with the addresses of its photos. */
  const take = useCallback(
    async (data) => {
      const files = usableFiles(data.files);
      if (files.length) {
        setScanning('files');
        setError(null);
        try {
          await uploadFiles(files);
        } catch (e) {
          setError(e.message);
        } finally {
          setScanning(null);
        }
        return;
      }
      const addresses = addressesOf(data.getData('text/html'), `${data.getData('text/uri-list')}\n${data.getData('text/plain')}`);
      if (!addresses.length) {
        setError(t('Nothing to use in what you pasted: copy the page with the photos (Ctrl+A, then Ctrl+C) or a photo.'));
        return;
      }
      scan('list', { text: addresses.join('\n') });
    },
    [scan, uploadFiles, t]
  );

  // Ctrl+V anywhere in the dialog (except while typing in a field)
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

  const shown = found ? found.items.filter((i) => !broken.has(i.key)) : [];
  const toggle = (key) =>
    setChosen((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const picked = shown.filter((i) => chosen.has(i.key));
  const allChosen = shown.length > 0 && picked.length === shown.length;
  const srcOf = (item) => (item.token ? `/api/projects/${project.id}/images/import/preview?token=${encodeURIComponent(item.token)}` : `${helperUrl}/api/proxy?url=${encodeURIComponent(item.thumb)}`);

  const add = async () => {
    setImporting(true);
    try {
      let created = 0;
      const errors = new Set();
      let small = 0;
      // Photos listed by the server: downloaded by the server, 40 at a time
      const tokens = picked.filter((i) => i.token).map((i) => i.token);
      for (let i = 0; i < tokens.length; i += 40) {
        const res = await api.post(`/projects/${project.id}/images/import`, { tokens: tokens.slice(i, i + 40) });
        if (res.created.length) onAdded(res.created);
        created += res.created.length;
        res.errors.forEach((x) => errors.add(x));
        small += res.small || 0;
      }
      // Photos listed by the downloader on this computer: fetched through it by the browser, then uploaded
      const local = picked.filter((i) => !i.token);
      const files = [];
      for (const [n, item] of local.entries()) {
        progress.current = `${n + 1} / ${local.length}`;
        tick((x) => x + 1);
        try {
          const res = await fetch(`${helperUrl}/api/proxy?url=${encodeURIComponent(item.full)}`, { signal: AbortSignal.timeout(60000) });
          const blob = await res.blob();
          if (!res.ok || !/^image\//.test(blob.type || 'image/jpeg')) throw new Error(item.name);
          files.push(new File([blob], item.name, { type: blob.type || 'image/jpeg' }));
        } catch {
          errors.add(t('A photo could not be downloaded: {name}', { name: item.name }));
        }
      }
      progress.current = '';
      if (files.length) {
        const res = await uploadFiles(files, { silent: true });
        created += res.created.length;
        res.errors.forEach((x) => errors.add(x));
      }
      if (created) toast(t('{n} photo(s) added to the project', { n: created }));
      if (small) toast(t('{n} image(s) skipped: too small to be photos', { n: small }), 'error');
      if (errors.size) toast([...errors].slice(0, 4).join(' '), 'error');
      if (created) onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      progress.current = '';
      setImporting(false);
    }
  };

  const saveHelper = (value) => {
    setHelper(value);
    try {
      localStorage.setItem(HELPER_KEY, value);
    } catch {
      /* private mode */
    }
    checkHelper(localAddress(value));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Find photos of the business')}
      size="xl"
      footer={
        <>
          {importing && progress.current && <span className="mr-auto text-sm text-slate-500">{t('Downloading {n}…', { n: progress.current })}</span>}
          <Button onClick={onClose}>{t('Close')}</Button>
          <Button variant="primary" icon={Check} onClick={add} loading={importing} disabled={!picked.length}>
            {t('Add {n} photo(s)', { n: picked.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) search(link, 0);
          }}
        >
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('Link: the Instagram profile, the Google Maps listing, the Facebook page, the website…')} autoFocus />
          <Button type="submit" variant="primary" icon={Search} loading={scanning === 'link'} disabled={!link.trim() || Boolean(scanning && scanning !== 'link')}>
            {t('Search')}
          </Button>
        </form>

        {/* The downloader on this computer: Instagram and Google Maps answer a home computer, not a server */}
        <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs', helperOn ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600')}>
          <Plug className="size-4 shrink-0" />
          <span className="font-medium">
            {helperOn ? t('Downloader on this computer: connected. Instagram and Google Maps links give all their photos.') : t('Downloader on this computer: not running. Start "insta-downloader" on this computer to get all the photos of Instagram and Google Maps links.')}
          </span>
          {!helperOn && (
            <span className="basis-full pl-7 text-[11px] leading-relaxed text-slate-500">
              {t('1. Open the folder of insta-downloader and double click "Avvia downloader.bat" (a black window stays open). 2. Press "Check" here. If the browser asks whether this site may reach programs on your computer, allow it.')}{' '}
              <a href={helperUrl || DEFAULT_HELPER} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline">
                {t('Open the downloader in a new tab to see if it is running')}
              </a>
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <input value={helper} onChange={(e) => saveHelper(e.target.value)} className="w-44 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-700" aria-label={t('Address of the downloader')} />
            <button type="button" onClick={() => checkHelper(helperUrl)} className="rounded px-1.5 py-1 font-medium underline">
              {t('Check')}
            </button>
          </span>
        </div>

        {/* Paste (a copied page or a copied photo) or drop photos / a zip */}
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
          className={cx('flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-left transition-colors', over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60')}
        >
          <ClipboardPaste className="size-7 shrink-0 text-slate-400" />
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{t('Or paste here (Ctrl+V) / drag photos or a zip here.')}</span>{' '}
            {t('On the page with the photos press Ctrl+A then Ctrl+C, and Ctrl+V here.')}
          </p>
        </div>

        {error && <Alert kind="error">{error}</Alert>}
        {scanning && (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-slate-500">
            <Spinner />
            {scanning === 'link' && helperOn && (isMaps(link) || isInstagram(link)) && <span>{t('The downloader is reading the photos: Google Maps can take a minute.')}</span>}
          </div>
        )}
        {found && !scanning && (
          <>
            {!shown.length ? (
              <Alert kind="warning" title={t('No photos found')}>
                {found.loginOnly
                  ? t('Instagram and Facebook give their photos to a home computer, not to a server. Start "insta-downloader" on this computer and search again, or open the profile, press Ctrl+A then Ctrl+C, and paste here with Ctrl+V.')
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
                  <div className="flex gap-2">
                    {more && (
                      <Button size="sm" onClick={() => search(more.link, more.next)}>
                        {t('Load more photos')}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setChosen(allChosen ? new Set() : new Set(shown.map((i) => i.key)))}>
                      {allChosen ? t('Deselect all') : t('Select all')}
                    </Button>
                  </div>
                </div>
                {found.latestOnly && (
                  <p className="text-xs text-slate-500">{t('A link to a profile gives its latest posts only. For the older photos: open the profile, scroll down, press Ctrl+A then Ctrl+C and paste here (Ctrl+V): they are added to this list. You can repeat it while scrolling.')}</p>
                )}
                <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                  {shown.map((item) => {
                    const on = chosen.has(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => toggle(item.key)}
                        aria-pressed={on}
                        className={cx('group relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-slate-100 text-left', on ? 'border-brand-600 ring-2 ring-brand-200' : 'border-transparent hover:border-slate-300')}
                      >
                        <img
                          src={srcOf(item)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                          // An address that is not a photo after all (an icon, or it cannot be reached) leaves the list
                          onError={() => setBroken((set) => new Set(set).add(item.key))}
                          onLoad={(e) => {
                            if (item.token && (e.currentTarget.naturalWidth < 300 || e.currentTarget.naturalHeight < 200)) setBroken((set) => new Set(set).add(item.key));
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
        {sources?.google && !helperOn && <p className="text-xs text-slate-500">{t('Google Maps links are read through the official Google service (key of the app).')}</p>}
      </div>
    </Modal>
  );
}
