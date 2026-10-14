import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderPlus, LayoutTemplate, Pencil, Sparkles, X } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { Badge, Button, Card, EmptyState, Field, Input, SaveStatus, Select, Spinner, Toggle, cx } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';
import { TemplatePreview, TemplateSwatches } from '../../components/TemplatePreview.jsx';
import { TemplateEditor, TemplateGenerator, SECTION_LABELS, variantLabel } from '../../components/TemplateDialogs.jsx';

/** Template of the site: a category + one of its saved templates (or a new one generated here). */
export default function TemplateStep({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const [categories, setCategories] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [current, setCurrent] = useState(undefined); // the project template (null = none)
  const [changing, setChanging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCategory, setNewCategory] = useState('');

  const loadCurrent = useCallback(() => (project.template_id ? api.get(`/templates/${project.template_id}`).catch(() => null) : Promise.resolve(null)).then(setCurrent), [project.template_id]);

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
        {current && !changing && (
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

        {showPicker && (
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
        <Field label={t('Contact form plugin')} hint={t('The WordPress plugin installs it, creates the form (name, email, phone, message, privacy consent) and puts it on the contact page. MetForm is the one required by the prompt.')}>
          {(id) => (
            <Select id={id} value={s.contactForm} onChange={(e) => save({ contactForm: e.target.value })}>
              <option value="metform">MetForm</option>
              <option value="cf7">Contact Form 7</option>
            </Select>
          )}
        </Field>
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
      <div className="mt-5">
        <Toggle checked={s.mapEmbed} onChange={(v) => save({ mapEmbed: v })} label={t('Google Maps on the contact page')} description={t('A map (iframe) with your address is added below the contact form.')} />
      </div>
    </Card>
  );
}
