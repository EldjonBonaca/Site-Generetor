import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, FolderKanban, Image, ImageDown, Layers, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, EmptyState, IconButton, Modal, PageHeader, Spinner } from '../components/ui.jsx';

export const formatDateTime = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const formatDate = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function ProjectsPage() {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/projects').then(setProjects).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy(true);
    try {
      const p = await api.post('/projects', {});
      navigate(`/projects/${p.id}/site`);
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };

  const duplicate = async (p) => {
    try {
      await api.post(`/projects/${p.id}/duplicate`);
      toast(t('Project duplicated'));
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const remove = async () => {
    try {
      await api.del(`/projects/${toDelete.id}`);
      toast(t('Project deleted'));
      setToDelete(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title={t('Projects')}
        description={t('Each project is one website: site data, services, images, template kit and generated content.')}
        actions={
          <Button variant="primary" icon={Plus} onClick={create} loading={busy}>
            {t('New project')}
          </Button>
        }
      />

      {!projects ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !projects.length ? (
        <EmptyState
          icon={FolderKanban}
          title={t('No projects yet')}
          description={t('Create your first project, upload an Elementor kit and let the AI write the content.')}
          action={
            <Button variant="primary" icon={Plus} onClick={create} loading={busy}>
              {t('New project')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-3">{t('Name')}</th>
                <th className="hidden px-5 py-3 md:table-cell">{t('Content')}</th>
                <th className="hidden px-5 py-3 sm:table-cell">{t('Created')}</th>
                <th className="px-5 py-3">{t('Status')}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5">
                    <Link to={`/projects/${p.id}/site`} className="font-medium text-slate-900 hover:text-brand-700">
                      {p.site_name || <span className="text-slate-400 italic">{t('Untitled project')}</span>}
                    </Link>
                    <p className="text-xs text-slate-500">{[p.industry, p.city].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="hidden px-5 py-3.5 text-slate-500 md:table-cell">
                    <span className="mr-4 inline-flex items-center gap-1">
                      <Layers className="size-3.5" /> {p.service_count} {t('services')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Image className="size-3.5" /> {p.image_count} {t('images')}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3.5 text-slate-500 sm:table-cell">{formatDate(p.created_at)}</td>
                  <td className="px-5 py-3.5">{p.status === 'generated' ? <Badge color="green">{t('Generated')}</Badge> : <Badge>{t('Draft')}</Badge>}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        icon={ImageDown}
                        label={p.image_count ? t('Download images ({n})', { n: p.image_count }) : t('No images uploaded')}
                        disabled={!p.image_count}
                        onClick={() => (window.location.href = `/api/projects/${p.id}/images/download`)}
                      />
                      <IconButton icon={Copy} label={t('Duplicate')} onClick={() => duplicate(p)} />
                      <IconButton icon={Trash2} label={t('Delete')} onClick={() => setToDelete(p)} className="hover:text-red-600" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={t('Delete project?')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>{t('Cancel')}</Button>
            <Button variant="danger" icon={Trash2} onClick={remove}>
              {t('Delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {t('"{name}" will be deleted with its services, images and generations. This cannot be undone.', { name: toDelete?.site_name || t('Untitled project') })}
        </p>
      </Modal>
    </>
  );
}
