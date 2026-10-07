import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, LayoutTemplate, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, Card, Dropzone, EmptyState, IconButton, Input, PageHeader, Spinner } from '../components/ui.jsx';
import { formatDate } from './ProjectsPage.jsx';
import { PAGE_ROLE_LABELS } from './steps/KitStep.jsx';

export default function KitsPage() {
  const { t } = useT();
  const toast = useToast();
  const [kits, setKits] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = () => api.get('/kits').then(setKits);
  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async ([file]) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const kit = await api.upload('/kits', fd);
      toast(t('Kit "{name}" uploaded: {n} templates found', { name: kit.name, n: kit.templates.length }));
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader title={t('Template Kits')} description={t('Elementor kits saved in the library. Each project uses a copy: the original zip is never modified.')} />
      <Dropzone accept=".zip,application/zip" onFiles={upload} busy={uploading} title={t('Upload a kit .zip')} hint={t('Template Kit (manifest.json + templates/) or Elementor Website Kit export')} />
      <div className="mt-6">
        {!kits ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !kits.length ? (
          <EmptyState icon={LayoutTemplate} title={t('No kits yet')} description={t('Tip: a sample kit is available in samples/sample-elementor-kit.zip.')} />
        ) : (
          <ul className="space-y-4">
            {kits.map((k) => (
              <KitItem key={k.id} kit={k} onChanged={load} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function KitItem({ kit, onChanged }) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(kit.name);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!details) api.get(`/kits/${kit.id}`).then(setDetails).catch((e) => toast(e.message, 'error'));
  };

  const rename = async () => {
    try {
      await api.patch(`/kits/${kit.id}`, { name });
      setRenaming(false);
      onChanged();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const remove = async () => {
    const msg = kit.used_by ? t('This kit is used by {n} project(s): they will need another kit. Delete anyway?', { n: kit.used_by }) : t('Delete kit "{name}"?', { name: kit.name });
    if (!window.confirm(msg)) return;
    try {
      await api.del(`/kits/${kit.id}`);
      onChanged();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <li>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <button type="button" onClick={toggle} className="text-slate-400 hover:text-slate-700" aria-label={t('Details')}>
            {open ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
          </button>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename()} autoFocus />
                <Button size="sm" variant="primary" onClick={rename}>
                  {t('Save')}
                </Button>
                <Button size="sm" onClick={() => setRenaming(false)}>
                  {t('Cancel')}
                </Button>
              </div>
            ) : (
              <>
                <p className="truncate font-medium text-slate-900">{kit.name}</p>
                <p className="text-xs text-slate-500">
                  {kit.template_count} {t('templates')} · {formatDate(kit.created_at)} · {t('used by {n} project(s)', { n: kit.used_by })}
                </p>
              </>
            )}
          </div>
          <Badge color="blue">{kit.format}</Badge>
          <IconButton icon={Pencil} label={t('Rename')} onClick={() => setRenaming(true)} />
          <IconButton icon={Trash2} label={t('Delete')} onClick={remove} className="hover:text-red-600" />
        </div>
        {open && (
          <div className="border-t border-slate-100 px-5 py-4">
            {!details ? (
              <Spinner />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {details.templates.map((tpl) => (
                  <li key={tpl.id} className="overflow-hidden rounded-lg border border-slate-200">
                    <div className="checker aspect-[3/2]">
                      {tpl.screenshot ? (
                        <img src={`/api/kits/${kit.id}/asset?path=${encodeURIComponent(tpl.screenshot)}`} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-slate-100">
                          <LayoutTemplate className="size-8 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-slate-800">{tpl.title}</p>
                      <p className="text-xs text-slate-500">
                        {tpl.type} · {tpl.fieldCount} {t('text fields')} · {tpl.slotCount} {t('images')}
                      </p>
                      <p className="mt-1 text-xs text-brand-700">{t('Suggested')}: {t(PAGE_ROLE_LABELS[tpl.suggestedRole])}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}
