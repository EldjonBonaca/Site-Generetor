/**
 * Template Kits (backend/src/routes/kits.js): cover, colors and the details dialog (AI analysis,
 * role of each template, sections, plugins), shared by the Template Kit page and the Template step.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Package, Pencil, RotateCcw, ScanSearch } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Alert, Badge, Button, Input, Modal, Select, Spinner, cx } from './ui.jsx';

/** Role of a kit template in the site (labels are translated with t()). */
export const KIT_ROLE_LABELS = {
  home: 'Home',
  about: 'About Us',
  services: 'Services',
  gallery: 'Gallery',
  contact: 'Contact',
  single_post: 'Single post',
  header: 'Header',
  footer: 'Footer',
  ignore: 'Not used',
};

export const kitScreenshotUrl = (kit, path) => `/api/template-kits/${kit.id}/screenshot?path=${encodeURIComponent(path)}`;

/** Screenshot of the kit home page, or its colors when the kit has no screenshot. */
export function KitCover({ kit, className }) {
  const colors = kit.styles?.colors?.map((c) => c.color) || [];
  if (kit.cover) return <img src={kitScreenshotUrl(kit, kit.cover)} alt="" loading="lazy" className={cx('aspect-[16/10] w-full bg-slate-100 object-cover object-top', className)} />;
  return (
    <div
      className={cx('flex aspect-[16/10] w-full items-center justify-center', className)}
      style={{ background: colors.length >= 2 ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` : colors[0] || '#e2e8f0' }}
    >
      <Package className="size-10 text-white/80 drop-shadow" />
    </div>
  );
}

export function KitSwatches({ styles }) {
  if (!styles?.colors?.length && !styles?.fonts?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex -space-x-1">
        {styles.colors.slice(0, 8).map((c, i) => (
          <span key={i} title={`${c.title} ${c.color}`} className="size-5 rounded-full border-2 border-white shadow-sm" style={{ background: c.color }} />
        ))}
      </div>
      {styles.fonts?.length > 0 && <span className="text-xs text-slate-500">{styles.fonts.join(' · ')}</span>}
    </div>
  );
}

/** Pages of the site and the kit template each one comes from. */
export function KitRoles({ kit }) {
  const { t } = useT();
  return (
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {Object.entries(kit.roles).map(([role, title]) => (
        <div key={role} className="flex justify-between gap-3">
          <dt className="text-slate-500">{t(KIT_ROLE_LABELS[role])}</dt>
          <dd className={cx('truncate text-right', title ? 'text-slate-800' : 'italic text-slate-400')}>{title || (['header', 'footer', 'single_post'].includes(role) ? t('built with the kit colors') : t('composed from the kit sections'))}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What the kit needs on the WordPress site: its plugins and the Elementor Pro widgets it uses. */
export function KitRequirements({ kit }) {
  const { t } = useT();
  const plugins = kit.required_plugins.filter((p) => p.slug !== 'elementor');
  return (
    <div className="space-y-2">
      {plugins.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">{t('Plugins of the kit')}:</span>
          {plugins.map((p) => (
            <Badge key={p.slug} color={p.pro ? 'yellow' : 'gray'}>
              {p.name}
              {p.pro ? ` (${t('paid')})` : ''}
            </Badge>
          ))}
        </div>
      )}
      {kit.pro_widgets.length > 0 && (
        <Alert kind="warning">
          {t('This kit uses Elementor Pro widgets ({widgets}): without Elementor Pro on the WordPress site those parts are not shown. Forms are replaced by Contact Form 7 and, without Pro, the menu by the Ultimate Addons menu.', {
            widgets: kit.pro_widgets.join(', '),
          })}
        </Alert>
      )}
    </div>
  );
}

/**
 * Details of a kit: AI analysis, colors, plugins and every template with its role (editable) and its
 * sections. "Analyze again" asks the AI for a new analysis (the roles chosen by hand are reset).
 */
export function KitDetailsDialog({ kitId, onClose, onChanged }) {
  const { t } = useT();
  const toast = useToast();
  const [kit, setKit] = useState(null);
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [name, setName] = useState(null); // editing the name

  useEffect(() => {
    if (!kitId) return;
    setKit(null);
    setName(null);
    Promise.all([api.get(`/template-kits/${kitId}`), api.get('/providers')])
      .then(([k, pv]) => {
        setKit(k);
        setProviders(pv);
        setProviderId((id) => id || String(pv[0]?.id ?? ''));
      })
      .catch((e) => toast(e.message, 'error'));
  }, [kitId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (k) => {
    setKit(k);
    onChanged?.(k);
  };

  const setRole = async (templateId, role) => {
    try {
      changed(await api.patch(`/template-kits/${kitId}`, { roles: { [templateId]: role } }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const rename = async (e) => {
    e.preventDefault();
    try {
      changed(await api.patch(`/template-kits/${kitId}`, { name }));
      setName(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      changed(await api.post(`/template-kits/${kitId}/analyze`, { providerId: Number(providerId) }));
      toast(t('Template Kit analyzed'));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Modal open={Boolean(kitId)} onClose={onClose} size="xl" title={kit ? kit.name : t('Template Kit')} footer={<Button onClick={onClose}>{t('Close')}</Button>}>
      {!kit ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-[240px_1fr]">
            <KitCover kit={kit} className="rounded-lg border border-slate-200" />
            <div className="space-y-3 text-sm">
              {name === null ? (
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900">{kit.name}</p>
                  <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setName(kit.name)} title={t('Rename')} aria-label={t('Rename')}>
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              ) : (
                <form onSubmit={rename} className="flex gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-label={t('Name')} autoFocus />
                  <Button type="submit" size="sm" icon={Check} disabled={!name.trim()}>
                    {t('Save')}
                  </Button>
                </form>
              )}
              {kit.analyzed ? (
                <>
                  {kit.summary && <p className="text-slate-700">{kit.summary}</p>}
                  {kit.style && (
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-700">{t('Style')}:</span> {kit.style}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    {t('Demo made for: {industry}', { industry: kit.industry || '—' })} · {t('Analyzed by {by}', { by: kit.analyzed_by })}
                  </p>
                </>
              ) : (
                <Alert kind="warning">{t('Not analyzed by the AI yet: roles and sections were guessed from the titles and the widgets. Analyze it for better results.')}</Alert>
              )}
              <KitSwatches styles={kit.styles} />
              <KitRequirements kit={kit} />
              <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                <Select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-auto min-w-48" aria-label={t('AI provider')} disabled={!providers.length}>
                  {!providers.length && <option value="">{t('No AI provider')}</option>}
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.model}
                    </option>
                  ))}
                </Select>
                <Button icon={ScanSearch} onClick={analyze} loading={analyzing} disabled={!providerId}>
                  {kit.analyzed ? t('Analyze again') : t('Analyze with AI')}
                </Button>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900">{t('Templates of the kit')}</h4>
            <p className="mt-0.5 text-xs text-slate-500">
              {t('Each page of the site uses one template of the kit. Pages without a template are composed from the sections of the kit; header, footer and single post without a template are built with the kit colors.')}
            </p>
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {kit.templates.map((tpl) => (
                <li key={tpl.id} className={cx('flex flex-col gap-3 p-3 sm:flex-row', !tpl.valid && 'opacity-60')}>
                  {tpl.screenshot ? (
                    <img src={kitScreenshotUrl(kit, tpl.screenshot)} alt="" loading="lazy" className="h-20 w-32 shrink-0 rounded border border-slate-200 bg-slate-50 object-cover object-top" />
                  ) : (
                    <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded border border-dashed border-slate-200 text-slate-300">
                      <Package className="size-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{tpl.title}</p>
                      <span className="text-xs text-slate-400">{tpl.type}</span>
                      {!tpl.valid && <Badge color="red">{t('Unreadable')}</Badge>}
                    </div>
                    {tpl.purpose && <p className="text-xs text-slate-600">{tpl.purpose}</p>}
                    {tpl.sections.length > 0 && (
                      <ol className="flex flex-wrap gap-1">
                        {tpl.sections.map((s, i) => (
                          <li key={i} title={s.description || undefined} className={cx('rounded px-1.5 py-0.5 text-[11px]', s.type === 'clients' ? 'bg-red-50 text-red-700 line-through' : 'bg-slate-100 text-slate-700')}>
                            {i + 1}. {t(s.label)}
                          </li>
                        ))}
                      </ol>
                    )}
                    <p className="text-[11px] text-slate-400">
                      {t('{fields} texts · {images} images', { fields: tpl.fields, images: tpl.images })}
                      {tpl.pro_widgets.length > 0 && <span className="ml-2 inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="size-3" /> Pro: {tpl.pro_widgets.join(', ')}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1 sm:w-48">
                    <Select value={tpl.role} onChange={(e) => setRole(tpl.id, e.target.value)} disabled={!tpl.valid} aria-label={t('Role of {name}', { name: tpl.title })}>
                      {Object.entries(KIT_ROLE_LABELS).map(([role, label]) => (
                        <option key={role} value={role}>
                          {t(label)}
                        </option>
                      ))}
                    </Select>
                    {tpl.changed && (
                      <button type="button" className="mt-2 text-slate-400 hover:text-slate-700" onClick={() => setRole(tpl.id, null)} title={t('Back to the role suggested by the analysis')} aria-label={t('Back to the role suggested by the analysis')}>
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">{t('Client logo strips (struck through) are removed from the site: they show other companies.')}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
