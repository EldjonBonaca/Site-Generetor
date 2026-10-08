import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { useToast } from '../../components/Toast.jsx';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, Field, Input, SaveStatus, Select, Textarea } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
export const isPhone = (v) => {
  const s = String(v || '').trim();
  const digits = s.replace(/\D/g, '').length;
  return /^\+?[\d\s().-]{6,25}$/.test(s) && digits >= 6 && digits <= 20;
};

const FIELDS = ['site_name', 'phone', 'email', 'address', 'city', 'industry', 'language', 'notes', 'copyright'];

export default function SiteDataStep({ project, setProject }) {
  const { t } = useT();
  const toast = useToast();
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((f) => [f, project[f] ?? ''])));
  const [touched, setTouched] = useState({});
  const [languages, setLanguages] = useState({ en: 'English' });

  useEffect(() => {
    api.get('/languages').then(setLanguages).catch(() => {});
  }, []);

  const { schedule, status } = useAutosave(async (patch) => {
    try {
      setProject(await api.patch(`/projects/${project.id}`, patch));
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  });

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    schedule({ [key]: value });
  };
  const blur = (key) => () => setTouched((x) => ({ ...x, [key]: true }));

  const errors = {
    site_name: !form.site_name.trim() && t('Required'),
    phone: !isPhone(form.phone) && t('Enter a valid phone number (digits, spaces, + ( ) - allowed)'),
    email: !isEmail(form.email) && t('Enter a valid email address'),
    address: !form.address.trim() && t('Required'),
  };
  const err = (k) => (touched[k] ? errors[k] || null : null);

  return (
    <>
      <StepIssues project={project} step="site" t={t} />
      <Card title={t('Site data')} description={t('Business information used in every page and inserted in phone/email links.')} actions={<SaveStatus status={status} t={t} />}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('Site name')} required error={err('site_name')}>
            {(id) => <Input id={id} value={form.site_name} onChange={set('site_name')} onBlur={blur('site_name')} placeholder="Rossi Plumbing" invalid={!!err('site_name')} />}
          </Field>
          <Field label={t('Site language')} required>
            {(id) => (
              <Select id={id} value={form.language} onChange={set('language')}>
                {Object.entries(languages).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code.toUpperCase()})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('Phone number')} required error={err('phone')}>
            {(id) => <Input id={id} type="tel" value={form.phone} onChange={set('phone')} onBlur={blur('phone')} placeholder="+44 20 7946 0958" invalid={!!err('phone')} />}
          </Field>
          <Field label={t('Email')} required error={err('email')}>
            {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} onBlur={blur('email')} placeholder="info@example.com" invalid={!!err('email')} />}
          </Field>
          <Field label={t('Address')} required error={err('address')} className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} value={form.address} onChange={set('address')} onBlur={blur('address')} placeholder="1 High Street&#10;London W1 1AA" />}
          </Field>
          <Field label={t('City / Service area')}>
            {(id) => <Input id={id} value={form.city} onChange={set('city')} placeholder="London" />}
          </Field>
          <Field label={t('Industry / business type')}>
            {(id) => <Input id={id} value={form.industry} onChange={set('industry')} placeholder="Plumber" />}
          </Field>
          <Field
            label={t('Copyright (footer)')}
            hint={t('Leave empty for "© {year} {name}. All rights reserved." in the site language.', { year: new Date().getFullYear(), name: form.site_name || t('Site name') })}
            className="sm:col-span-2"
          >
            {(id) => <Input id={id} value={form.copyright} onChange={set('copyright')} placeholder={`© ${new Date().getFullYear()} ${form.site_name || 'Rossi S.r.l.'} – P.IVA 01234567890`} />}
          </Field>
          <Field label={t('Additional notes for the AI')} hint={t('Tone of voice, strengths, years of experience, things to avoid…')} className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={4} value={form.notes} onChange={set('notes')} />}
          </Field>
        </div>
      </Card>
      <ReviewsCard project={project} setProject={setProject} />
    </>
  );
}

const MAX_REVIEWS = 9;

/** Real customer reviews shown on the Home page (built-in layout). The AI never writes reviews. */
function ReviewsCard({ project, setProject }) {
  const { t } = useT();
  const toast = useToast();
  const [reviews, setReviews] = useState(() => project.settings?.reviews || []);
  const { schedule, status } = useAutosave(async ({ reviews: list }) => {
    try {
      setProject(await api.patch(`/projects/${project.id}`, { settings: { reviews: list } }));
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  });
  const update = (next) => {
    setReviews(next);
    schedule({ reviews: next });
  };
  const setAt = (i, key) => (e) => update(reviews.map((r, j) => (j === i ? { ...r, [key]: e.target.value } : r)));

  return (
    <Card
      className="mt-6"
      title={t('Customer reviews')}
      description={t('Real reviews (e.g. copied from Google). They are shown on the Home page; with no reviews the section is not created. The AI never invents reviews.')}
      actions={<SaveStatus status={status} t={t} />}
    >
      <div className="space-y-4">
        {reviews.map((r, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
            <Input aria-label={t('Name')} value={r.name || ''} onChange={setAt(i, 'name')} placeholder={t('Name')} />
            <Input aria-label={t('Detail (optional)')} value={r.role || ''} onChange={setAt(i, 'role')} placeholder={t('Detail (optional)')} />
            <Button size="sm" icon={Trash2} onClick={() => update(reviews.filter((_, j) => j !== i))} aria-label={t('Remove')}>
              {t('Remove')}
            </Button>
            <Textarea aria-label={t('Review')} rows={2} value={r.text || ''} onChange={setAt(i, 'text')} placeholder={t('Review')} className="sm:col-span-3" />
          </div>
        ))}
        {reviews.length < MAX_REVIEWS && (
          <Button size="sm" icon={Plus} onClick={() => update([...reviews, { name: '', role: '', text: '' }])}>
            {t('Add review')}
          </Button>
        )}
      </div>
    </Card>
  );
}
