import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderPlus, Info, LayoutTemplate, Package, Pencil, Sparkles, X } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, SaveStatus, Select, Spinner, Toggle, cx } from '../../components/ui.jsx';
import { KitCover, KitDetailsDialog, KitPageSections, KitRequirements, KitRoles, KitSwatches } from '../../components/KitParts.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';
import { TemplatePreview, TemplateSwatches } from '../../components/TemplatePreview.jsx';
import { TemplateEditor, TemplateGenerator, SECTION_LABELS, variantLabel } from '../../components/TemplateDialogs.jsx';

/**
 * Design of the site: a category + one of its saved templates (or a new one generated here), or an
 * uploaded Template Kit (its design and structure, with texts and images of the project).
 */
export default function TemplateStep({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const [mode, setMode] = useState(project.template_kit_id ? 'kit' : 'template');
  const [categories, setCategories] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [current, setCurrent] = useState(undefined); // the project template (null = none)
  const [changing, setChanging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCategory, setNewCategory] = useState('');

  const loadCurrent = useCallback(() => (project.template_id ? api.get(`/templates/${project.template_id}?project=${project.id}`).catch(() => null) : Promise.resolve(null)).then(setCurrent), [project.template_id]);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  useEffect(() => {
    api
      .get('/template-categories')
      .then((list) => {
        setCategories(list);
        setCategoryId((id) => id ?? (list.find((c) => c.template_count > 0) || list[0])?.id ?? null);
      })
      .catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the category of the current template
  useEffect(() => {
    if (current?.category_id) setCategoryId(current.category_id);
  }, [current?.category_id]);

  useEffect(() => {
    if (!categoryId) return setTemplates([]);
    setTemplates(null);
    api.get(`/templates?category=${categoryId}`).then(setTemplates).catch((e) => toast(e.message, 'error'));
  }, [categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const category = categories?.find((c) => c.id === categoryId) || null;

  const use = async (tpl) => {
    try {
      await api.put(`/projects/${project.id}/template`, { template_id: tpl.id });
      setChanging(false);
      await reload();
      toast(t('Template "{name}" selected', { name: tpl.name }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    try {
      const cat = await api.post('/template-categories', { name: newCategory });
      setCategories((list) => [...list, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(cat.id);
      setNewCategory('');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const onGenerated = async (tpl) => {
    setCategories((list) => list.map((c) => (c.id === tpl.category_id ? { ...c, template_count: c.template_count + 1 } : c)));
    setTemplates((list) => [tpl, ...(list || [])]);
    await use(tpl);
  };

  if (!categories || current === undefined) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const showPicker = !current || changing;

  return (
    <>
      <StepIssues project={project} step="template" t={t} />
      <div className="space-y-6">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label={t('Design of the site')}>
          {[
            ['template', LayoutTemplate, t('Category template')],
            ['kit', Package, t('Template Kit')],
          ].map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={cx('inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium', mode === key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50')}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === 'kit' && <KitChooser project={project} reload={reload} />}
        {mode === 'template' && project.template_kit_id && (
          <Alert kind="info">{t('This project uses a Template Kit. Choosing a category template replaces it.')}</Alert>
        )}

        {mode === 'template' && current && !changing && (
          <Card
            title={current.name}
            description={t('Category: {name}', { name: current.category_name })}
            actions={
              <>
                <Button size="sm" icon={Pencil} onClick={() => setEditing(current)}>
                  {t('Edit design')}
                </Button>
                <Button size="sm" icon={LayoutTemplate} onClick={() => setChanging(true)}>
                  {t('Change template')}
                </Button>
              </>
            }
          >
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <TemplatePreview spec={current.spec} />
              <div className="space-y-4 text-sm">
                <TemplateSwatches spec={current.spec} direction={current.direction_name && t(current.direction_name)} />
                {current.spec.description && <p className="text-slate-600">{current.spec.description}</p>}
                <dl className="space-y-1.5 text-xs">
                  {Object.keys(SECTION_LABELS).map((k) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-slate-500">{t(SECTION_LABELS[k])}</dt>
                      <dd className="text-right text-slate-700">{variantLabel(t, k, current.spec.layout[k])}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-slate-500">
                  {t('Tone of voice')}: {current.spec.tone}
                </p>
                <p className="text-xs text-slate-500">{t('The template is shared by every project that uses it: editing its design changes them all.')}</p>
              </div>
            </div>
          </Card>
        )}

        {mode === 'template' && showPicker && (
          <Card
            title={t('Choose a template')}
            description={t('Pick the category of the business, then one of its saved templates, or let the AI generate a new one.')}
            actions={
              current && (
                <Button size="sm" icon={X} onClick={() => setChanging(false)}>
                  {t('Cancel')}
                </Button>
              )
            }
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('Category')} className="min-w-56 flex-1">
                {(id) => (
                  <Select id={id} value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)} disabled={!categories.length}>
                    {!categories.length && <option value="">{t('No categories yet')}</option>}
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.template_count})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <form onSubmit={addCategory} className="flex min-w-56 flex-1 gap-2">
                <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={t('New category (e.g. Plumbers)')} aria-label={t('New category')} maxLength={80} />
                <Button type="submit" icon={FolderPlus} disabled={!newCategory.trim()}>
                  {t('Add')}
                </Button>
              </form>
              <Button variant="primary" icon={Sparkles} onClick={() => setGenerating(true)} disabled={!category}>
                {t('Generate template')}
              </Button>
            </div>

            <div className="mt-5">
              {!category ? (
                <EmptyState icon={LayoutTemplate} title={t('Create a category first')} description={t('For example "Plumbers", "Restaurants" or "Dentists". Templates are saved in their category and reused by every project.')} />
              ) : !templates ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : !templates.length ? (
                <EmptyState
                  icon={LayoutTemplate}
                  title={t('No templates in this category')}
                  description={t('Generate a template with the AI: you can preview it, regenerate it and save it.')}
                  action={
                    <Button variant="primary" icon={Sparkles} onClick={() => setGenerating(true)}>
                      {t('Generate template')}
                    </Button>
                  }
                />
              ) : (
                <ul className="grid gap-5 md:grid-cols-2">
                  {templates.map((tpl) => {
                    const selected = tpl.id === project.template_id;
                    return (
                      <li key={tpl.id} className={cx('overflow-hidden rounded-xl border', selected ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200')}>
                        <TemplatePreview spec={tpl.spec} compact className="rounded-none border-0 border-b" />
                        <div className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{tpl.name}</p>
                            <TemplateSwatches spec={tpl.spec} direction={tpl.direction_name && t(tpl.direction_name)} />
                          </div>
                          {selected ? (
                            <Badge color="blue">{t('Selected')}</Badge>
                          ) : (
                            <Button size="sm" variant="primary" onClick={() => use(tpl)}>
                              {t('Use')}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {t('Categories and templates are also managed in')}{' '}
              <Link to="/templates" className="font-medium text-brand-700 hover:underline">
                {t('Templates')}
              </Link>
              .
            </p>
          </Card>
        )}

        <SiteStructureCard project={project} reload={reload} />
      </div>

      <TemplateGenerator
        open={generating}
        onClose={() => setGenerating(false)}
        category={category}
        onSaved={onGenerated}
        onAnalyzed={() => api.get('/template-categories').then(setCategories).catch(() => {})}
      />
      <TemplateEditor
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          loadCurrent();
          reload();
        }}
      />
    </>
  );
}

/**
 * Template Kit of the site: the kit keeps its design and structure; the AI rewrites every text for the
 * business and the project images replace the demo photos (the structure of the kit never changes). Kits are uploaded in the Template Kit page.
 */
function KitChooser({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const [kits, setKits] = useState(null);
  const [changing, setChanging] = useState(false);
  const [details, setDetails] = useState(null);

  const load = () => api.get('/template-kits').then(setKits);
  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const use = async (kit) => {
    try {
      await api.put(`/projects/${project.id}/template-kit`, { kit_id: kit.id });
      setChanging(false);
      await reload();
      toast(t('Template Kit "{name}" selected', { name: kit.name }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!kits) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const current = kits.find((k) => k.id === project.template_kit_id) || null;

  return (
    <>
      {current && !changing && (
        <Card
          title={current.name}
          description={t('Template Kit')}
          actions={
            <>
              <Button size="sm" icon={Info} onClick={() => setDetails(current.id)}>
                {t('Kit details')}
              </Button>
              <Button size="sm" icon={Package} onClick={() => setChanging(true)}>
                {t('Change kit')}
              </Button>
            </>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <KitCover kit={current} className="rounded-lg border border-slate-200" />
            <div className="space-y-4 text-sm">
              {current.summary && <p className="text-slate-700">{current.summary}</p>}
              <KitSwatches styles={current.styles} />
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{t('Pages of the site')}</p>
                <KitRoles kit={current} />
              </div>
              <KitRequirements kit={current} />
              <p className="text-xs text-slate-500">
                {t('The site keeps the structure, sections, widgets, plugins and palette of the kit. The AI rewrites every text for the industry of the project ("{industry}"), and the images of the project replace the demo photos, cropped to the same proportions (the decorative graphics of the kit stay).', { industry: project.industry || t('set it in Site data') })}
              </p>
            </div>
          </div>
        </Card>
      )}
      {/* Remount when the kit changes (roles of its templates, analysis) */}
      {current && !changing && <KitPageSections key={current.updated_at} project={project} kitId={current.id} />}

      {(!current || changing) && (
        <Card
          title={t('Choose a Template Kit')}
          description={t('The site reuses the design and structure of the kit, with texts written by the AI for this business and the images of the project.')}
          actions={
            <>
              {current && (
                <Button size="sm" icon={X} onClick={() => setChanging(false)}>
                  {t('Cancel')}
                </Button>
              )}
              <Link to="/template-kits" className="text-sm font-medium text-brand-700 hover:underline">
                {t('Upload a Template Kit')}
              </Link>
            </>
          }
        >
          {!kits.length ? (
            <EmptyState
              icon={Package}
              title={t('No Template Kits yet')}
              description={t('Upload the zip of an Elementor Template Kit in the Template Kit page: the AI analyzes it, then you can choose it here.')}
              action={
                <Link to="/template-kits" className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
                  {t('Upload a Template Kit')}
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-5 md:grid-cols-2">
              {kits.map((kit) => {
                const selected = kit.id === project.template_kit_id;
                return (
                  <li key={kit.id} className={cx('overflow-hidden rounded-xl border', selected ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200')}>
                    <KitCover kit={kit} className="border-b border-slate-100" />
                    <div className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{kit.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {t('{n} templates', { n: kit.page_count })}
                          {kit.industry ? ` · ${t('demo: {industry}', { industry: kit.industry })}` : ''}
                          {!kit.analyzed ? ` · ${t('Not analyzed')}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="ghost" icon={Info} onClick={() => setDetails(kit.id)} aria-label={t('Details of {name}', { name: kit.name })} />
                        {selected ? (
                          <Badge color="blue">{t('Selected')}</Badge>
                        ) : (
                          <Button size="sm" variant="primary" onClick={() => use(kit)}>
                            {t('Use')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <KitDetailsDialog
        kitId={details}
        onClose={() => setDetails(null)}
        onChanged={() => {
          load().catch(() => {});
          reload();
        }}
      />
    </>
  );
}

/** Contact form plugin, menu and map (services are always published as articles). */
function SiteStructureCard({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const s = project.settings;
  const [menuName, setMenuName] = useState(s.menuName);
  const save = async (patch) => {
    try {
      await api.patch(`/projects/${project.id}`, { settings: patch });
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const { schedule, status } = useAutosave((patch) => save(patch));

  return (
    <Card title={t('Site structure')} description={t('Contact form, navigation menu and map.')} actions={<SaveStatus status={status} t={t} />}>
      <p className="text-sm text-slate-600">
        {t('The site has 5 pages (Home, About, Services, Gallery, Contact), a header, a 4-column footer and the single post template. Services are published as WordPress articles, one per service, in the services category.')}
      </p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-700">{t('Contact form')}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t('Contact Form 7: the WordPress plugin installs it, creates the form (name, email, phone, message, privacy consent) and puts it on the contact page.')}
          </p>
        </div>
        <Field label={t('Menu name')} hint={t('Created by the WordPress plugin (or wordpress-import.xml). The header and footer already link to the pages.')}>
          {(id) => (
            <Input
              id={id}
              value={menuName}
              placeholder={project.language === 'it' ? 'Menu principale' : 'Main menu'}
              onChange={(e) => {
                setMenuName(e.target.value);
                schedule({ menuName: e.target.value });
              }}
            />
          )}
        </Field>
      </div>
      {/* A Template Kit keeps its own contact page: its map (if any) shows the site address */}
      {!project.template_kit_id && (
        <div className="mt-5">
          <Toggle checked={s.mapEmbed} onChange={(v) => save({ mapEmbed: v })} label={t('Google Maps on the contact page')} description={t('A map (iframe) with your address is added below the contact form.')} />
        </div>
      )}
    </Card>
  );
}
