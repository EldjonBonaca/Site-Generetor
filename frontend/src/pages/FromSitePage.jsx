/**
 * Template from a website: the client sends the link of a site they like. The server reads it
 * (colors, fonts, corners, menu, sections in order), the AI designs a template of the generator
 * that looks like it, with new sample texts; once saved in a category it is used by a project
 * like any other template (Template step) and exported as the WordPress plugin.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Copy, Globe, Package, RefreshCw, Save, ScanSearch, Wand2 } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle } from '../components/ui.jsx';
import { TemplatePreview, TemplateSwatches } from '../components/TemplatePreview.jsx';
import { HOME_SECTION_LABELS, LANGUAGE_OPTIONS } from '../components/TemplateDialogs.jsx';
import { KIT_ROLE_LABELS } from '../components/KitParts.jsx';

const NEW_CATEGORY = 'new';

/** exact: the structure of the website copied 1:1 as a Template Kit; similar: a template of the generator that looks like it. */
const MODES = ['exact', 'similar'];

export default function FromSitePage() {
  const { t } = useT();
  const toast = useToast();
  const [providers, setProviders] = useState(null);
  const [providerId, setProviderId] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [url, setUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [language, setLanguage] = useState('it');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [saved, setSaved] = useState(null);
  const [mode, setMode] = useState('exact');
  const [kit, setKit] = useState(null);

  useEffect(() => {
    api
      .get('/providers')
      .then((list) => {
        setProviders(list);
        setProviderId(String(list[0]?.id ?? ''));
      })
      .catch((e) => toast(e.message, 'error'));
    api
      .get('/template-categories')
      .then((list) => {
        setCategories(list);
        setCategoryId(list.length ? String(list[0].id) : NEW_CATEGORY);
      })
      .catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** The chosen category, created first when it is a new one. */
  const category = async () => {
    if (categoryId !== NEW_CATEGORY) return categories.find((c) => c.id === Number(categoryId));
    const cat = await api.post('/template-categories', { name: newCategory });
    setCategories((list) => [...list, cat]);
    setCategoryId(String(cat.id));
    return cat;
  };

  const analyze = async () => {
    setBusy(true);
    setSaved(null);
    try {
      const cat = await category();
      const res = await api.post(`/template-categories/${cat.id}/templates/from-site`, { providerId: Number(providerId), url, language, instructions });
      setDraft({ ...res, category: cat });
      const host = (() => {
        try {
          return new URL(res.reference.url).hostname.replace(/^www\./, '');
        } catch {
          return url;
        }
      })();
      setName(`${cat.name} – ${t('like {site}', { site: host })}`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const tpl = await api.post(`/template-categories/${draft.category.id}/templates`, {
        name,
        spec: draft.spec,
        shared,
        instructions: [`${t('Reference website')}: ${draft.reference.url}`, instructions].filter(Boolean).join('\n'),
        language,
        generated_by: draft.generated_by,
        tokens_used: draft.tokens,
      });
      setSaved(tpl);
      toast(t('Template "{name}" saved', { name: tpl.name }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Exact mode: the website becomes a Template Kit (same pages, sections, widgets and CSS). */
  const copyExact = async () => {
    setBusy(true);
    setKit(null);
    try {
      const res = await api.post('/template-kits/from-site', { url, providerId: providerId ? Number(providerId) : undefined });
      setKit(res);
      if (res.analysis_error) toast(res.analysis_error, 'error');
      else toast(t('Template Kit "{name}" created', { name: res.name }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const ready = providerId && url.trim() && (categoryId !== NEW_CATEGORY || newCategory.trim());
  const ref = draft?.reference;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('From a website')}
        description={t('The client sends the link of a site they like: copy its structure exactly, or have a template designed that looks like it. The site is then generated with the texts and images of the client and exported as the WordPress plugin, like the others.')}
      />
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        {MODES.map((m) => {
          const Icon = m === 'exact' ? Copy : Wand2;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={busy}
              className={`rounded-xl border p-4 text-left transition ${mode === m ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Icon className="size-4" />
                {m === 'exact' ? t('Identical structure') : t('Similar')}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {m === 'exact'
                  ? t('Every page, section, column and widget of the website, with its CSS, colors and fonts: becomes a Template Kit. Only for websites built with Elementor.')
                  : t('A template of the generator with the colors, fonts and sections of the website, for any website.')}
              </p>
            </button>
          );
        })}
      </div>
      {!providers ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !providers.length ? (
        <EmptyState
          icon={Bot}
          title={t('No AI provider connected')}
          description={t('Add Claude, ChatGPT, Gemini or any OpenAI-compatible service with your API key.')}
          action={
            <Link to="/settings/providers">
              <Button variant="primary">{t('Connect a provider')}</Button>
            </Link>
          }
        />
      ) : mode === 'exact' ? (
        <div className="max-w-2xl space-y-4">
          <Card>
            <div className="space-y-4">
              <Field label={t('Address of the website')} hint={t('E.g. www.example.com: the home page and the pages of its menu are copied (at most 8).')} required>
                {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" maxLength={500} disabled={busy} />}
              </Field>
              <Field label={t('AI provider')} hint={t('Analyzes the pages of the kit (role of each page and of its sections).')}>
                {(id) => (
                  <Select id={id} value={providerId} onChange={(e) => setProviderId(e.target.value)} disabled={busy}>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.model}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Alert kind="info">{t('Only the structure and the design are copied: the texts are written by the AI for the client and the photos are the ones of the project.')}</Alert>
              <div className="flex justify-end">
                <Button variant="primary" icon={Copy} onClick={copyExact} loading={busy} disabled={!url.trim() || busy}>
                  {busy ? t('Copying the website…') : t('Copy the structure')}
                </Button>
              </div>
              {busy && <p className="text-right text-xs text-slate-500">{t('The server reads every page and its CSS, then the AI analyzes the kit: this can take up to two minutes.')}</p>}
            </div>
          </Card>
          {kit && (
            <Card title={kit.name}>
              <div className="space-y-3 text-sm text-slate-700">
                <p>
                  {t('{n} pages copied', { n: kit.from_site.pages })} · {kit.from_site.header ? t('header copied') : t('header of the theme: not copied (the site gets the header of the generator)')} ·{' '}
                  {kit.from_site.footer ? t('footer copied') : t('footer of the theme: not copied')}
                </p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {Object.entries(kit.roles)
                    .filter(([, title]) => title)
                    .map(([role, title]) => (
                      <li key={role}>
                        <span className="font-medium">{t(KIT_ROLE_LABELS[role] || role)}</span>: {title}
                      </li>
                    ))}
                </ul>
                {kit.from_site.notes.length > 0 && (
                  <Alert kind="warning">
                    {t('Some elements are kept exactly as on the website (HTML), because their settings cannot be read from the page: {list}. They look the same; check their texts and links in Elementor.', { list: kit.from_site.notes.join(', ') })}
                  </Alert>
                )}
                {kit.pro_widgets.length > 0 && <Alert kind="warning">{t('This website uses Elementor Pro widgets: {list}.', { list: kit.pro_widgets.join(', ') })}</Alert>}
                <Alert kind="success" title={t('Template Kit created')}>
                  {t('Check the role of each page in Template Kit, then open a project and choose this kit in its Template step: the texts are written by the AI, the photos are the ones of the project and the WordPress plugin is generated as usual.')}{' '}
                  <Link to="/template-kits" className="inline-flex items-center gap-1 font-medium underline">
                    <Package className="size-3.5" />
                    {t('Open Template Kit')}
                  </Link>
                </Alert>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <div className={draft ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]' : 'max-w-2xl'}>
          {draft && (
            <div className="order-2 min-w-0 lg:order-1">
              <TemplatePreview spec={draft.spec} />
            </div>
          )}
          <div className="order-1 space-y-4 lg:order-2">
            <Card>
              <div className="space-y-4">
                <Field label={t('Address of the website')} hint={t('E.g. www.example.com: the home page is analyzed.')} required>
                  {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" maxLength={500} disabled={busy} />}
                </Field>
                <Field label={t('Category of the business')} hint={t('The template is saved in this category; its sample texts are written for it.')}>
                  {(id) => (
                    <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy}>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value={NEW_CATEGORY}>{t('+ New category')}</option>
                    </Select>
                  )}
                </Field>
                {categoryId === NEW_CATEGORY && (
                  <Field label={t('Name of the new category')}>{(id) => <Input id={id} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={t('E.g. Plumbers')} maxLength={80} disabled={busy} />}</Field>
                )}
                <Field label={t('AI provider')}>
                  {(id) => (
                    <Select id={id} value={providerId} onChange={(e) => setProviderId(e.target.value)} disabled={busy}>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.model}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t('Instructions (optional)')} hint={t('E.g. "the same but with green as the main color" or "without the FAQ".')}>
                  {(id) => <Textarea id={id} rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} disabled={busy} />}
                </Field>
                <Field label={t('Language of the sample texts')}>
                  {(id) => (
                    <Select id={id} value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
                      {Object.entries(LANGUAGE_OPTIONS).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="flex justify-end">
                  <Button variant="primary" icon={draft ? RefreshCw : ScanSearch} onClick={analyze} loading={busy && !draft?.spec} disabled={!ready || busy}>
                    {busy ? t('Analyzing the website…') : draft ? t('Analyze again') : t('Analyze and create the template')}
                  </Button>
                </div>
                {busy && <p className="text-right text-xs text-slate-500">{t('The server reads the website, then the AI designs the template: this can take up to a minute.')}</p>}
              </div>
            </Card>

            {ref && (
              <Card title={t('What was found on the website')}>
                <div className="space-y-2 text-xs text-slate-600">
                  <p className="flex items-center gap-1.5 font-medium text-slate-800">
                    <Globe className="size-3.5" />
                    {ref.title || ref.url}
                  </p>
                  {(Object.keys(ref.colors.globals).length > 0 || ref.colors.top.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {(Object.keys(ref.colors.globals).length ? Object.values(ref.colors.globals) : ref.colors.top.filter((c) => !c.neutral).map((c) => c.color))
                        .slice(0, 8)
                        .map((c) => (
                          <span key={c} className="size-5 rounded border border-slate-200" style={{ background: c }} title={c} />
                        ))}
                      {Object.keys(ref.colors.globals).length > 0 && <span className="ml-1">{t('Elementor global colors: kept exactly')}</span>}
                    </div>
                  )}
                  {ref.fonts.length > 0 && (
                    <p>
                      <span className="font-medium">{t('Fonts')}:</span> {ref.fonts.join(', ')}
                    </p>
                  )}
                  {ref.menu.length > 0 && (
                    <p>
                      <span className="font-medium">{t('Menu')}:</span> {ref.menu.join(' · ')}
                    </p>
                  )}
                  {ref.outline.length < 4 && <Alert kind="warning">{t('Little could be read on this website (it is probably built by scripts): the template follows mostly its colors and fonts.')}</Alert>}
                </div>
              </Card>
            )}

            {draft && (
              <Card title={t('Template')}>
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    <span className="font-medium">{t('Home sections')}:</span> {draft.spec.sections.map((s) => t(HOME_SECTION_LABELS[s] || s)).join(' · ')}
                  </p>
                  <TemplateSwatches spec={draft.spec} />
                  {draft.spec.description && <p className="text-xs text-slate-600">{draft.spec.description}</p>}
                  <p className="text-xs text-slate-500">
                    {draft.generated_by} · {t('{n} tokens', { n: draft.tokens.toLocaleString() })}
                  </p>
                  <Alert kind="info">{t('The design follows the website; the sample texts are new and the images will be the ones of the client: the texts and photos of the website are never copied.')}</Alert>
                  <Field label={t('Template name')}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
                  <Toggle checked={shared} onChange={setShared} label={t('Share with everyone')} description={t('The other users see it and can use it in their projects. Only you can change or delete it.')} />
                  {saved ? (
                    <Alert kind="success" title={t('Template saved')}>
                      {t('Open a project and choose "{name}" in its Template step: the site and the WordPress plugin are generated as usual.', { name: saved.name })}{' '}
                      <Link to="/projects" className="font-medium underline">
                        {t('Go to the projects')}
                      </Link>
                    </Alert>
                  ) : (
                    <div className="flex justify-end">
                      <Button variant="primary" icon={Save} onClick={save} disabled={busy || !name.trim()}>
                        {t('Save template')}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
