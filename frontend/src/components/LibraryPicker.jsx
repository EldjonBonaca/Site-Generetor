/** Modal to pick images of the Gallery library (by category) and add them to a project. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Images } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Button, EmptyState, Modal, Spinner, cx } from './ui.jsx';

const catKey = (img) => (img.category_id == null ? 'none' : String(img.category_id));

export function LibraryPicker({ open, onClose, projectId, projectImages, onAdded }) {
  const { t } = useT();
  const toast = useToast();
  const [categories, setCategories] = useState(null);
  const [images, setImages] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    Promise.all([api.get('/library/categories'), api.get('/library/images')])
      .then(([c, i]) => {
        setCategories(c.categories);
        setImages(i);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const added = useMemo(() => new Set((projectImages || []).map((i) => i.library_image_id).filter(Boolean)), [projectImages]);
  const counts = useMemo(() => {
    const c = { all: images?.length || 0, none: 0 };
    for (const img of images || []) c[catKey(img)] = (c[catKey(img)] || 0) + 1;
    return c;
  }, [images]);
  const visible = (images || []).filter((img) => filter === 'all' || catKey(img) === filter);
  const selectable = visible.filter((img) => !added.has(img.id));
  const allSelected = selectable.length > 0 && selectable.every((img) => selected.has(img.id));

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      for (const img of selectable) {
        if (allSelected) next.delete(img.id);
        else next.add(img.id);
      }
      return next;
    });

  const add = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/projects/${projectId}/images/from-library`, { ids: [...selected] });
      onAdded(res.created);
      toast(t('{n} image(s) added from the Gallery', { n: res.created.length }));
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const chips = [
    { value: 'all', label: t('All'), count: counts.all },
    ...(categories || []).map((c) => ({ value: String(c.id), label: c.name, count: counts[String(c.id)] || 0 })),
    ...(counts.none ? [{ value: 'none', label: t('Uncategorized'), count: counts.none }] : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Choose from the Gallery')}
      size="xl"
      footer={
        <>
          {selectable.length > 0 && (
            <Button variant="ghost" onClick={selectAll} className="mr-auto">
              {allSelected ? t('Deselect all') : t('Select all ({n})', { n: selectable.length })}
            </Button>
          )}
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" icon={Images} onClick={add} loading={busy} disabled={!selected.size}>
            {selected.size ? t('Add {n} image(s)', { n: selected.size }) : t('Add images')}
          </Button>
        </>
      }
    >
      {!images ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !images.length ? (
        <EmptyState
          icon={Images}
          title={t('The Gallery is empty')}
          description={t('Upload images in the Gallery once and reuse them in every project.')}
          action={
            <Link to="/gallery" className="text-sm font-medium text-brand-700 hover:underline">
              {t('Open the Gallery')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
            {chips.map((c) => (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={filter === c.value}
                onClick={() => setFilter(c.value)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                  filter === c.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                {c.label}
                <span className={filter === c.value ? 'text-white/80' : 'text-slate-400'}>{c.count}</span>
              </button>
            ))}
          </div>
          {!visible.length ? (
            <p className="py-10 text-center text-sm text-slate-500">{t('No images in this category')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((img) => {
                const isAdded = added.has(img.id);
                const isSelected = selected.has(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    disabled={isAdded}
                    onClick={() => toggle(img.id)}
                    aria-pressed={isSelected}
                    title={img.original_name}
                    className={cx(
                      'checker relative aspect-[4/3] overflow-hidden rounded-lg border text-left',
                      isSelected ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-slate-200 hover:border-slate-400',
                      isAdded && 'cursor-default opacity-50'
                    )}
                  >
                    <img src={`/api/library/images/${img.id}/file`} alt={img.alt_text} className="absolute inset-0 size-full object-cover" loading="lazy" />
                    {isAdded ? (
                      <span className="absolute top-2 left-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-medium text-white">{t('Already added')}</span>
                    ) : (
                      <span className={cx('absolute top-2 left-2 flex size-5 items-center justify-center rounded border shadow-sm', isSelected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white/90')}>
                        {isSelected && <Check className="size-3.5" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
