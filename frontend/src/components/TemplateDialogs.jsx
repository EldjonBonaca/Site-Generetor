/**
 * Template dialogs:
 *  - TemplateGenerator: the AI designs a template for a category (preview, regenerate, save);
 *  - TemplateEditor: change the design of a saved template (colors, fonts, layouts, icons, tone).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bot, Plus, RefreshCw, Save, Sparkles, X } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner, Textarea, Toggle } from './ui.jsx';
import { TemplatePreview, TemplateSwatches } from './TemplatePreview.jsx';

/** Sections of the Home page after the hero (spec.sections); the first five are always present. */
export const HOME_SECTION_LABELS = {
  about: 'About us',
  features: 'Why choose us',
  services: 'Services',
  gallery: 'Photo carousel',
  reviews: 'Reviews',
  cta: 'Call to action',
  stats: 'Key figures',
  process: 'How we work',
  faq: 'Frequently asked questions',
  highlights: 'Guarantees strip',
};
const REQUIRED_SECTIONS = ['about', 'features', 'services', 'gallery', 'reviews'];

/** Order of the Home sections: move them, add or remove the optional ones. */
function SectionsEditor({ value, onChange }) {
  const { t } = useT();
  const move = (i, d) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const missing = Object.keys(HOME_SECTION_LABELS).filter((s) => !value.includes(s));
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">{t('Home sections')}</p>
      <p className="mb-2 text-xs text-slate-500">{t('After the hero, in this order. About us, Why choose us, Services, Photo carousel and Reviews are always present.')}</p>
      <ol className="space-y-1">
        {value.map((s, i) => (
          <li key={s} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
            <span className="w-4 text-slate-400 tabular-nums">{i + 1}</span>
            <span className="flex-1">{t(HOME_SECTION_LABELS[s] || s)}</span>
            <button type="button" className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('Move up')}>
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={t('Move down')}>
              <ArrowDown className="size-3.5" />
            </button>
            {!REQUIRED_SECTIONS.includes(s) && (
              <button type="button" className="rounded p-0.5 text-slate-400 hover:text-red-600" onClick={() => onChange(value.filter((x) => x !== s))} aria-label={t('Remove')}>
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ol>
      {!!missing.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {missing.map((s) => (
            <button key={s} type="button" onClick={() => onChange([...value, s])} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-700">
              <Plus className="size-3" />
              {t(HOME_SECTION_LABELS[s])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const SECTION_LABELS = {
  header: 'Header',
  hero: 'Hero (Home)',
  divider: 'Edge of the hero and banners',
  about: 'About section',
  features: 'Why choose us',
  cta: 'Call to action',
  services: 'Services',
  testimonials: 'Reviews',
  contact: 'Contact page',
  footer: 'Footer',
  gallery: 'Gallery',
};

const VARIANT_LABELS = {
  'header.classic': 'Logo, menu and button',
  'header.centered': 'Centered logo and menu',
  'header.topbar': 'Top bar (phone, email) + menu',
  'header.bold': 'Colored header',
  'hero.center': 'Centered text over a photo',
  'hero.left': 'Left text over a photo',
  'hero.split': 'Text beside a photo',
  'hero.card': 'Text in a card over a photo',
  'hero.bottom': 'Big title at the bottom of a photo',
  'divider.curve': 'Curve',
  'divider.tilt': 'Slant',
  'divider.waves': 'Waves',
  'divider.none': 'Straight',
  'about.image-left': 'Image on the left',
  'about.image-right': 'Image on the right',
  'about.wide': 'Text above a wide photo',
  'features.icons': 'Cards on a light background',
  'features.cards': 'Cards over a photo',
  'features.list': 'List in two columns beside the title',
  'cta.banner': 'Banner over a photo',
  'cta.split': 'Rounded colored band with a button',
  'services.cards': 'Outlined cards',
  'services.boxed': 'Boxed cards on a tinted background',
  'services.overlay': 'Text over the photos',
  'testimonials.cards': 'Cards',
  'testimonials.minimal': 'Minimal',
  'testimonials.band': 'Colored band',
  'contact.split': 'Details beside the form',
  'contact.stacked': 'Details above the form',
  'footer.dark': 'Dark',
  'footer.light': 'Light',
  'footer.brand': 'Brand color',
  'gallery.3': '3 columns',
  'gallery.4': '4 columns',
};

/** Look of the whole site (spec.style options). */
export const STYLE_LABELS = { theme: 'Theme', buttons: 'Buttons', cards: 'Cards', titles: 'Section titles', align: 'Title alignment', scale: 'Title size', images: 'Images', titleCase: 'Title case' };
const STYLE_VALUE_LABELS = {
  'theme.light': 'Light pages',
  'theme.dark': 'Dark pages',
  'buttons.rounded': 'Rounded',
  'buttons.pill': 'Pill',
  'buttons.square': 'Square',
  'cards.shadow': 'With shadow',
  'cards.outline': 'Outlined',
  'cards.tinted': 'Tinted background',
  'cards.accent': 'Colored top border',
  'titles.line': 'Accent line below',
  'titles.bar': 'Colored bar on the left',
  'titles.plain': 'Plain',
  'align.center': 'Centered',
  'align.left': 'Left',
  'scale.normal': 'Normal',
  'scale.large': 'Large',
  'scale.xl': 'Very large',
  'images.rounded': 'Rounded corners',
  'images.square': 'Square corners',
  'images.framed': 'Offset color frame',
  'titleCase.normal': 'Normal',
  'titleCase.upper': 'Uppercase',
};
export const styleLabel = (t, key, value) => t(STYLE_VALUE_LABELS[`${key}.${value}`] || value);

const COLOR_LABELS = { primary: 'Primary', secondary: 'Secondary (buttons)', accent: 'Accent', heading: 'Titles', text: 'Text', background: 'Light background', dark: 'Dark (footer, overlays)' };
const SPACING_LABELS = { compact: 'Compact', normal: 'Normal', airy: 'Airy' };
const LANGUAGE_OPTIONS = { it: 'Italiano', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' };

export const variantLabel = (t, section, value) => t(VARIANT_LABELS[`${section}.${value}`] || value);

/** Generate a template for `category` with the AI, then save it. */
export function TemplateGenerator({ open, onClose, category, onSaved, onAnalyzed }) {
  const { t } = useT();
  const toast = useToast();
  const [providers, setProviders] = useState(null);
  const [providerId, setProviderId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [language, setLanguage] = useState('it');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [name, setName] = useState('');
  const [directions, setDirections] = useState([]);
  const [direction, setDirection] = useState('');
  // Drafts discarded in this dialog: a new generation avoids their direction and colors
  const [discarded, setDiscarded] = useState([]);

  useEffect(() => {
    if (!open) return;
    setDraft(null);
    setDiscarded([]);
    setInstructions('');
    api.get('/template-options').then((o) => setDirections(o.directions || [])).catch(() => {});
    api
      .get('/providers')
      .then((list) => {
        setProviders(list);
        setProviderId((id) => (list.some((p) => p.id === Number(id)) ? id : String(list[0]?.id ?? '')));
      })
      .catch((e) => toast(e.message, 'error'));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setBusy(true);
    try {
      const previous = draft ? [...discarded, draft] : discarded;
      const res = await api.post(`/template-categories/${category.id}/templates/generate`, {
        providerId: Number(providerId),
        instructions,
        language,
        direction,
        exclude: direction ? [] : previous.map((d) => d.direction.id),
        avoidColors: previous.map((d) => d.spec.style.colors.primary),
      });
      setDiscarded(previous);
      setDraft(res);
      if (res.analyzed) {
        toast(t('The AI analyzed the industry of the category first.'));
        onAnalyzed?.();
      }
      setName((n) => n || `${category.name} – ${t('template')} ${category.template_count + 1}`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const tpl = await api.post(`/template-categories/${category.id}/templates`, { name, spec: draft.spec, instructions, language, generated_by: draft.generated_by, tokens_used: draft.tokens });
      toast(t('Template "{name}" saved', { name: tpl.name }));
      onSaved?.(tpl);
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={t('Generate a template for "{name}"', { name: category?.name || '' })} size={draft ? 'xl' : 'md'}>
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
      ) : (
        <div className={draft ? 'grid gap-6 lg:grid-cols-[1fr_360px]' : ''}>
          {draft && (
            <div className="order-2 lg:order-1">
              <TemplatePreview spec={draft.spec} />
            </div>
          )}
          <div className="order-1 space-y-4 lg:order-2">
            <p className="text-sm text-slate-600">
              {t('The AI designs colors, fonts, the layout of every section, icons, tone of voice and sample texts for the businesses of this category. The structure of the site is always the one of the prompt.')}
            </p>
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
            <Field label={t('Style instructions (optional)')} hint={t('E.g. "elegant, dark colors, serif titles" or "bright and friendly".')}>
              {(id) => <Textarea id={id} rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} disabled={busy} />}
            </Field>
            <Field label={t('Design direction')} hint={t('Automatic: a style that no other template of this category uses yet, so every template looks different.')}>
              {(id) => (
                <Select id={id} value={direction} onChange={(e) => setDirection(e.target.value)} disabled={busy}>
                  <option value="">{t('Automatic (different from the other templates)')}</option>
                  {directions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {t(d.name)}
                    </option>
                  ))}
                </Select>
              )}
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
            {draft && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-sm font-medium text-slate-800">
                  {t('Direction')}: {t(draft.direction.name)}
                </p>
                <p className="text-xs text-slate-500">{t(draft.direction.summary)}</p>
                <p className="text-xs text-slate-600">
                  <span className="font-medium">{t('Home sections')}:</span> {draft.spec.sections.map((s) => t(HOME_SECTION_LABELS[s] || s)).join(' · ')}
                </p>
                <TemplateSwatches spec={draft.spec} />
                {draft.spec.description && <p className="text-xs text-slate-600">{draft.spec.description}</p>}
                <p className="text-xs text-slate-500">
                  {draft.generated_by} · {t('{n} tokens', { n: draft.tokens.toLocaleString() })}
                </p>
                <Field label={t('Template name')}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {draft ? (
                <>
                  <Button icon={RefreshCw} onClick={generate} loading={busy} disabled={!providerId}>
                    {t('Regenerate')}
                  </Button>
                  <Button variant="primary" icon={Save} onClick={save} disabled={busy || !name.trim()}>
                    {t('Save template')}
                  </Button>
                </>
              ) : (
                <Button variant="primary" icon={Sparkles} onClick={generate} loading={busy} disabled={!providerId}>
                  {busy ? t('Designing…') : t('Generate')}
                </Button>
              )}
            </div>
            {busy && <p className="text-right text-xs text-slate-500">{category?.profile ? t('This can take up to a minute.') : t('The AI first analyzes the industry of the category, then designs the template: this can take up to two minutes.')}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Edit the design of a saved template. */
export function TemplateEditor({ template, onClose, onSaved }) {
  const { t } = useT();
  const toast = useToast();
  const [options, setOptions] = useState(null);
  const [name, setName] = useState(template?.name || '');
  const [spec, setSpec] = useState(template?.spec || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setSpec(structuredClone(template.spec));
    api.get('/template-options').then(setOptions).catch((e) => toast(e.message, 'error'));
  }, [template]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStyle = (patch) => setSpec((s) => ({ ...s, style: { ...s.style, ...patch } }));
  const setColor = (key, value) => setSpec((s) => ({ ...s, style: { ...s.style, colors: { ...s.style.colors, [key]: value } } }));
  const setLayout = (key, value) => setSpec((s) => ({ ...s, layout: { ...s.layout, [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.patch(`/templates/${template.id}`, { name, spec });
      toast(t('Template saved'));
      onSaved?.(updated);
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!template}
      onClose={onClose}
      title={t('Edit template')}
      size="xl"
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!name.trim()}>
            {t('Save')}
          </Button>
        </>
      }
    >
      {!options || !spec ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="order-2 lg:order-1">
            <TemplatePreview spec={spec} />
            <p className="mt-2 text-xs text-slate-500">{t('Sketch of the Home page: the site uses your photos and the texts written for each project.')}</p>
          </div>
          <div className="order-1 space-y-5 lg:order-2">
            <Field label={t('Template name')}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">{t('Colors')}</p>
              <div className="grid grid-cols-2 gap-2">
                {options.colorKeys.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="color" value={spec.style.colors[k]} onChange={(e) => setColor(k, e.target.value.toUpperCase())} className="h-7 w-9 cursor-pointer rounded border border-slate-300" />
                    <span className="min-w-0">
                      <span className="block truncate">{t(COLOR_LABELS[k] || k)}</span>
                      <span className="font-mono text-[11px] text-slate-400">{spec.style.colors[k]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {['heading', 'body'].map((k) => (
                <Field key={k} label={k === 'heading' ? t('Title font') : t('Text font')}>
                  {(id) => (
                    <Select id={id} value={spec.style.fonts[k]} onChange={(e) => setStyle({ fonts: { ...spec.style.fonts, [k]: e.target.value } })}>
                      {options.fonts.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ))}
              <Field label={t('Title weight')}>
                {(id) => (
                  <Select id={id} value={spec.style.headingWeight} onChange={(e) => setStyle({ headingWeight: e.target.value })}>
                    {options.weights.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('Spacing')}>
                {(id) => (
                  <Select id={id} value={spec.style.spacing} onChange={(e) => setStyle({ spacing: e.target.value })}>
                    {options.spacings.map((s) => (
                      <option key={s} value={s}>
                        {t(SPACING_LABELS[s] || s)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label={`${t('Corner radius')}: ${spec.style.radius}px`}>
              {(id) => <input id={id} type="range" min="0" max="30" value={spec.style.radius} onChange={(e) => setStyle({ radius: Number(e.target.value) })} className="w-full accent-brand-600" />}
            </Field>
            <Toggle checked={spec.style.uppercase} onChange={(v) => setStyle({ uppercase: v })} label={t('Uppercase buttons and labels')} />

            <SectionsEditor value={spec.sections} onChange={(sections) => setSpec((s) => ({ ...s, sections }))} />

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">{t('Look of the site')}</p>
              {template?.direction_name && <p className="mb-2 text-xs text-slate-500">{t('Direction')}: {t(template.direction_name)}</p>}
              <div className="space-y-2">
                {Object.entries(options.styleOptions || {}).map(([key, values]) => (
                  <label key={key} className="grid grid-cols-[110px_1fr] items-center gap-2 text-xs text-slate-600">
                    {t(STYLE_LABELS[key] || key)}
                    <Select value={spec.style[key]} onChange={(e) => setStyle({ [key]: e.target.value })} className="py-1.5 text-xs">
                      {values.map((v) => (
                        <option key={v} value={v}>
                          {styleLabel(t, key, v)}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">{t('Layout of the sections')}</p>
              <div className="space-y-2">
                {Object.entries(options.layouts).map(([section, values]) => (
                  <label key={section} className="grid grid-cols-[110px_1fr] items-center gap-2 text-xs text-slate-600">
                    {t(SECTION_LABELS[section] || section)}
                    <Select value={spec.layout[section]} onChange={(e) => setLayout(section, e.target.value)} className="py-1.5 text-xs">
                      {values.map((v) => (
                        <option key={v} value={v}>
                          {variantLabel(t, section, v)}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">{t('Icons of "Why choose us"')}</p>
              <div className="grid grid-cols-2 gap-2">
                {spec.icons.map((icon, i) => (
                  <Select key={i} value={icon} onChange={(e) => setSpec((s) => ({ ...s, icons: s.icons.map((x, j) => (j === i ? e.target.value : x)) }))} className="py-1.5 text-xs" aria-label={`${t('Icon')} ${i + 1}`}>
                    {options.icons.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic.replace('fas fa-', '')}
                      </option>
                    ))}
                  </Select>
                ))}
              </div>
            </div>

            <Field label={t('Tone of voice')} hint={t('Given to the AI when it writes the texts of each site.')}>
              {(id) => <Input id={id} value={spec.tone} onChange={(e) => setSpec((s) => ({ ...s, tone: e.target.value }))} maxLength={300} />}
            </Field>
            {template?.generated_by && (
              <Alert kind="info">
                {t('Generated by {provider}', { provider: template.generated_by })}
                {template.instructions ? ` · “${template.instructions}”` : ''}
              </Alert>
            )}
            <Badge>{t('Sample texts: {lang}', { lang: LANGUAGE_OPTIONS[template?.language] || template?.language })}</Badge>
          </div>
        </div>
      )}
    </Modal>
  );
}
