/**
 * Project wizard: 7 steps with completeness indicators from the server readiness check.
 * Each step gets { project, setProject, reload } through the outlet props.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleAlert } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, Spinner, cx } from '../components/ui.jsx';
import SiteDataStep from './steps/SiteDataStep.jsx';
import ServicesStep from './steps/ServicesStep.jsx';
import ImagesStep from './steps/ImagesStep.jsx';
import KitStep from './steps/KitStep.jsx';
import AiStep from './steps/AiStep.jsx';
import GenerateStep from './steps/GenerateStep.jsx';
import DownloadStep from './steps/DownloadStep.jsx';

export const STEPS = [
  { path: 'site', key: 'site', label: 'Site data', Component: SiteDataStep },
  { path: 'services', key: 'services', label: 'Services', Component: ServicesStep },
  { path: 'images', key: 'images', label: 'Images', Component: ImagesStep },
  { path: 'kit', key: 'kit', label: 'Layout', Component: KitStep },
  { path: 'ai', key: 'ai', label: 'AI', Component: AiStep },
  { path: 'generate', key: 'generate', label: 'Generate & Preview', Component: GenerateStep },
  { path: 'download', key: 'download', label: 'Download', Component: DownloadStep },
];

export default function ProjectWizard() {
  const { id } = useParams();
  const base = `/projects/${id}`;
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState(null);

  const reload = useCallback(() => api.get(`/projects/${id}`).then(setProject), [id]);

  useEffect(() => {
    reload().catch((e) => {
      toast(e.message, 'error');
      navigate('/projects');
    });
  }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh readiness when changing step (other steps may have changed data)
  useEffect(() => {
    if (project) reload().catch(() => {});
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const items = project.readiness?.items || [];
  const stepState = (key) => {
    const mine = items.filter((i) => i.step === key);
    if (mine.some((i) => i.level === 'error')) return 'error';
    if (mine.length) return 'warning';
    return 'ok';
  };
  const currentIndex = Math.max(0, STEPS.findIndex((s) => location.pathname.endsWith(`/${s.path}`)));
  const prev = STEPS[currentIndex - 1];
  const next = STEPS[currentIndex + 1];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" /> {t('Back to projects')}
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">{project.site_name || t('Untitled project')}</h1>
        </div>
        {project.status === 'generated' ? <Badge color="green">{t('Generated')}</Badge> : <Badge>{t('Draft')}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav aria-label={t('Steps')} className="lg:sticky lg:top-20 lg:self-start">
          <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {STEPS.map((s, i) => {
              const st = s.key === 'generate' ? (project.status === 'generated' ? 'ok' : 'none') : stepState(s.key);
              return (
                <li key={s.path} className="shrink-0">
                  <NavLink
                    to={`${base}/${s.path}`}
                    className={({ isActive }) =>
                      cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap', isActive ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70')
                    }
                  >
                    <span
                      className={cx(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        st === 'ok' && 'bg-emerald-100 text-emerald-700',
                        st === 'warning' && 'bg-amber-100 text-amber-700',
                        st === 'error' && 'bg-red-100 text-red-700',
                        st === 'none' && 'bg-slate-200 text-slate-600'
                      )}
                    >
                      {st === 'ok' ? <Check className="size-3.5" /> : st === 'error' ? <CircleAlert className="size-3.5" /> : st === 'warning' ? <AlertTriangle className="size-3.5" /> : i + 1}
                    </span>
                    {t(s.label)}
                  </NavLink>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 hidden rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 lg:block">
            {project.readiness?.ready ? (
              <p className="flex items-center gap-1.5 text-emerald-700">
                <Check className="size-3.5" /> {t('Ready to generate')}
              </p>
            ) : (
              <p>{t('{n} blocking issue(s) before generation', { n: items.filter((i) => i.level === 'error').length })}</p>
            )}
            {items.some((i) => i.level === 'warning') && <p className="mt-1">{t('{n} warning(s)', { n: items.filter((i) => i.level === 'warning').length })}</p>}
          </div>
        </nav>

        <div className="min-w-0">
          <Routes>
            {STEPS.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component project={project} setProject={setProject} reload={reload} />} />
            ))}
            <Route path="*" element={<Navigate to={`${base}/site`} replace />} />
          </Routes>

          <div className="mt-8 flex justify-between border-t border-slate-200 pt-5">
            {prev ? (
              <Button icon={ArrowLeft} onClick={() => navigate(`${base}/${prev.path}`)}>
                {t(prev.label)}
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button variant="primary" onClick={() => navigate(`${base}/${next.path}`)}>
                {t(next.label)} <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
