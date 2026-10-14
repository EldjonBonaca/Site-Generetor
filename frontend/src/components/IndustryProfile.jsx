/**
 * Industry analysis of a template category (backend/src/templates/industry.js): what the AI knows
 * about the business, its customers and the websites of the industry, the Home sections it
 * recommends and the design directions that suit it. Done automatically before the first template
 * of the category, or on demand here.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, ScanSearch } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Badge, Button, Select } from './ui.jsx';
import { HOME_SECTION_LABELS } from './TemplateDialogs.jsx';

export function IndustryProfile({ category, onAnalyzed }) {
  const { t } = useT();
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [directions, setDirections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const profile = category.profile;

  useEffect(() => {
    api
      .get('/providers')
      .then((list) => {
        setProviders(list);
        setProviderId((id) => id || String(list[0]?.id ?? ''));
      })
      .catch(() => {});
    api
      .get('/template-options')
      .then((o) => setDirections(o.directions || []))
      .catch(() => {});
  }, []);

  const analyze = async () => {
    setBusy(true);
    try {
      await api.post(`/template-categories/${category.id}/analyze`, { providerId: Number(providerId) });
      toast(t('Industry analysis updated'));
      setOpen(true);
      await onAnalyzed?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const directionName = (id) => t(directions.find((d) => d.id === id)?.name || id);

  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <ScanSearch className="size-4 text-brand-600" />
            {t('Industry analysis')}
            {profile ? <Badge color="green">{t('Done')}</Badge> : <Badge>{t('Not done yet')}</Badge>}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {profile
              ? t('The AI analyzed the category: every template follows the conventions of the industry, with a different design.')
              : t('Before the first template the AI analyzes the category: business, customers, design conventions of the industry, recommended sections.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {providers.length > 1 && (
            <Select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="h-8 w-auto py-1 text-xs" aria-label={t('AI provider')} disabled={busy}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
          {profile && (
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? t('Hide') : t('Show')}
            </Button>
          )}
          <Button size="sm" icon={profile ? RefreshCw : ScanSearch} onClick={analyze} loading={busy} disabled={!providerId}>
            {profile ? t('Analyze again') : t('Analyze now')}
          </Button>
        </div>
      </div>

      {profile && open && (
        <div className="mt-4 grid gap-4 text-sm text-slate-700 md:grid-cols-2">
          <div className="space-y-3">
            {profile.business && (
              <p>
                <span className="font-medium text-slate-900">{t('Business')}: </span>
                {profile.business}
              </p>
            )}
            {profile.audience && (
              <p>
                <span className="font-medium text-slate-900">{t('Customers')}: </span>
                {profile.audience}
              </p>
            )}
            {!!profile.services.length && (
              <p>
                <span className="font-medium text-slate-900">{t('Typical services')}: </span>
                {profile.services.join(', ')}
              </p>
            )}
            {!!profile.trust.length && (
              <p>
                <span className="font-medium text-slate-900">{t('Trust signals')}: </span>
                {profile.trust.join(' · ')}
              </p>
            )}
            {profile.palette && (
              <p>
                <span className="font-medium text-slate-900">{t('Colors')}: </span>
                {profile.palette}
              </p>
            )}
          </div>
          <div className="space-y-3">
            {!!profile.conventions.length && (
              <div>
                <p className="font-medium text-slate-900">{t('Design conventions of the industry')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                  {profile.conventions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="font-medium text-slate-900">{t('Recommended Home sections')}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {profile.sections.map((s) => (
                  <Badge key={s}>{t(HOME_SECTION_LABELS[s] || s)}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="font-medium text-slate-900">{t('Suitable design directions')}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {profile.directions.map((d) => (
                  <Badge key={d} color="blue">
                    {directionName(d)}
                  </Badge>
                ))}
              </div>
            </div>
            {profile.analyzed_by && <p className="text-xs text-slate-400">{profile.analyzed_by}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
