/**
 * Template Kit: upload Elementor Template Kits (zip). The AI analyzes each kit (structure, layout,
 * sections, design) and every project can then use it in its Template step: the site keeps the
 * design and structure of the kit, every text is rewritten by the AI for the business and every
 * image is replaced by the project images.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, ImageUp, Info, Package, ScanSearch, Trash2, Type } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { Alert, Badge, Button, Card, Dropzone, EmptyState, Field, Modal, PageHeader, Select, Spinner } from '../components/ui.jsx';
import { KitCover, KitDetailsDialog, KitSwatches } from '../components/KitParts.jsx';
import { formatDate } from './ProjectsPage.jsx';

export default function TemplateKitsPage() {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [kits, setKits] = useState(null);
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(null); // kit id of the details dialog
  const [toDelete, setToDelete] = useState(null);

  const load = () => api.get('/template-kits').then(setKits);

  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'));
    api
      .get('/providers')
      .then((list) => {
        setProviders(list);
        setProviderId(String(list[0]?.id ?? ''));
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async ([file]) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    if (providerId) form.append('providerId', providerId);
    setUploading(true);
    try {
      const kit = await api.upload('/template-kits', form);
      await load();
      if (kit.analysis_error) toast(t('Kit uploaded, but the AI analysis failed: {error}', { error: kit.analysis_error }), 'error');
      else toast(kit.analyzed ? t('Template Kit "{name}" uploaded and analyzed', { name: kit.name }) : t('Template Kit "{name}" uploaded', { name: kit.name }));
      setOpen(kit.id);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/template-kits/${toDelete.id}`);
      setToDelete(null);
      await load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  /** A new project that uses the kit: it opens on its first step (site data). */
  const newProject = async (kit) => {
    try {
      const p = await api.post('/projects', {});
      await api.put(`/projects/${p.id}/template-kit`, { kit_id: kit.id });
      navigate(`/projects/${p.id}/site`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const onChanged = (kit) => setKits((list) => list?.map((k) => (k.id === kit.id ? { ...k, ...kit } : k)));

  return (
    <>
      <PageHeader title={t('Template Kit')} description={t('Upload an Elementor Template Kit: the AI analyzes its structure and design, and your sites reuse it with their own texts and images.')} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title={t('Upload a Template Kit')} description={t('The .zip of an Elementor Template Kit (e.g. from Envato Elements) or of an Elementor kit export.')}>
          <div className="space-y-4">
            <Field label={t('Analyze with')} hint={providers.length ? t('The AI reads every template of the kit: its sections, layout and design.') : t('Add an AI provider in AI Providers to analyze the kit with the AI. Without it, the kit is analyzed from its titles and widgets only.')}>
              {(id) => (
                <Select id={id} value={providerId} onChange={(e) => setProviderId(e.target.value)} disabled={uploading}>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.model}
                    </option>
                  ))}
                  <option value="">{t('No AI analysis (titles and widgets only)')}</option>
                </Select>
              )}
            </Field>
            <Dropzone
              accept=".zip,application/zip"
              onFiles={upload}
              busy={uploading}
              disabled={uploading}
              title={uploading ? t('Uploading and analyzing the kit… this can take a minute.') : t('Drop the Template Kit .zip here, or click to choose it')}
              hint={t('Up to 150 MB')}
            />
          </div>
        </Card>

        <Card title={t('How it works')}>
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <ScanSearch className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span>{t('The AI analyzes the kit: the role of each template (Home, About, Services…), the sections of every page and the design.')}</span>
            </li>
            <li className="flex gap-3">
              <Package className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span>{t('In a project, choose the kit in the Template step: the site keeps the layout, sections and styles of the kit.')}</span>
            </li>
            <li className="flex gap-3">
              <Type className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span>{t('Every text is rewritten by the AI for the business and its category: no demo text, name, price or contact is left.')}</span>
            </li>
            <li className="flex gap-3">
              <ImageUp className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span>{t('Every image of the demo is replaced by the images of the project (hero, banners, services, photos); photos of demo people and client logos are removed.')}</span>
            </li>
          </ol>
        </Card>
      </div>

      <div className="mt-8">
        {!kits ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !kits.length ? (
          <EmptyState icon={Package} title={t('No Template Kits yet')} description={t('Upload the zip of an Elementor Template Kit to reuse its design in your sites.')} />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {kits.map((kit) => (
              <li key={kit.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button type="button" onClick={() => setOpen(kit.id)} className="block border-b border-slate-100 text-left" aria-label={t('Details of {name}', { name: kit.name })}>
                  <KitCover kit={kit} />
                </button>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">{kit.name}</p>
                    {kit.analyzed ? <Badge color="green">{t('Analyzed')}</Badge> : <Badge color="yellow">{t('Not analyzed')}</Badge>}
                  </div>
                  {kit.summary && <p className="line-clamp-3 text-sm text-slate-600">{kit.summary}</p>}
                  <KitSwatches styles={kit.styles} />
                  <p className="text-xs text-slate-500">
                    {t('{n} templates', { n: kit.page_count })}
                    {kit.industry ? ` · ${t('demo: {industry}', { industry: kit.industry })}` : ''} · {t('used by {n} project(s)', { n: kit.used_by })} · {formatDate(kit.created_at)}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button size="sm" icon={Info} onClick={() => setOpen(kit.id)}>
                      {t('Details')}
                    </Button>
                    <Button size="sm" variant="primary" icon={FolderPlus} onClick={() => newProject(kit)}>
                      {t('New project')}
                    </Button>
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setToDelete(kit)} className="ml-auto">
                      {t('Delete')}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <KitDetailsDialog kitId={open} onClose={() => setOpen(null)} onChanged={onChanged} />

      <Modal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        size="sm"
        title={t('Delete Template Kit')}
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>{t('Cancel')}</Button>
            <Button variant="danger" icon={Trash2} onClick={remove}>
              {t('Delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{t('Delete "{name}"? The uploaded files are removed.', { name: toDelete?.name })}</p>
        {toDelete?.used_by > 0 && (
          <Alert kind="warning" className="mt-3">
            {t('{n} project(s) use this kit: they will have to choose another template or kit.', { n: toDelete.used_by })}
          </Alert>
        )}
      </Modal>
    </>
  );
}
