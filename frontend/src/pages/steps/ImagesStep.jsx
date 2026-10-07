import { useEffect, useState } from 'react';
import { Sparkles, Trash2, Wand2, ImageIcon, Images } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { Badge, Button, Card, Dropzone, EmptyState, Field, IconButton, Input, Select, Toggle, cx } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';
import { LibraryPicker } from '../../components/LibraryPicker.jsx';

const ROLE_COLORS = { hero_home: 'blue', subheader: 'purple', service: 'green', logo: 'yellow', gallery: 'gray' };

export default function ImagesStep({ project, setProject, reload }) {
  const { t } = useT();
  const toast = useToast();
  const [images, setImages] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [picking, setPicking] = useState(false);
  const settings = project.settings;

  useEffect(() => {
    api.get(`/projects/${project.id}/images`).then(setImages).catch((e) => toast(e.message, 'error'));
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (files) => {
    setUploading(true);
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    try {
      const res = await api.upload(`/projects/${project.id}/images`, fd);
      setImages((list) => [...list, ...res.created]);
      if (res.errors.length) toast(res.errors.join(' '), 'error');
      else toast(t('{n} image(s) uploaded', { n: res.created.length }));
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const update = async (img, patch) => {
    try {
      const res = await api.patch(`/images/${img.id}`, patch);
      setImages(res.images);
      reload();
      return res.image;
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  };

  const remove = async (img) => {
    try {
      await api.del(`/images/${img.id}`);
      setImages((list) => list.filter((x) => x.id !== img.id));
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const seoRename = async () => {
    setBusy('rename');
    try {
      setImages(await api.post(`/projects/${project.id}/images/seo-rename`));
      toast(t('Assigned images renamed'));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const altWithAi = async () => {
    setBusy('alt');
    try {
      const res = await api.post(`/projects/${project.id}/images/alt-text`, {});
      setImages(res.images);
      toast(res.updated ? t('{n} ALT text(s) generated', { n: res.updated }) : t('All assigned images already have an ALT text'));
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (patch) => {
    try {
      setProject(await api.patch(`/projects/${project.id}`, { settings: patch }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const targetPages = [
    { value: '', label: t('All inner pages') },
    { value: 'about', label: t('About') },
    { value: 'contact', label: t('Contact') },
    { value: 'services', label: t('Services overview') },
    { value: 'gallery', label: t('Gallery') },
  ];

  return (
    <>
      <StepIssues project={project} step="images" t={t} />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card
          title={t('Images')}
          description={t('Upload and give each image a role: hero of the home page, subheader of inner pages, one image per service, logo. Every photo (all images except the logo) is shown on the Gallery page and also fills the other image spots of the site.')}
          actions={
            <>
              <Button size="sm" icon={Wand2} onClick={seoRename} loading={busy === 'rename'} disabled={!images?.some((i) => i.role)}>
                {t('SEO rename')}
              </Button>
              <Button size="sm" icon={Sparkles} onClick={altWithAi} loading={busy === 'alt'} disabled={!images?.some((i) => i.role)}>
                {t('ALT texts with AI')}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <Dropzone accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml" multiple onFiles={upload} busy={uploading} title={t('Drop images here or click to browse')} hint={t('JPG, PNG, WEBP or SVG')} />
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-6 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40"
            >
              <Images className="mb-2 size-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">{t('Choose from the Gallery')}</span>
              <span className="mt-1 text-xs text-slate-500">{t('Your saved images, by category')}</span>
            </button>
          </div>
          <LibraryPicker
            open={picking}
            onClose={() => setPicking(false)}
            projectId={project.id}
            projectImages={images}
            onAdded={(created) => {
              setImages((list) => [...list, ...created]);
              reload();
            }}
          />

          <div className="mt-5">
            {!images ? null : !images.length ? (
              <EmptyState icon={ImageIcon} title={t('No images yet')} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {images.map((img) => (
                  <ImageCard key={img.id} img={img} sizes={settings.image} services={project.services} perPage={settings.subheaderPerPage} targetPages={targetPages} onUpdate={(p) => update(img, p)} onRemove={() => remove(img)} />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card title={t('Image options')} className="self-start">
          <div className="space-y-5">
            <Toggle
              checked={settings.subheaderPerPage}
              onChange={(v) => saveSettings({ subheaderPerPage: v })}
              label={t('One subheader per page')}
              description={t('Allow a different subheader image for specific pages.')}
            />
            <Toggle
              checked={settings.replaceAllImages}
              onChange={(v) => saveSettings({ replaceAllImages: v })}
              label={t('Replace all demo images')}
              description={t('No template image remains: free slots get one of your images, people photos and a missing logo are removed.')}
            />
            <CropSizeField
              label={t('Home hero size')}
              hint={t('The Home hero image is cropped to exactly this size (the gallery keeps the full photo).')}
              size={settings.image.hero}
              onSave={(hero) => saveSettings({ image: { hero } })}
            />
            <CropSizeField
              label={t('Subheader size')}
              hint={t('The subheader image of the inner pages is cropped to exactly this size.')}
              size={settings.image.subheader}
              onSave={(subheader) => saveSettings({ image: { subheader } })}
            />
            <Toggle checked={settings.image.convertWebp} onChange={(v) => saveSettings({ image: { convertWebp: v } })} label={t('Convert to WEBP')} description={t('Applied to the exported images (SVG untouched).')} />
            <Field label={t('Max width')} hint={t('Larger images are resized on export.')}>
              {(id) => (
                <Select id={id} value={settings.image.maxWidth} onChange={(e) => saveSettings({ image: { maxWidth: Number(e.target.value) } })}>
                  {[1280, 1600, 1920, 2560].map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                  <option value={0}>{t('Original size')}</option>
                </Select>
              )}
            </Field>
            <Field label={`${t('Quality')}: ${settings.image.quality}`}>
              {(id) => (
                <input
                  id={id}
                  type="range"
                  min={50}
                  max={95}
                  step={1}
                  defaultValue={settings.image.quality}
                  onMouseUp={(e) => saveSettings({ image: { quality: Number(e.target.value) } })}
                  onKeyUp={(e) => saveSettings({ image: { quality: Number(e.target.value) } })}
                  onTouchEnd={(e) => saveSettings({ image: { quality: Number(e.target.value) } })}
                  className="w-full accent-brand-600"
                />
              )}
            </Field>
            <p className="text-xs text-slate-500">{t('The images base URL used in the templates is set in the Download step.')}</p>
          </div>
        </Card>
      </div>
    </>
  );
}

function ImageCard({ img, sizes, services, perPage, targetPages, onUpdate, onRemove }) {
  const { t } = useT();
  const [alt, setAlt] = useState(img.alt_text);
  const [name, setName] = useState(img.file_name.replace(/\.[^.]+$/, ''));
  const ext = img.file_name.match(/\.[^.]+$/)?.[0] || '';
  const { schedule } = useAutosave((patch) => onUpdate(patch), 800);

  useEffect(() => setAlt(img.alt_text), [img.alt_text]);
  useEffect(() => setName(img.file_name.replace(/\.[^.]+$/, '')), [img.file_name]);

  const roleValue = img.role === 'service' ? `service:${img.service_id}` : img.role;
  const changeRole = (v) => {
    if (v.startsWith('service:')) onUpdate({ role: 'service', service_id: Number(v.slice(8)) });
    else onUpdate({ role: v });
  };
  const roleLabel = {
    hero_home: t('Home hero'),
    subheader: t('Subheader'),
    logo: t('Logo'),
    gallery: t('Gallery'),
    service: services.find((s) => s.id === img.service_id)?.name || t('Service'),
  }[img.role];

  return (
    <div className={cx('overflow-hidden rounded-lg border bg-white', img.role ? 'border-slate-200' : 'border-dashed border-slate-300')}>
      <div className="checker relative aspect-video">
        <img src={`/api/images/${img.id}/file`} alt={img.alt_text} className="absolute inset-0 size-full object-contain" loading="lazy" />
        {img.role && (
          <Badge color={ROLE_COLORS[img.role]} className="absolute top-2 left-2 shadow-sm">
            {roleLabel}
          </Badge>
        )}
        <IconButton icon={Trash2} label={t('Delete')} onClick={onRemove} className="absolute top-1.5 right-1.5 bg-white/90 shadow-sm hover:text-red-600" />
      </div>
      <div className="space-y-2.5 p-3">
        <p className="truncate text-xs text-slate-500" title={img.original_name}>
          {img.original_name} · {img.width ? `${img.width}×${img.height} · ` : ''}
          {Math.round(img.size / 1024)} KB
        </p>
        <Select value={roleValue} onChange={(e) => changeRole(e.target.value)} aria-label={t('Role')}>
          <option value="">{t('— No role —')}</option>
          <option value="hero_home">
            {t('Home hero (hero_home)')} · {sizes.hero.width}×{sizes.hero.height}px
          </option>
          <option value="subheader">
            {t('Subheader of inner pages')} · {sizes.subheader.width}×{sizes.subheader.height}px
          </option>
          {services.length > 0 && (
            <optgroup label={t('Service image')}>
              {services.map((s) => (
                <option key={s.id} value={`service:${s.id}`}>
                  {s.name || s.slug}
                </option>
              ))}
            </optgroup>
          )}
          <option value="logo">{t('Logo')}</option>
          <option value="gallery">{t('Gallery & other sections (no specific spot)')}</option>
        </Select>
        {perPage && img.role === 'subheader' && (
          <Select value={img.target_page || ''} onChange={(e) => onUpdate({ target_page: e.target.value || null })} aria-label={t('Page')}>
            {targetPages.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
        <Input
          value={alt}
          placeholder={t('ALT text')}
          aria-label={t('ALT text')}
          onChange={(e) => {
            setAlt(e.target.value);
            schedule({ alt_text: e.target.value });
          }}
          invalid={!!img.role && !alt.trim()}
        />
        <div className="flex items-center rounded-lg border border-slate-300 bg-white text-sm shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
          <input
            value={name}
            aria-label={t('File name')}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== img.file_name.replace(/\.[^.]+$/, '') && onUpdate({ file_name: name }).catch(() => setName(img.file_name.replace(/\.[^.]+$/, '')))}
            className="min-w-0 flex-1 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
          />
          <span className="pr-3 text-xs text-slate-400">{ext}</span>
        </div>
      </div>
    </div>
  );
}

/** Width × height (px) an image role is cropped to on export. */
function CropSizeField({ label, hint, size, onSave }) {
  const [value, setValue] = useState(size);
  useEffect(() => setValue(size), [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const next = { width: Number(value.width) || size.width, height: Number(value.height) || size.height };
    if (next.width !== size.width || next.height !== size.height) onSave(next);
  };
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="flex items-center gap-2">
          <Input id={id} type="number" min={320} max={3840} value={value.width} onChange={(e) => setValue({ ...value, width: e.target.value })} onBlur={save} className="w-24" aria-label={`${label} width`} />
          <span className="text-slate-400">×</span>
          <Input type="number" min={120} max={2160} value={value.height} onChange={(e) => setValue({ ...value, height: e.target.value })} onBlur={save} className="w-24" aria-label={`${label} height`} />
          <span className="text-xs text-slate-500">px</span>
        </div>
      )}
    </Field>
  );
}
