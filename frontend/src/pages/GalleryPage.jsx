import { useEffect, useMemo, useState } from 'react';
import { Check, FolderPlus, Images, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAutosave } from '../hooks/useAutosave.js';
import { Button, Card, Dropzone, EmptyState, IconButton, Input, Modal, PageHeader, Select, Spinner, cx } from '../components/ui.jsx';

/** Category filter value of an image: its category id, or 'none' when uncategorized. */
const catKey = (img) => (img.category_id == null ? 'none' : String(img.category_id));

export default function GalleryPage() {
  const { t } = useT();
  const toast = useToast();
  const [categories, setCategories] = useState(null);
  const [images, setImages] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'none' | category id
  const [uploadTo, setUploadTo] = useState('none');
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [catToDelete, setCatToDelete] = useState(null);
  const [toDelete, setToDelete] = useState(null); // array of image ids

  useEffect(() => {
    api.get('/library/categories').then((r) => setCategories(r.categories)).catch((e) => toast(e.message, 'error'));
    api.get('/library/images').then(setImages).catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { all: images?.length || 0, none: 0 };
    for (const img of images || []) c[catKey(img)] = (c[catKey(img)] || 0) + 1;
    return c;
  }, [images]);
  const visible = useMemo(() => (images || []).filter((img) => filter === 'all' || catKey(img) === filter), [images, filter]);
  const filterName = filter === 'all' ? t('All images') : filter === 'none' ? t('Uncategorized') : categories?.find((c) => String(c.id) === filter)?.name;

  const pickFilter = (value) => {
    setFilter(value);
    setSelected(new Set());
    if (value !== 'all') setUploadTo(value);
  };

  const upload = async (files) => {
    setUploading(true);
    const fd = new FormData();
    if (uploadTo !== 'none') fd.append('category_id', uploadTo);
    files.forEach((f) => fd.append('files', f));
    try {
      const res = await api.upload('/library/images', fd);
      setImages((list) => [...res.created.slice().reverse(), ...list]);
      if (res.errors.length) toast(res.errors.join(' '), 'error');
      else toast(t('{n} image(s) uploaded', { n: res.created.length }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const updateImage = async (id, patch) => {
    try {
      const img = await api.patch(`/library/images/${id}`, patch);
      setImages((list) => list.map((x) => (x.id === id ? img : x)));
      return img;
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  };

  const moveSelected = async (value) => {
    const ids = [...selected];
    try {
      for (const id of ids) await updateImage(id, { category_id: value });
      toast(t('{n} image(s) moved', { n: ids.length }));
      setSelected(new Set());
    } catch {
      /* toast already shown */
    }
  };

  const deleteImages = async () => {
    const ids = toDelete;
    setToDelete(null);
    const done = new Set();
    try {
      for (const id of ids) {
        await api.del(`/library/images/${id}`);
        done.add(id);
      }
      toast(t('{n} image(s) deleted', { n: ids.length }));
    } catch (e) {
      toast(e.message, 'error');
    }
    setImages((list) => list.filter((x) => !done.has(x.id)));
    setSelected((s) => new Set([...s].filter((id) => !done.has(id))));
  };

  const addCategory = async (e) => {
    e.preventDefault();
    try {
      const cat = await api.post('/library/categories', { name: newName });
      setCategories((list) => [...list, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      pickFilter(String(cat.id));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const renameCategory = async () => {
    const { id, name } = editing;
    const current = categories.find((c) => c.id === id);
    if (!name.trim() || name.trim() === current.name) return setEditing(null);
    try {
      const cat = await api.patch(`/library/categories/${id}`, { name });
      setCategories((list) => list.map((c) => (c.id === id ? cat : c)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const deleteCategory = async () => {
    const cat = catToDelete;
    setCatToDelete(null);
    try {
      await api.del(`/library/categories/${cat.id}`);
      setCategories((list) => list.filter((c) => c.id !== cat.id));
      setImages((list) => list.map((img) => (img.category_id === cat.id ? { ...img, category_id: null } : img)));
      if (filter === String(cat.id)) pickFilter('none');
      if (uploadTo === String(cat.id)) setUploadTo('none');
      toast(t('Category deleted'));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!categories || !images) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const categoryOptions = (
    <>
      <option value="none">{t('Uncategorized')}</option>
      {categories.map((c) => (
        <option key={c.id} value={String(c.id)}>
          {c.name}
        </option>
      ))}
    </>
  );

  return (
    <>
      <PageHeader
        title={t('Gallery')}
        description={t('Your reusable image library. Upload images once, organize them in categories and pick them in any project (step "Images").')}
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card title={t('Categories')} className="self-start" padded={false}>
          <nav className="space-y-0.5 p-2">
            <FilterItem active={filter === 'all'} onClick={() => pickFilter('all')} label={t('All images')} count={counts.all} />
            <FilterItem active={filter === 'none'} onClick={() => pickFilter('none')} label={t('Uncategorized')} count={counts.none} muted />
            {categories.map((c) =>
              editing?.id === c.id ? (
                <form
                  key={c.id}
                  className="flex items-center gap-1 px-1 py-0.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renameCategory();
                  }}
                >
                  <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} className="h-8 min-w-0 flex-1 py-1" aria-label={t('Category name')} />
                  <IconButton icon={Check} label={t('Save')} type="submit" />
                  <IconButton icon={X} label={t('Cancel')} onClick={() => setEditing(null)} />
                </form>
              ) : (
                <div key={c.id} className="group relative">
                  <FilterItem active={filter === String(c.id)} onClick={() => pickFilter(String(c.id))} label={c.name} count={counts[String(c.id)] || 0} />
                  <div className="absolute top-1/2 right-9 hidden -translate-y-1/2 gap-0.5 group-focus-within:flex group-hover:flex">
                    <IconButton icon={Pencil} label={t('Rename')} onClick={() => setEditing({ id: c.id, name: c.name })} className="size-7 bg-white" />
                    <IconButton icon={Trash2} label={t('Delete')} onClick={() => setCatToDelete(c)} className="size-7 bg-white hover:text-red-600" />
                  </div>
                </div>
              )
            )}
          </nav>
          <form onSubmit={addCategory} className="flex gap-2 border-t border-slate-100 p-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('New category')} aria-label={t('New category')} maxLength={80} className="min-w-0 flex-1" />
            <Button type="submit" icon={FolderPlus} disabled={!newName.trim()} aria-label={t('Add category')} title={t('Add category')} />
          </form>
        </Card>

        <Card
          title={filterName}
          description={t('{n} image(s)', { n: visible.length })}
          actions={
            selected.size > 0 && (
              <>
                <span className="text-xs text-slate-500">{t('{n} selected', { n: selected.size })}</span>
                <Select value="" onChange={(e) => e.target.value && moveSelected(e.target.value)} aria-label={t('Move to category')} className="h-8 w-auto py-1 text-xs">
                  <option value="">{t('Move to…')}</option>
                  {categoryOptions}
                </Select>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setToDelete([...selected])}>
                  {t('Delete')}
                </Button>
                <IconButton icon={X} label={t('Clear selection')} onClick={() => setSelected(new Set())} />
              </>
            )
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="upload-to" className="text-slate-600">
              {t('Upload to')}
            </label>
            <Select id="upload-to" value={uploadTo} onChange={(e) => setUploadTo(e.target.value)} className="w-auto">
              {categoryOptions}
            </Select>
          </div>
          <Dropzone accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml" multiple onFiles={upload} busy={uploading} title={t('Drop images here or click to browse')} hint={t('JPG, PNG, WEBP or SVG')} />

          <div className="mt-5">
            {!visible.length ? (
              <EmptyState icon={Images} title={images.length ? t('No images in this category') : t('The Gallery is empty')} description={t('Uploaded images can be used in every project.')} />
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((i) => i.id)))}
                  >
                    {selected.size === visible.length ? t('Clear selection') : t('Select all')}
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((img) => (
                    <LibraryImageCard
                      key={img.id}
                      img={img}
                      categoryOptions={categoryOptions}
                      selected={selected.has(img.id)}
                      onToggle={() => toggle(img.id)}
                      onUpdate={(p) => updateImage(img.id, p)}
                      onRemove={() => setToDelete([img.id])}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={!!catToDelete}
        onClose={() => setCatToDelete(null)}
        title={t('Delete category?')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setCatToDelete(null)}>{t('Cancel')}</Button>
            <Button variant="danger" icon={Trash2} onClick={deleteCategory}>
              {t('Delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {t('The category "{name}" will be deleted. Its {n} image(s) are kept and moved to Uncategorized.', { name: catToDelete?.name, n: counts[String(catToDelete?.id)] || 0 })}
        </p>
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={t('Delete from the Gallery?')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>{t('Cancel')}</Button>
            <Button variant="danger" icon={Trash2} onClick={deleteImages}>
              {t('Delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{t('{n} image(s) will be deleted from the Gallery. Projects that already use them keep their copy.', { n: toDelete?.length || 0 })}</p>
      </Modal>
    </>
  );
}

function FilterItem({ active, onClick, label, count, muted }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm',
        active ? 'bg-brand-50 font-medium text-brand-700' : cx('hover:bg-slate-100', muted ? 'text-slate-500' : 'text-slate-700')
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cx('text-xs tabular-nums', active ? 'text-brand-600' : 'text-slate-400')}>{count}</span>
    </button>
  );
}

function LibraryImageCard({ img, categoryOptions, selected, onToggle, onUpdate, onRemove }) {
  const { t } = useT();
  const [alt, setAlt] = useState(img.alt_text);
  const { schedule } = useAutosave((patch) => onUpdate(patch), 800);
  useEffect(() => setAlt(img.alt_text), [img.alt_text]);

  return (
    <div className={cx('overflow-hidden rounded-lg border bg-white', selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200')}>
      <div className="checker relative aspect-video">
        <button type="button" onClick={onToggle} className="absolute inset-0" aria-label={t('Select')} aria-pressed={selected}>
          <img src={`/api/library/images/${img.id}/file`} alt={img.alt_text} className="size-full object-contain" loading="lazy" />
        </button>
        <span className={cx('pointer-events-none absolute top-2 left-2 flex size-5 items-center justify-center rounded border shadow-sm', selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white/90')}>
          {selected && <Check className="size-3.5" />}
        </span>
        <IconButton icon={Trash2} label={t('Delete')} onClick={onRemove} className="absolute top-1.5 right-1.5 bg-white/90 shadow-sm hover:text-red-600" />
      </div>
      <div className="space-y-2.5 p-3">
        <p className="truncate text-xs text-slate-500" title={img.original_name}>
          {img.original_name} · {img.width ? `${img.width}×${img.height} · ` : ''}
          {Math.round(img.size / 1024)} KB
        </p>
        <Select value={img.category_id == null ? 'none' : String(img.category_id)} onChange={(e) => onUpdate({ category_id: e.target.value })} aria-label={t('Category')}>
          {categoryOptions}
        </Select>
        <Input
          value={alt}
          placeholder={t('ALT text (optional)')}
          aria-label={t('ALT text')}
          onChange={(e) => {
            setAlt(e.target.value);
            schedule({ alt_text: e.target.value });
          }}
        />
      </div>
    </div>
  );
}

