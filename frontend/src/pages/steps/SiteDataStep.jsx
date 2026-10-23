import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { useToast } from '../../components/Toast.jsx';
import { Card, Field, Input, SaveStatus, Select, Textarea, Toggle } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
export const isPhone = (v) => {
  const s = String(v || '').trim();
  const digits = s.replace(/\D/g, '').length;
  return /^\+?[\d\s().-]{6,25}$/.test(s) && digits >= 6 && digits <= 20;
};

/** Link of Google Maps / Google Business Profile, or the <iframe> of "Share → Embed a map" (same check as backend/src/lib/maps.js). */
export const isGoogleMapsLink = (v) => {
  const s = String(v || '').trim();
  const link = (s.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i)?.[1] || s).replace(/&amp;/g, '&');
  try {
    const url = new URL(link);
    return /^https?:$/.test(url.protocol) && /(^|\.)google\.(com|co|[a-z]{2})(\.[a-z]{2})?$|(^|\.)goo\.gl$|^g\.page$|^g\.co$|^share\.google$/i.test(url.hostname);
  } catch {
    return false;
  }
};

const NOTES_MAX = 5000; // same limit as the API (routes/projects.js)
/** Social networks (all optional): icons in the footer of the site (same list as backend/src/lib/socials.js). */
const SOCIALS = [
  { key: 'facebook_url', name: 'Facebook', placeholder: 'https://www.facebook.com/…' },
  { key: 'instagram_url', name: 'Instagram', placeholder: 'https://www.instagram.com/…' },
  { key: 'linkedin_url', name: 'LinkedIn', placeholder: 'https://www.linkedin.com/company/…' },
  { key: 'youtube_url', name: 'YouTube', placeholder: 'https://www.youtube.com/@…' },
  { key: 'tiktok_url', name: 'TikTok', placeholder: 'https://www.tiktok.com/@…' },
  { key: 'x_url', name: 'X (Twitter)', placeholder: 'https://x.com/…' },
];
const isUrl = (v) => {
  try {
    return /^https?:$/.test(new URL(String(v || '').trim()).protocol);
  } catch {
    return false;
  }
};
const FIELDS = ['site_name', 'phone', 'phone2', 'email', 'address', 'google_business_url', 'city', 'industry', 'language', 'notes', 'copyright', 'vat_number', 'whatsapp_enabled', 'whatsapp_number', ...SOCIALS.map((s) => s.key)];

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
    // Optional fields: checked only when filled in
    phone2: form.phone2.trim() && !isPhone(form.phone2) && t('Enter a valid phone number (digits, spaces, + ( ) - allowed)'),
    whatsapp_number: form.whatsapp_enabled === '1' && !isPhone(form.whatsapp_number) && t('Enter the WhatsApp number, with the country code (e.g. +39 333 123 4567)'),
    email: !isEmail(form.email) && t('Enter a valid email address'),
    address: !form.address.trim() && t('Required'),
    google_business_url: form.google_business_url.trim() && !isGoogleMapsLink(form.google_business_url) && t('This is not a Google Maps link: the map will show the business name and address.'),
    ...Object.fromEntries(SOCIALS.map((s) => [s.key, form[s.key].trim() && !isUrl(form[s.key]) && t('Enter the full link, starting with https://')])),
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
          <Field label={t('Second phone number')} hint={t('Optional: shown next to the first one (contacts, footer, articles).')} error={err('phone2')}>
            {(id) => <Input id={id} type="tel" value={form.phone2} onChange={set('phone2')} onBlur={blur('phone2')} placeholder="+44 7700 900123" invalid={!!err('phone2')} />}
          </Field>
          <div className="space-y-3 rounded-lg border border-slate-200 p-4 sm:col-span-2">
            <Toggle
              checked={form.whatsapp_enabled === '1'}
              onChange={(on) => {
                // The first time, the number is the phone of the business
                const patch = { whatsapp_enabled: on ? '1' : '', ...(on && !form.whatsapp_number.trim() && form.phone.trim() ? { whatsapp_number: form.phone } : {}) };
                setForm((f) => ({ ...f, ...patch }));
                schedule(patch);
              }}
              label={t('WhatsApp button')}
              description={t('Optional: the WordPress plugin installs and activates Joinchat with this number (green WhatsApp button on every page).')}
            />
            {form.whatsapp_enabled === '1' && (
              <Field label={t('WhatsApp number')} hint={t('With the country code, e.g. +39 333 123 4567 (without it, the code of the site language is added).')} error={err('whatsapp_number')}>
                {(id) => <Input id={id} type="tel" value={form.whatsapp_number} onChange={set('whatsapp_number')} onBlur={blur('whatsapp_number')} placeholder="+39 333 123 4567" invalid={!!err('whatsapp_number')} />}
              </Field>
            )}
          </div>
          <Field label={t('Email')} required error={err('email')}>
            {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} onBlur={blur('email')} placeholder="info@example.com" invalid={!!err('email')} />}
          </Field>
          <Field label={t('City / Service area')}>
            {(id) => <Input id={id} value={form.city} onChange={set('city')} placeholder="London" />}
          </Field>
          <Field label={t('Address')} required error={err('address')}>
            {(id) => <Textarea id={id} rows={2} value={form.address} onChange={set('address')} onBlur={blur('address')} placeholder="1 High Street&#10;London W1 1AA" />}
          </Field>
          <Field
            label={t('Google Business Profile link')}
            hint={t('Optional: the link of the business on Google Maps (Share → Copy link), or the code of Share → Embed a map. The map of the Contact page shows this listing.')}
            error={err('google_business_url')}
          >
            {(id) => (
              <Input
                id={id}
                value={form.google_business_url}
                onChange={set('google_business_url')}
                onBlur={blur('google_business_url')}
                placeholder="https://maps.app.goo.gl/…"
                invalid={!!err('google_business_url')}
              />
            )}
          </Field>
          <Field label={t('Industry / business type')}>
            {(id) => <Input id={id} value={form.industry} onChange={set('industry')} placeholder="Plumber" />}
          </Field>
          <Field label={t('VAT number (P.IVA)')} hint={t('Shown in the copyright line of the footer. Until it is filled in the footer shows "P.IVA 123456".')}>
            {(id) => <Input id={id} value={form.vat_number} onChange={set('vat_number')} placeholder="01234567890" />}
          </Field>
          <Field
            label={t('Copyright (footer)')}
            hint={t('Leave empty for the default line: "Creato da Local Web – Agenzia Web Marketing Milano Copyrights © {year} {name} - P.IVA {vat} | Tutti i diritti riservati." (with the link to localweb.it). Links (<a href="https://…">) are allowed.', {
              year: new Date().getFullYear(),
              name: form.site_name || t('Site name'),
              vat: form.vat_number || '123456',
            })}
            className="sm:col-span-2"
          >
            {(id) => <Input id={id} value={form.copyright} onChange={set('copyright')} placeholder={`Copyrights © ${new Date().getFullYear()} ${form.site_name || 'Rossi S.r.l.'} - P.IVA ${form.vat_number || '01234567890'} | Tutti i diritti riservati.`} />}
          </Field>
          <Field
            label={t('Additional notes for the AI')}
            hint={t('Instructions the AI must follow in every text of the site (and in the templates generated for it): tone of voice, strengths, years of experience, things to avoid… ({n}/{max} characters)', { n: form.notes.length, max: NOTES_MAX })}
            className="sm:col-span-2"
          >
            {(id) => <Textarea id={id} rows={4} value={form.notes} onChange={set('notes')} maxLength={NOTES_MAX} />}
          </Field>
        </div>
      </Card>
      <Card title={t('Social networks')} description={t('Optional: fill in only the ones the business has. They are shown as icons in the footer of the site (and given to Yoast SEO).')} className="mt-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {SOCIALS.map((s) => (
            <Field key={s.key} label={s.name} error={err(s.key)}>
              {(id) => <Input id={id} type="url" value={form[s.key]} onChange={set(s.key)} onBlur={blur(s.key)} placeholder={s.placeholder} invalid={!!err(s.key)} />}
            </Field>
          ))}
        </div>
      </Card>
    </>
  );
}
