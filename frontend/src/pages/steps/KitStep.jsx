import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ImageIcon, LayoutTemplate, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { Alert, Badge, Button, Card, Dropzone, Field, IconButton, Input, SaveStatus, Select, Spinner, Toggle, cx } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';
import { formatDate } from '../ProjectsPage.jsx';

export const PAGE_ROLE_LABELS = {
  home: 'Home page',
  about: 'About (Chi Siamo)',
  services: 'Services overview (all services)',
  gallery: 'Gallery (all photos)',
  contact: 'Contact',
  single_post: 'Single post template (articles)',
  header: 'Header',
  footer: 'Footer',
  ignore: 'Ignore (not generated)',
};

export const SLOT_ROLE_LABELS = {
  hero: 'Home hero image',
  subheader: 'Subheader image',
  service_list: 'Image of the card’s service',
  logo: 'Logo',
  gallery: 'Gallery images',
  keep: 'Keep original',
  remove: 'Remove image',
};

export default function KitStep({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const [kits, setKits] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [changing, setChanging] = useState(false);

  const loadMapping = useCallback(() => api.get(`/projects/${project.id}/kit-mapping`).then(setMapping), [project.id]);

  useEffect(() => {
    api.get('/kits').then(setKits).catch((e) => toast(e.message, 'error'));
    loadMapping().catch((e) => toast(e.message, 'error'));
  }, [loadMapping]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectKit = async (kitId) => {
    try {
      await api.put(`/projects/${project.id}/kit`, { kit_id: kitId });
      setChanging(false);
      await Promise.all([loadMapping(), reload()]);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const uploadKit = async ([file]) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const kit = await api.upload('/kits', fd);
      toast(t('Kit "{name}" uploaded: {n} templates found', { name: kit.name, n: kit.templates.length }));
      setKits((k) => [kit, ...(k || [])]);
      await selectKit(kit.id);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const saveMapping = async (templateId, patch) => {
    try {
      await api.put(`/projects/${project.id}/kit-mapping`, { template_id: templateId, ...patch });
      await Promise.all([loadMapping(), reload()]);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!kits || !mapping) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const showPicker = !mapping.kit || changing;

  return (
    <>
      <StepIssues project={project} step="kit" t={t} />

      {showPicker ? (
        <Card
          title={t('Choose an Elementor Template Kit')}
          description={t('Kits are saved in the library and can be reused by other projects. The original kit is never modified.')}
          actions={
            mapping.kit && (
              <Button size="sm" icon={X} onClick={() => setChanging(false)}>
                {t('Cancel')}
              </Button>
            )
          }
        >
          <Dropzone accept=".zip,application/zip" onFiles={uploadKit} busy={uploading} title={t('Upload a kit .zip')} hint={t('Template Kit (manifest.json + templates/) or Elementor Website Kit export')} />
          {kits.length > 0 && (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {kits.map((k) => (
                <li key={k.id} className={cx('flex items-center justify-between gap-3 rounded-lg border p-3', k.id === project.kit_id ? 'border-brand-300 bg-brand-50/50' : 'border-slate-200')}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{k.name}</p>
                    <p className="text-xs text-slate-500">
                      {k.template_count} {t('templates')} · {k.format} · {formatDate(k.created_at)}
                    </p>
                  </div>
                  <Button size="sm" variant={k.id === project.kit_id ? 'secondary' : 'primary'} onClick={() => selectKit(k.id)} disabled={k.id === project.kit_id}>
                    {k.id === project.kit_id ? t('Selected') : t('Use')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <Card
            title={mapping.kit.name}
            description={t('The site has 5 pages: Home, About, Services, Gallery and Contact. Map one template to each of them (plus header, footer and single post) and uncheck the sections that must not appear on the site.')}
            actions={
              <>
                <Badge color="blue">{mapping.kit.format}</Badge>
                <Button size="sm" icon={LayoutTemplate} onClick={() => setChanging(true)}>
                  {t('Change kit')}
                </Button>
              </>
            }
            padded={false}
          >
            {mapping.kit.required_plugins?.length > 0 && (
              <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">
                {t('Required plugins')}: {mapping.kit.required_plugins.map((p) => p.name || p).join(', ')}
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {mapping.templates.map((tpl) => (
                <TemplateRow key={tpl.id} kitId={mapping.kit.id} tpl={tpl} pageRoles={mapping.pageRoles} slotRoles={mapping.slotRoles} onSave={(patch) => saveMapping(tpl.id, patch)} />
              ))}
            </ul>
          </Card>
          <SiteStructureCard project={project} reload={async () => (await Promise.all([reload(), loadMapping()]))[0]} />
          <DemoValuesCard project={project} contacts={mapping.kit.contacts} reload={reload} />
        </div>
      )}
    </>
  );
}

function TemplateRow({ kitId, tpl, pageRoles, slotRoles, onSave }) {
  const { t } = useT();
  const [open, setOpen] = useState(null); // null | 'images' | 'sections'
  const active = tpl.role !== 'ignore';
  const removed = (tpl.sections || []).filter((s) => s.removed).map((s) => s.id);
  const toggleSection = (id) => onSave({ removed_sections: removed.includes(id) ? removed.filter((x) => x !== id) : [...removed, id] });
  const toggle = (what) => setOpen((o) => (o === what ? null : what));
  const widgetCount = Object.values(tpl.widgets || {}).reduce((a, b) => a + b, 0);

  return (
    <li className={cx('px-5 py-3.5', !active && 'bg-slate-50/60')}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="checker h-14 w-20 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-200">
          {tpl.screenshot ? (
            <img src={`/api/kits/${kitId}/asset?path=${encodeURIComponent(tpl.screenshot)}`} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center bg-slate-100">
              <LayoutTemplate className="size-5 text-slate-300" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cx('truncate text-sm font-medium', active ? 'text-slate-900' : 'text-slate-500')}>{tpl.title}</p>
          <p className="text-xs text-slate-500">
            {tpl.type} · {tpl.fieldCount} {t('text fields')} · {tpl.slotCount} {t('images')} · {widgetCount} {t('widgets')}
            {!tpl.valid && <span className="text-red-600"> · {t('invalid JSON')}</span>}
          </p>
        </div>
        <Select value={tpl.role} onChange={(e) => onSave({ page_role: e.target.value })} className="w-auto min-w-56" aria-label={t('Role')} disabled={!tpl.valid}>
          {pageRoles.map((r) => (
            <option key={r} value={r}>
              {t(PAGE_ROLE_LABELS[r])}
            </option>
          ))}
        </Select>
        {active && tpl.sections?.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => toggle('sections')}>
            {open === 'sections' ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {t('Sections ({n})', { n: tpl.sections.length - removed.length })}
          </Button>
        )}
        {active && tpl.slots.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => toggle('images')}>
            {open === 'images' ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {t('Images ({n})', { n: tpl.slots.length })}
          </Button>
        )}
      </div>
      {active && tpl.cardCount > 0 && (
        <p className="mt-2 ml-24 text-xs text-brand-700">
          {tpl.role === 'services'
            ? t('→ service grid adapted to {n} cards (one per service, linked to its article)', { n: tpl.cardCount })
            : t('→ {n} featured service cards (title, image and link of each service)', { n: tpl.cardCount })}
        </p>
      )}
      {open === 'sections' && (
        <div className="mt-3 rounded-lg border border-slate-200 sm:ml-24">
          <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">{t('Uncheck the sections that must not appear on the site.')}</p>
          <ul className="divide-y divide-slate-100">
            {tpl.sections.map((s) => (
              <li key={s.id}>
                <label className={cx('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', s.removed && 'bg-slate-50 text-slate-400')}>
                  <input type="checkbox" checked={!s.removed} onChange={() => toggleSection(s.id)} className="accent-brand-600" />
                  <span className="w-6 text-xs text-slate-400">#{s.index + 1}</span>
                  <span className={cx('min-w-0 flex-1 truncate', s.removed && 'line-through')}>{s.label}</span>
                  <span className="hidden truncate text-xs text-slate-400 md:inline">{s.widgets.join(', ')}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open === 'images' && (
        <div className="mt-3 ml-0 overflow-x-auto rounded-lg border border-slate-200 sm:ml-24">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t('Image in template')}</th>
                <th className="px-3 py-2 font-medium">{t('Section')}</th>
                <th className="px-3 py-2 font-medium">{t('Replace with')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tpl.slots.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <ImageIcon className="size-4 shrink-0 text-slate-400" />
                      <span className="min-w-0">
                        <span className="block text-slate-700">{s.label}</span>
                        {/* Demo images are not loaded: no requests to external servers */}
                        <span className="block max-w-xs truncate text-xs text-slate-400" title={s.url}>
                          {s.url.split('/').pop()}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">#{s.section + 1}</td>
                  <td className="px-3 py-2">
                    <Select value={tpl.slotRoles[s.id] || 'keep'} onChange={(e) => onSave({ image_slots: { [s.id]: e.target.value } })} className="py-1.5">
                      {slotRoles.map((r) => (
                        <option key={r} value={r}>
                          {t(SLOT_ROLE_LABELS[r])}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/** Demo values of the kit (brand, phones, emails, address) replaced by the project data. */
function DemoValuesCard({ project, contacts, reload }) {
  const { t } = useT();
  const toast = useToast();
  const [dv, setDv] = useState(project.settings.demoValues);
  const { schedule, status } = useAutosave(async (patch) => {
    try {
      await api.patch(`/projects/${project.id}`, { settings: { demoValues: patch.demoValues } });
      reload();
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  });
  const update = (next) => {
    setDv(next);
    schedule({ demoValues: next });
  };
  const toggleIgnored = (value) => {
    const ignored = dv.ignored.includes(value) ? dv.ignored.filter((x) => x !== value) : [...dv.ignored, value];
    update({ ...dv, ignored });
  };
  const detected = [...(contacts?.phones || []).map((v) => ['phone', v]), ...(contacts?.emails || []).map((v) => ['email', v])];

  return (
    <Card title={t('Demo values to replace')} description={t('Text of the kit demo that must become your data everywhere (texts and tel:/mailto: links).')} actions={<SaveStatus status={status} t={t} />}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={t('Demo brand name in the kit')} hint={t('Replaced by "{name}"', { name: project.site_name || t('site name') })}>
          {(id) => <Input id={id} value={dv.brand} onChange={(e) => update({ ...dv, brand: e.target.value })} placeholder="Plumbix" />}
        </Field>
        <Field label={t('Demo address in the kit')} hint={t('Replaced by your address')}>
          {(id) => <Input id={id} value={dv.address} onChange={(e) => update({ ...dv, address: e.target.value })} placeholder="123 Demo Street" />}
        </Field>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-slate-700">{t('Detected phones and emails')}</p>
        {!detected.length ? (
          <p className="text-sm text-slate-500">{t('None detected.')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {detected.map(([kind, v]) => (
              <li key={v}>
                <label className={cx('inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm', dv.ignored.includes(v) ? 'border-slate-200 text-slate-400 line-through' : 'border-slate-300 text-slate-700')}>
                  <input type="checkbox" checked={!dv.ignored.includes(v)} onChange={() => toggleIgnored(v)} className="accent-brand-600" />
                  {v}
                  <span className="text-xs text-slate-400 no-underline">→ {kind === 'phone' ? project.phone || '?' : project.email || '?'}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-slate-700">{t('Custom replacements')}</p>
        <ul className="space-y-2">
          {dv.custom.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input value={c.from} placeholder={t('Text in the kit')} onChange={(e) => update({ ...dv, custom: dv.custom.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
              <span className="text-slate-400">→</span>
              <Input value={c.to} placeholder={t('Replacement')} onChange={(e) => update({ ...dv, custom: dv.custom.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
              <IconButton icon={Trash2} label={t('Delete')} onClick={() => update({ ...dv, custom: dv.custom.filter((_, j) => j !== i) })} />
            </li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => update({ ...dv, custom: [...dv.custom, { from: '', to: '' }] })}>
          {t('Add replacement')}
        </Button>
      </div>
      <Alert kind="info" className="mt-5">
        {t('Texts that are only a phone number or an email are filled automatically and not sent to the AI.')}{' '}
        <Link to="../site" className="font-medium underline">
          {t('Edit site data')}
        </Link>
      </Alert>
    </Card>
  );
}

/** Contact page + menu (services are always published as articles). */
function SiteStructureCard({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const s = project.settings;
  const [shortcode, setShortcode] = useState(s.contactShortcode);
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
    <Card title={t('Site structure')} description={t('Contact page and navigation menu.')} actions={<SaveStatus status={status} t={t} />}>
      <p className="text-sm text-slate-600">
        {t('Services are published as WordPress articles (one per service, in the services category, with featured image), shown by the "Single post template" of the kit. They are not extra pages: the site has only Home, About, Services, Gallery and Contact.')}
      </p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Field label={t('Contact form shortcode')} hint={t('Placed in a Shortcode widget on the contact page (replaces the form of the template). The WordPress plugin creates the form in Contact Form 7 and replaces INSERIRE_ID by itself.')}>
          {(id) => (
            <Input
              id={id}
              value={shortcode}
              onChange={(e) => {
                setShortcode(e.target.value);
                schedule({ contactShortcode: e.target.value });
              }}
              className="font-mono text-xs"
            />
          )}
        </Field>
        <Field label={t('Menu name')} hint={t('Created by the WordPress plugin (or wordpress-import.xml) and assigned to the menu widget of the header.')}>
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
        <Toggle checked={s.mapEmbed} onChange={(v) => save({ mapEmbed: v })} label={t('Google Maps on the contact page')} description={t('The map widget of the template gets your address; if the template has none, a map (iframe) is added.')} />
      </div>
    </Card>
  );
}
